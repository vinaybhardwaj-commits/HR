import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { mintToken } from '@/lib/tokens';
import { encryptSecret } from '@/lib/crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Launch a cycle (idempotent — safe to re-run; fills anything missing).
 * SET-BASED (B9): a fixed ~10 statements regardless of headcount. The original
 * per-employee loop (~370 round trips) timed out cross-region and left partial
 * launches (only re-run could fill them).
 * 1. Gate: every active employee has a default appraiser.
 * 2. Snapshot active factors into cycle.factor_snapshot.
 * 3. Set-based assignment + appraisal inserts (ids generated in SQL).
 * 4. Mint missing tokens in JS, insert each role's batch via ONE unnest() insert.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cycleId = Number(params.id);
  const db = sql();

  const cycles = (await db`SELECT id, status FROM cycle WHERE id = ${cycleId}`) as { id: number; status: string }[];
  if (!cycles[0]) return NextResponse.json({ error: 'cycle not found' }, { status: 404 });
  if (cycles[0].status === 'closed') return NextResponse.json({ error: 'cycle is closed' }, { status: 400 });

  const missing = (await db`
    SELECT emp_code, full_name FROM employee WHERE active AND default_appraiser_id IS NULL`) as
    { emp_code: string; full_name: string }[];
  if (missing.length > 0) {
    return NextResponse.json({ error: 'employees without an appraiser', missing }, { status: 400 });
  }

  const factors = await db`
    SELECT code, track, sort, label, description, anchors, weight FROM factor WHERE active ORDER BY sort, code`;
  await db`UPDATE cycle SET factor_snapshot = ${JSON.stringify(factors)}::jsonb,
           status = 'live', launched_at = COALESCE(launched_at, now()) WHERE id = ${cycleId}`;

  // 3a. Assignments — one statement.
  await db`
    INSERT INTO assignment (cycle_id, employee_id, appraiser_id)
    SELECT ${cycleId}, e.id, e.default_appraiser_id FROM employee e WHERE e.active
    ON CONFLICT (cycle_id, employee_id) DO NOTHING`;

  // 3b. Appraisals — one statement, ids generated in SQL (apr_ + uuid hex).
  const insAppr = (await db`
    INSERT INTO appraisal (id, cycle_id, employee_id, appraiser_id)
    SELECT 'apr_' || replace(gen_random_uuid()::text, '-', ''), ${cycleId}, e.id, e.default_appraiser_id
    FROM employee e WHERE e.active
    ON CONFLICT (cycle_id, employee_id) DO NOTHING
    RETURNING id`) as { id: string }[];
  const createdAppraisals = insAppr.length;

  // 4a. Employee tokens — find holders missing one, mint in JS, single unnest insert.
  const empNeeding = (await db`
    SELECT e.id FROM employee e WHERE e.active AND NOT EXISTS (
      SELECT 1 FROM token t WHERE t.cycle_id = ${cycleId} AND t.role = 'employee'
        AND t.holder_type = 'employee' AND t.holder_id = e.id AND NOT t.revoked)`) as { id: number }[];
  let createdTokens = 0;
  if (empNeeding.length > 0) {
    const hashes: string[] = [], ids: number[] = [], encs: string[] = [];
    for (const e of empNeeding) {
      const { secret, hash } = mintToken();
      hashes.push(hash); ids.push(e.id); encs.push(encryptSecret(secret));
    }
    await db`
      INSERT INTO token (token_hash, role, holder_type, holder_id, cycle_id, expires_at, secret_enc)
      SELECT u.hash, 'employee', 'employee', u.holder_id, ${cycleId}, now() + interval '1 year', u.secret_enc
      FROM unnest(${hashes}::text[], ${ids}::int[], ${encs}::text[]) AS u(hash, holder_id, secret_enc)`;
    createdTokens += empNeeding.length;
  }

  // 4b. HOD tokens — same pattern, with name labels.
  const hodNeeding = (await db`
    SELECT DISTINCT a.id, a.full_name FROM appraiser a
    JOIN assignment s ON s.appraiser_id = a.id AND s.cycle_id = ${cycleId}
    WHERE NOT EXISTS (
      SELECT 1 FROM token t WHERE t.cycle_id = ${cycleId} AND t.role = 'hod'
        AND t.holder_type = 'appraiser' AND t.holder_id = a.id AND NOT t.revoked)`) as
    { id: number; full_name: string }[];
  if (hodNeeding.length > 0) {
    const hashes: string[] = [], ids: number[] = [], labels: string[] = [], encs: string[] = [];
    for (const ap of hodNeeding) {
      const { secret, hash } = mintToken();
      hashes.push(hash); ids.push(ap.id); labels.push(ap.full_name); encs.push(encryptSecret(secret));
    }
    await db`
      INSERT INTO token (token_hash, role, holder_type, holder_id, cycle_id, label, expires_at, secret_enc)
      SELECT u.hash, 'hod', 'appraiser', u.holder_id, ${cycleId}, u.label, now() + interval '1 year', u.secret_enc
      FROM unnest(${hashes}::text[], ${ids}::int[], ${labels}::text[], ${encs}::text[]) AS u(hash, holder_id, label, secret_enc)`;
    createdTokens += hodNeeding.length;
  }

  const [counts] = (await db`
    SELECT (SELECT count(*)::int FROM appraisal WHERE cycle_id = ${cycleId}) AS appraisals,
           (SELECT count(*)::int FROM token WHERE cycle_id = ${cycleId} AND NOT revoked) AS tokens`) as
    { appraisals: number; tokens: number }[];

  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'cycle_launch',
    meta: { cycleId, createdAppraisals, createdTokens, totalAppraisals: counts.appraisals, totalTokens: counts.tokens } });
  return NextResponse.json({ ok: true, cycleId, createdAppraisals, createdTokens,
    totalAppraisals: counts.appraisals, totalTokens: counts.tokens });
}
