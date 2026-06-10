import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const rows = await sql()`
    SELECT c.id, c.label, c.type, c.period_from, c.period_to, c.status, c.launched_at,
           (SELECT count(*)::int FROM appraisal a WHERE a.cycle_id = c.id) AS appraisals
    FROM cycle c ORDER BY c.id DESC`;
  return NextResponse.json({ cycles: rows });
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null) as
    { label?: string; type?: string; period_from?: string; period_to?: string } | null;
  const label = b?.label?.trim();
  const type = b?.type;
  if (!label || !type || !['Q', 'H', 'A'].includes(type) || !b?.period_from || !b?.period_to) {
    return NextResponse.json({ error: 'label, type (Q/H/A), period_from, period_to required' }, { status: 400 });
  }
  if (new Date(b.period_from) >= new Date(b.period_to)) {
    return NextResponse.json({ error: 'period_from must be before period_to' }, { status: 400 });
  }
  const rows = (await sql()`
    INSERT INTO cycle (hospital_id, label, type, period_from, period_to)
    VALUES ((SELECT id FROM hospital WHERE code = 'EHRC'), ${label}, ${type}, ${b.period_from}, ${b.period_to})
    RETURNING id`) as { id: number }[];
  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'cycle_create', meta: { cycleId: rows[0].id, label } });
  return NextResponse.json({ ok: true, id: rows[0].id });
}
