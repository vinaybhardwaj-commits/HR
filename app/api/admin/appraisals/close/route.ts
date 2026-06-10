import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Close all eligible (concurred / hr_review) appraisals in a cycle. */
export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null) as { cycleId?: number } | null;
  if (!b?.cycleId) return NextResponse.json({ error: 'cycleId required' }, { status: 400 });
  const closed = (await sql()`
    UPDATE appraisal SET status = 'closed', closed_at = now(), pdf_generated_at = now()
    WHERE cycle_id = ${b.cycleId} AND status IN ('concurred', 'hr_review')
    RETURNING id`) as { id: string }[];
  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'bulk_close',
    meta: { cycleId: b.cycleId, n: closed.length } });
  return NextResponse.json({ ok: true, closed: closed.length });
}
