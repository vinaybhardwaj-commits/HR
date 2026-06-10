import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { mintToken } from '@/lib/tokens';
import { encryptSecret } from '@/lib/crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Launch a cycle (idempotent — safe to re-run; fills anything missing):
 * 1. Gate: every active employee has a default appraiser.
 * 2. Snapshot active factors into cycle.factor_snapshot.
 * 3. Per employee: assignment + appraisal + employee token.
 * 4. Per appraiser in use: hod token.
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

  const employees = (await db`
    SELECT id, default_appraiser_id FROM employee WHERE active`) as { id: number; default_appraiser_id: number }[];

  const expiry = `now() + interval '1 year'`; // revoked/rotated at close + 30d during close-out (P4)
  let createdAppraisals = 0, createdTokens = 0;

  for (const e of employees) {
    await db`INSERT INTO assignment (cycle_id, employee_id, appraiser_id)
             VALUES (${cycleId}, ${e.id}, ${e.default_appraiser_id})
             ON CONFLICT (cycle_id, employee_id) DO NOTHING`;
    const apId = `apr_${randomBytes(8).toString('base64url')}`;
    const ins = (await db`INSERT INTO appraisal (id, cycle_id, employee_id, appraiser_id)
             VALUES (${apId}, ${cycleId}, ${e.id}, ${e.default_appraiser_id})
             ON CONFLICT (cycle_id, employee_id) DO NOTHING RETURNING id`) as { id: string }[];
    if (ins.length) createdAppraisals++;
    const existing = (await db`SELECT id FROM token WHERE cycle_id = ${cycleId} AND role = 'employee'
             AND holder_type = 'employee' AND holder_id = ${e.id} AND NOT revoked`) as { id: number }[];
    if (!existing.length) {
      const { secret, hash } = mintToken();
      await db`INSERT INTO token (token_hash, role, holder_type, holder_id, cycle_id, expires_at, secret_enc)
               VALUES (${hash}, 'employee', 'employee', ${e.id}, ${cycleId}, now() + interval '1 year', ${encryptSecret(secret)})`;
      createdTokens++;
    }
  }

  const appraisers = (await db`
    SELECT DISTINCT a.id, a.full_name FROM appraiser a
    JOIN assignment s ON s.appraiser_id = a.id WHERE s.cycle_id = ${cycleId}`) as { id: number; full_name: string }[];
  for (const ap of appraisers) {
    const existing = (await db`SELECT id FROM token WHERE cycle_id = ${cycleId} AND role = 'hod'
             AND holder_type = 'appraiser' AND holder_id = ${ap.id} AND NOT revoked`) as { id: number }[];
    if (!existing.length) {
      const { secret, hash } = mintToken();
      await db`INSERT INTO token (token_hash, role, holder_type, holder_id, cycle_id, label, expires_at, secret_enc)
               VALUES (${hash}, 'hod', 'appraiser', ${ap.id}, ${cycleId}, ${ap.full_name}, now() + interval '1 year', ${encryptSecret(secret)})`;
      createdTokens++;
    }
  }

  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'cycle_launch',
    meta: { cycleId, createdAppraisals, createdTokens } });
  return NextResponse.json({ ok: true, cycleId, createdAppraisals, createdTokens,
    employees: employees.length, appraisers: appraisers.length });
}
