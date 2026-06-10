import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { resolvePortalToken } from '@/lib/portal';
import { nextStatus } from '@/lib/state';
import { logAudit } from '@/lib/audit';
import type { AppraisalStatus } from '@/lib/status';

export const dynamic = 'force-dynamic';

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as
    { token?: string; choice?: string; remarks?: string; signed_name?: string } | null;
  const choice = b?.choice;
  if (!b?.token || !choice || !['agree', 'agree_remarks', 'disagree'].includes(choice) || !b?.signed_name) {
    return NextResponse.json({ error: 'choice and signed name required' }, { status: 400 });
  }
  if (choice !== 'agree' && !b.remarks?.trim()) {
    return NextResponse.json({ error: 'remarks are required for this choice' }, { status: 400 });
  }
  const t = await resolvePortalToken(b.token);
  if (!t || t.role !== 'employee') return NextResponse.json({ error: 'invalid link' }, { status: 401 });

  const db = sql();
  const rows = (await db`
    SELECT a.id, a.status, e.full_name FROM appraisal a JOIN employee e ON e.id = a.employee_id
    WHERE a.cycle_id = ${t.cycle_id} AND a.employee_id = ${t.holder_id}`) as
    { id: string; status: AppraisalStatus; full_name: string }[];
  const ap = rows[0];
  if (!ap) return NextResponse.json({ error: 'appraisal not found' }, { status: 404 });
  if (ap.status !== 'discussed') return NextResponse.json({ error: 'not ready for sign-off' }, { status: 409 });
  if (norm(b.signed_name) !== norm(ap.full_name)) {
    return NextResponse.json({ error: 'typed name must match your name on record exactly' }, { status: 400 });
  }

  const action = choice === 'agree' ? 'concur_agree' : choice === 'agree_remarks' ? 'concur_remarks' : 'concur_disagree';
  const to = nextStatus(ap.status, action);
  await db`INSERT INTO concurrence (appraisal_id, choice, remarks, signed_name)
           VALUES (${ap.id}, ${choice}, ${b.remarks?.trim() || null}, ${b.signed_name.trim()})
           ON CONFLICT (appraisal_id) DO NOTHING`;
  await db`UPDATE appraisal SET status = ${to} WHERE id = ${ap.id} AND status = 'discussed'`;
  await logAudit({ actorType: 'employee', actorLabel: `emp#${t.holder_id}`, action: `concur_${choice}`, appraisalId: ap.id });
  return NextResponse.json({ ok: true, status: to });
}
