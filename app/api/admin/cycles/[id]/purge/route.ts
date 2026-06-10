import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * Purge a TEST cycle (B5): deletes every row created by the cycle, then the
 * cycle itself. Refuses for real cycles (is_test = false). Audit rows are
 * intentionally KEPT for traceability; a cycle_purge entry records counts.
 * Body must include { confirm: "<cycle label>" } as a typed confirmation.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cycleId = Number(params.id);
  const db = sql();

  const cycles = (await db`SELECT id, label, is_test FROM cycle WHERE id = ${cycleId}`) as
    { id: number; label: string; is_test: boolean }[];
  const cycle = cycles[0];
  if (!cycle) return NextResponse.json({ error: 'cycle not found' }, { status: 404 });
  if (!cycle.is_test) {
    return NextResponse.json({ error: 'refusing to purge: not a test cycle' }, { status: 400 });
  }

  const b = await req.json().catch(() => null) as { confirm?: string } | null;
  if ((b?.confirm ?? '').trim() !== cycle.label) {
    return NextResponse.json({ error: 'confirmation text does not match cycle label' }, { status: 400 });
  }

  // Delete in FK dependency order (Neon HTTP = one statement per call).
  const counts: Record<string, number> = {};
  const del = async (name: string, rows: unknown) => { counts[name] = (rows as unknown[]).length; };

  await del('concurrence', await db`
    DELETE FROM concurrence WHERE appraisal_id IN (SELECT id FROM appraisal WHERE cycle_id = ${cycleId}) RETURNING id`);
  await del('training_need', await db`
    DELETE FROM training_need WHERE appraisal_id IN (SELECT id FROM appraisal WHERE cycle_id = ${cycleId}) RETURNING id`);
  await del('score', await db`
    DELETE FROM score WHERE appraisal_id IN (SELECT id FROM appraisal WHERE cycle_id = ${cycleId}) RETURNING id`);
  await del('email_log', await db`
    DELETE FROM email_log WHERE appraisal_id IN (SELECT id FROM appraisal WHERE cycle_id = ${cycleId}) RETURNING id`);
  await del('appraisal', await db`DELETE FROM appraisal WHERE cycle_id = ${cycleId} RETURNING id`);
  await del('assignment', await db`DELETE FROM assignment WHERE cycle_id = ${cycleId} RETURNING id`);
  await del('token', await db`DELETE FROM token WHERE cycle_id = ${cycleId} RETURNING id`);
  await del('wa_send_log', await db`DELETE FROM wa_send_log WHERE cycle_id = ${cycleId} RETURNING id`);
  await del('cycle', await db`DELETE FROM cycle WHERE id = ${cycleId} RETURNING id`);

  await logAudit({
    actorType: 'admin', actorLabel: admin.email, action: 'cycle_purge',
    meta: { cycleId, label: cycle.label, counts }
  });
  return NextResponse.json({ ok: true, purged: counts });
}
