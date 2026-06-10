import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * Toggle a cycle's is_test flag. Marking a cycle as test excludes it from the
 * dashboard count and report defaults, and unlocks the purge button — so this
 * is audited and the UI confirms before calling. Unmarking is also allowed.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cycleId = Number(params.id);
  const b = await req.json().catch(() => null) as { is_test?: boolean } | null;
  if (typeof b?.is_test !== 'boolean') {
    return NextResponse.json({ error: 'is_test (boolean) required' }, { status: 400 });
  }
  const db = sql();
  const rows = (await db`
    UPDATE cycle SET is_test = ${b.is_test} WHERE id = ${cycleId}
    RETURNING id, label, is_test`) as { id: number; label: string; is_test: boolean }[];
  if (!rows[0]) return NextResponse.json({ error: 'cycle not found' }, { status: 404 });
  await logAudit({
    actorType: 'admin', actorLabel: admin.email, action: 'cycle_test_flag',
    meta: { cycleId, label: rows[0].label, is_test: b.is_test }
  });
  return NextResponse.json({ ok: true, is_test: rows[0].is_test });
}
