import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { resolveHodAppraisal } from '@/lib/hod';
import { nextStatus } from '@/lib/state';
import { logAudit } from '@/lib/audit';
import type { AppraisalStatus } from '@/lib/status';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as { token?: string; appraisalId?: string; date?: string } | null;
  if (!b?.token || !b?.appraisalId || !b?.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
    return NextResponse.json({ error: 'token, appraisalId, date (YYYY-MM-DD) required' }, { status: 400 });
  }
  const ctx = await resolveHodAppraisal(b.token, b.appraisalId);
  if (!ctx) return NextResponse.json({ error: 'invalid link' }, { status: 401 });
  const { token, appraisal } = ctx;
  if (appraisal.status !== 'scored') {
    return NextResponse.json({ error: 'appraisal must be scored first' }, { status: 409 });
  }
  const to = nextStatus(appraisal.status as AppraisalStatus, 'mark_discussion');
  await sql()`UPDATE appraisal SET status = ${to}, discussion_date = ${b.date},
              discussion_marked_at = now() WHERE id = ${appraisal.id}`;
  await logAudit({ actorType: 'hod', actorLabel: token.label ?? `hod#${token.holder_id}`,
    action: 'discussion_marked', appraisalId: appraisal.id, meta: { date: b.date } });
  return NextResponse.json({ ok: true, status: to });
}
