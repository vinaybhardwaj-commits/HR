import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { resolvePortalToken } from '@/lib/portal';
import { nextStatus } from '@/lib/state';
import { logAudit } from '@/lib/audit';
import type { AppraisalStatus } from '@/lib/status';

export const dynamic = 'force-dynamic';

type Body = { token?: string; answers?: Record<string, unknown>; submit?: boolean };

async function handle(req: NextRequest) {
  const b = await req.json().catch(() => null) as Body | null;
  const t = b?.token ? await resolvePortalToken(b.token) : null;
  if (!t || t.role !== 'employee') return NextResponse.json({ error: 'invalid link' }, { status: 401 });

  const db = sql();
  const rows = (await db`SELECT id, status FROM appraisal
    WHERE cycle_id = ${t.cycle_id} AND employee_id = ${t.holder_id}`) as { id: string; status: AppraisalStatus }[];
  const ap = rows[0];
  if (!ap) return NextResponse.json({ error: 'appraisal not found' }, { status: 404 });
  if (ap.status !== 'invited') return NextResponse.json({ error: 'self-appraisal already submitted' }, { status: 409 });

  const answers = b?.answers ?? {};
  if (b?.submit) {
    const acc = (answers as { accomplishments?: string }).accomplishments;
    if (!acc || !String(acc).trim()) {
      return NextResponse.json({ error: 'accomplishments is required to submit' }, { status: 400 });
    }
    const to = nextStatus(ap.status, 'self_submit');
    await db`UPDATE appraisal SET self_json = ${JSON.stringify(answers)}::jsonb,
             self_submitted_at = now(), status = ${to} WHERE id = ${ap.id}`;
    await logAudit({ actorType: 'employee', actorLabel: `emp#${t.holder_id}`, action: 'self_submit', appraisalId: ap.id });
    return NextResponse.json({ ok: true, status: to });
  }
  await db`UPDATE appraisal SET self_json = ${JSON.stringify(answers)}::jsonb WHERE id = ${ap.id}`;
  return NextResponse.json({ ok: true, draft: true });
}

export async function PATCH(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
