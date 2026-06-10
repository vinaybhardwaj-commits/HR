import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cycleId = Number(params.id);
  const rows = await sql()`
    SELECT a.id, a.status, a.self_submitted_at, e.emp_code, e.full_name, e.sub_department,
           e.designation, e.track, ap.full_name AS hod,
           EXTRACT(epoch FROM (now() - a.created_at))::int / 86400 AS days_open
    FROM appraisal a
    JOIN employee e ON e.id = a.employee_id
    JOIN appraiser ap ON ap.id = a.appraiser_id
    WHERE a.cycle_id = ${cycleId}
    ORDER BY e.emp_code`;
  const counts = await sql()`
    SELECT status, count(*)::int AS n FROM appraisal WHERE cycle_id = ${cycleId} GROUP BY status`;
  return NextResponse.json({ rows, counts });
}
