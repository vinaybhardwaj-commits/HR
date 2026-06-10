import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { nextStatus, type Action } from '@/lib/state';
import { logAudit } from '@/lib/audit';
import type { AppraisalStatus } from '@/lib/status';

export const dynamic = 'force-dynamic';

const ALLOWED = ['override_self', 'cancel', 'resolve', 'reopen'] as const;
type AdminAction = (typeof ALLOWED)[number];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null) as { action?: AdminAction; reason?: string } | null;
  if (!b?.action || !ALLOWED.includes(b.action)) return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  if (['cancel', 'reopen', 'resolve'].includes(b.action) && !b.reason?.trim()) {
    return NextResponse.json({ error: 'a reason is required' }, { status: 400 });
  }

  const db = sql();
  const rows = (await db`SELECT id, status FROM appraisal WHERE id = ${params.id}`) as
    { id: string; status: AppraisalStatus }[];
  const ap = rows[0];
  if (!ap) return NextResponse.json({ error: 'not found' }, { status: 404 });

  try {
    if (b.action === 'override_self') {
      if (ap.status !== 'invited') return NextResponse.json({ error: 'only applies while waiting on self-appraisal' }, { status: 409 });
      await db`UPDATE appraisal SET self_overridden = true WHERE id = ${ap.id}`;
    } else {
      const map: Record<Exclude<AdminAction, 'override_self'>, Action> =
        { cancel: 'cancel', resolve: 'hr_resolve', reopen: 'reopen' };
      const to = nextStatus(ap.status, map[b.action as Exclude<AdminAction, 'override_self'>]);
      if (b.action === 'cancel') {
        await db`UPDATE appraisal SET status = ${to}, cancelled_reason = ${b.reason!.trim()} WHERE id = ${ap.id}`;
      } else if (b.action === 'resolve') {
        await db`UPDATE appraisal SET status = ${to}, hr_notes = ${b.reason!.trim()} WHERE id = ${ap.id}`;
      } else {
        await db`UPDATE appraisal SET status = ${to}, reopened_count = reopened_count + 1,
                 total_score = NULL, percent = NULL, band = NULL, scores_submitted_at = NULL,
                 discussion_date = NULL, discussion_marked_at = NULL WHERE id = ${ap.id}`;
        await db`UPDATE score SET is_draft = true WHERE appraisal_id = ${ap.id}`;
        await db`DELETE FROM concurrence WHERE appraisal_id = ${ap.id}`;
      }
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'illegal transition' }, { status: 409 });
  }
  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: `admin_${b.action}`,
    appraisalId: ap.id, meta: { reason: b.reason ?? null, from: ap.status } });
  return NextResponse.json({ ok: true });
}
