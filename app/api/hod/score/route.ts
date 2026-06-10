import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { resolveHodAppraisal, cycleFactorsForEmployee } from '@/lib/hod';
import { computeTotals, exampleRequired } from '@/lib/scoring';
import { nextStatus } from '@/lib/state';
import { logAudit } from '@/lib/audit';
import type { AppraisalStatus } from '@/lib/status';

export const dynamic = 'force-dynamic';

type ScoreIn = { factor_code: string; value: number; example_text?: string };
type Body = {
  token?: string; appraisalId?: string; scores?: ScoreIn[];
  training?: { category: string; detail?: string }[]; submit?: boolean;
};

async function handle(req: NextRequest) {
  const b = await req.json().catch(() => null) as Body | null;
  if (!b?.token || !b?.appraisalId) return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  const ctx = await resolveHodAppraisal(b.token, b.appraisalId);
  if (!ctx) return NextResponse.json({ error: 'invalid link' }, { status: 401 });
  const { token, appraisal } = ctx;

  if (!['invited', 'self_submitted'].includes(appraisal.status)) {
    return NextResponse.json({ error: 'scoring is closed for this appraisal' }, { status: 409 });
  }

  const db = sql();
  const factors = await cycleFactorsForEmployee(appraisal.cycle_id, appraisal.employee_id);
  const valid = new Set(factors.map(f => f.code));
  const scores = (b.scores ?? []).filter(s =>
    valid.has(s.factor_code) && Number.isInteger(s.value) && s.value >= 1 && s.value <= 5);

  for (const s of scores) {
    await db`INSERT INTO score (appraisal_id, factor_code, value, example_text, is_draft, updated_at)
             VALUES (${appraisal.id}, ${s.factor_code}, ${s.value}, ${s.example_text ?? null}, true, now())
             ON CONFLICT (appraisal_id, factor_code)
             DO UPDATE SET value = EXCLUDED.value, example_text = EXCLUDED.example_text, updated_at = now()`;
  }

  if (Array.isArray(b.training)) {
    await db`DELETE FROM training_need WHERE appraisal_id = ${appraisal.id}`;
    for (const t of b.training.slice(0, 5)) {
      if (t.category?.trim()) {
        await db`INSERT INTO training_need (appraisal_id, category, detail)
                 VALUES (${appraisal.id}, ${t.category.trim()}, ${t.detail?.trim() || null})`;
      }
    }
  }

  if (!b.submit) return NextResponse.json({ ok: true, draft: true, saved: scores.length });

  // SUBMIT: gate self-appraisal prerequisite (unless HR override)
  if (appraisal.status === 'invited') {
    const ov = (await db`SELECT self_overridden FROM appraisal WHERE id = ${appraisal.id}`) as
      { self_overridden: boolean }[];
    if (!ov[0]?.self_overridden) {
      return NextResponse.json({ error: 'waiting on self-appraisal (HR can override)' }, { status: 409 });
    }
  }
  const saved = (await db`SELECT factor_code, value, example_text FROM score
    WHERE appraisal_id = ${appraisal.id}`) as { factor_code: string; value: number; example_text: string | null }[];
  const byCode = new Map(saved.map(s => [s.factor_code, s]));
  const missing = factors.filter(f => !byCode.get(f.code)?.value).map(f => f.code);
  if (missing.length) return NextResponse.json({ error: 'all factors must be scored', missing }, { status: 400 });
  const needExample = factors.filter(f => {
    const s = byCode.get(f.code)!;
    return exampleRequired(s.value) && !s.example_text?.trim();
  }).map(f => f.code);
  if (needExample.length) {
    return NextResponse.json({ error: 'an example is required for scores of 1, 2 or 5', missing: needExample }, { status: 400 });
  }

  const totals = computeTotals(saved.map(s => ({ factor_code: s.factor_code, value: s.value })), factors);
  const to = nextStatus(appraisal.status as AppraisalStatus, 'score_submit');
  await db`UPDATE appraisal SET status = ${to}, total_score = ${totals.total},
           percent = ${totals.percent}, band = ${totals.band},
           scores_submitted_at = now(), scored_by_label = ${token.label ?? 'hod'}
           WHERE id = ${appraisal.id}`;
  await db`UPDATE score SET is_draft = false WHERE appraisal_id = ${appraisal.id}`;
  await logAudit({ actorType: 'hod', actorLabel: token.label ?? `hod#${token.holder_id}`,
    action: 'score_submit', appraisalId: appraisal.id, meta: totals as unknown as Record<string, unknown> });
  return NextResponse.json({ ok: true, status: to, ...totals });
}

export async function PATCH(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
