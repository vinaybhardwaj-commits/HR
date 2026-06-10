import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function csv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}

export async function GET(req: NextRequest, { params }: { params: { kind: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cycleId = Number(new URL(req.url).searchParams.get('cycle') ?? 0);
  const db = sql();

  let rows: Record<string, unknown>[] = [];
  if (params.kind === 'calibration') {
    rows = (await db`
      SELECT ap.full_name AS hod, count(*)::int AS n, round(avg(a.percent),1) AS mean_pct,
             round(min(a.percent),1) AS min_pct, round(max(a.percent),1) AS max_pct,
             count(*) FILTER (WHERE a.band='Outstanding')::int AS outstanding,
             count(*) FILTER (WHERE a.band='Commendable')::int AS commendable,
             count(*) FILTER (WHERE a.band='Adequate')::int AS adequate,
             count(*) FILTER (WHERE a.band='Inadequate')::int AS inadequate
      FROM appraisal a JOIN appraiser ap ON ap.id = a.appraiser_id
      WHERE a.cycle_id = ${cycleId} AND a.percent IS NOT NULL
      GROUP BY ap.full_name ORDER BY count(*) DESC`) as Record<string, unknown>[];
  } else if (params.kind === 'bands') {
    rows = (await db`
      SELECT e.emp_code, e.full_name, e.department, e.sub_department, e.track,
             ap2.full_name AS hod, a.total_score, a.percent, a.band, a.status
      FROM appraisal a JOIN employee e ON e.id = a.employee_id
      JOIN appraiser ap2 ON ap2.id = a.appraiser_id
      WHERE a.cycle_id = ${cycleId} ORDER BY e.emp_code`) as Record<string, unknown>[];
  } else if (params.kind === 'training') {
    rows = (await db`
      SELECT e.emp_code, e.full_name, e.sub_department, tn.category, tn.detail
      FROM training_need tn JOIN appraisal a ON a.id = tn.appraisal_id
      JOIN employee e ON e.id = a.employee_id
      WHERE a.cycle_id = ${cycleId} ORDER BY tn.category, e.full_name`) as Record<string, unknown>[];
  } else {
    return NextResponse.json({ error: 'unknown report' }, { status: 404 });
  }

  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${params.kind}-cycle${cycleId}.csv"`
    }
  });
}
