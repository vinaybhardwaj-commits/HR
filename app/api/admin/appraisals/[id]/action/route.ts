import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { nextStatus, type Action } from '@/lib/state';
import { logAudit } from '@/lib/audit';
import type { AppraisalStatus } from '@/lib/status';

export const dynamic = 'force-dynamic';

const ALLOWED = ['override_self', 'mark_discussion', 'cancel', 'resolve', 'reopen'] as const;
type AdminAction = (typeof ALLOWED)[number];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null) as { action?: AdminAction; reason?: string; date?: string } | null;
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
    } else if (b.action === 'mark_discussion') {
      // HR OVERRIDE (V decision, 15 Jun 2026): mark the 1:1 as held on the HOD's
      // behalf. Used when an HOD scored but never marked the discussion, which
      // strands the employee (Part D sign-off stays locked until status=discussed).
      // Only valid from 'scored'. Audited as an HR override (via='hr_override') so
      // the trail records that HR — not the HOD — advanced it.
      if (ap.status !== 'scored') {
        return NextResponse.json({ error: 'only applies to a scored appraisal awaiting its 1:1' }, { status: 409 });
      }
      const date = (b.date?.trim()) || new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
      }
      const to = nextStatus(ap.status, 'mark_discussion');
      await db`UPDATE appraisal SET status = ${to}, discussion_date = ${date},
               discussion_marked_at = now() WHERE id = ${ap.id}`;
      await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'discussion_marked',
        appraisalId: ap.id, meta: { date, via: 'hr_override', from: ap.status } });
      return NextResponse.json({ ok: true, status: to });
    } else {
      const map: Record<Exclude<AdminAction, 'override_self' | 'mark_discussion'>, Action> =
        { cancel: 'cancel', resolve: 'hr_resolve', reopen: 'reopen' };
      const to = nextStatus(ap.status, map[b.action as Exclude<AdminAction, 'override_self' | 'mark_discussion'>]);
      if (b.action === 'cancel') {
        await db`UPDATE appraisal SET status = ${to}, cancelled_reason = ${b.reason!.trim()} WHERE id = ${ap.id}`;
      } else if (b.action === 'resolve') {
        await db`UPDATE appraisal SET status = ${to}, hr_notes = ${b.reason!.trim()} WHERE id = ${ap.id}`;
      } else {
        // VERSION SNAPSHOT (V decision 10 Jun): freeze the full prior submission
        // into the audit log before anything is cleared, so re-scoring never
        // destroys history. Readable in /admin/audit (action=score_version_snapshot).
        const prevScores = await db`
          SELECT factor_code, value, example_text FROM score WHERE appraisal_id = ${ap.id}`;
        const prevTotals = (await db`
          SELECT total_score, percent::text, band, scores_submitted_at::text, scored_by_label,
                 discussion_date::text, reopened_count
          FROM appraisal WHERE id = ${ap.id}`) as Record<string, unknown>[];
        await logAudit({
          actorType: 'admin', actorLabel: admin.email, action: 'score_version_snapshot',
          appraisalId: ap.id,
          meta: { version: Number(prevTotals[0]?.reopened_count ?? 0) + 1,
                  totals: prevTotals[0] ?? null, scores: prevScores as unknown as Record<string, unknown>[] }
        });
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
