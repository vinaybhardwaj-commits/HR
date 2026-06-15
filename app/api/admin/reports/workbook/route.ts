import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { buildWorkbookXml, type WorkbookData } from '@/lib/workbook';

export const dynamic = 'force-dynamic';

const SIGNOFF: Record<string, string> = {
  agree: 'Agree', agree_remarks: 'Agree with remarks', disagree: 'Disagree'
};
const SCORED_OR_BEYOND = new Set(['scored', 'discussed', 'concurred', 'disagreed', 'hr_review', 'closed']);
const SIGNED = new Set(['concurred', 'disagreed', 'hr_review', 'closed']);

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cycleId = Number(new URL(req.url).searchParams.get('cycle') ?? 0);
  if (!cycleId) return NextResponse.json({ error: 'cycle required' }, { status: 400 });
  const db = sql();

  const cyc = (await db`
    SELECT label, period_from::text AS period_from, period_to::text AS period_to, status, is_test
    FROM cycle WHERE id = ${cycleId}`) as
    { label: string; period_from: string; period_to: string; status: string; is_test: boolean }[];
  if (!cyc[0]) return NextResponse.json({ error: 'cycle not found' }, { status: 404 });

  const results = (await db`
    SELECT e.emp_code, e.full_name, e.department, e.sub_department, e.designation, e.track,
           ap.full_name AS hod, a.total_score, a.percent::float8 AS percent, a.band, a.status,
           a.discussion_date::text AS discussion_date,
           c.choice AS signoff, c.signed_name, c.signed_at::text AS signed_at
    FROM appraisal a
    JOIN employee e ON e.id = a.employee_id
    JOIN appraiser ap ON ap.id = a.appraiser_id
    LEFT JOIN concurrence c ON c.appraisal_id = a.id
    WHERE a.cycle_id = ${cycleId}
    ORDER BY e.emp_code`) as Record<string, unknown>[];

  const statusRows = (await db`
    SELECT status, count(*)::int AS n FROM appraisal WHERE cycle_id = ${cycleId} GROUP BY status`) as
    { status: string; n: number }[];
  const bandRows = (await db`
    SELECT band, count(*)::int AS n FROM appraisal WHERE cycle_id = ${cycleId} AND band IS NOT NULL GROUP BY band`) as
    { band: string; n: number }[];

  const calibration = (await db`
    SELECT ap.full_name AS hod, count(*)::int AS n,
           round(avg(a.percent), 1)::float8 AS mean_pct,
           round(min(a.percent), 1)::float8 AS min_pct,
           round(max(a.percent), 1)::float8 AS max_pct,
           count(*) FILTER (WHERE a.band = 'Outstanding')::int AS outstanding,
           count(*) FILTER (WHERE a.band = 'Commendable')::int AS commendable,
           count(*) FILTER (WHERE a.band = 'Adequate')::int AS adequate,
           count(*) FILTER (WHERE a.band = 'Inadequate')::int AS inadequate
    FROM appraisal a JOIN appraiser ap ON ap.id = a.appraiser_id
    WHERE a.cycle_id = ${cycleId} AND a.percent IS NOT NULL
    GROUP BY ap.full_name ORDER BY count(*) DESC`) as Record<string, unknown>[];

  const bandsByTrack = (await db`
    SELECT e.track, a.band, count(*)::int AS n
    FROM appraisal a JOIN employee e ON e.id = a.employee_id
    WHERE a.cycle_id = ${cycleId} AND a.band IS NOT NULL
    GROUP BY e.track, a.band ORDER BY e.track, a.band`) as { track: string; band: string; n: number }[];

  const training = (await db`
    SELECT e.emp_code, e.full_name, e.sub_department, tn.category, tn.detail
    FROM training_need tn JOIN appraisal a ON a.id = tn.appraisal_id
    JOIN employee e ON e.id = a.employee_id
    WHERE a.cycle_id = ${cycleId} ORDER BY tn.category, e.full_name`) as Record<string, unknown>[];

  const cnt = (pred: (s: string) => boolean) =>
    statusRows.filter(r => pred(r.status)).reduce((s, r) => s + r.n, 0);
  const bandCount = (b: string) => bandRows.find(r => r.band === b)?.n ?? 0;

  const data: WorkbookData = {
    cycle: { label: cyc[0].label, period_from: cyc[0].period_from, period_to: cyc[0].period_to,
      status: cyc[0].status, is_test: cyc[0].is_test, generated_at: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC' },
    summary: {
      employees: cnt(s => s !== 'cancelled'),
      scored: cnt(s => SCORED_OR_BEYOND.has(s)),
      signed: cnt(s => SIGNED.has(s)),
      closed: cnt(s => s === 'closed'),
      pending_signoff: cnt(s => s === 'scored' || s === 'discussed'),
      bands: { Outstanding: bandCount('Outstanding'), Commendable: bandCount('Commendable'),
        Adequate: bandCount('Adequate'), Inadequate: bandCount('Inadequate') },
    },
    results: results.map(r => ({
      emp_code: r.emp_code as string, full_name: r.full_name as string,
      department: r.department as string | null, sub_department: r.sub_department as string | null,
      designation: r.designation as string | null, track: r.track as string, hod: r.hod as string | null,
      total_score: r.total_score as number | null, percent: r.percent as number | null,
      band: r.band as string | null, status: r.status as string,
      discussion_date: r.discussion_date as string | null,
      signoff: r.signoff ? (SIGNOFF[r.signoff as string] ?? (r.signoff as string)) : null,
      signed_name: r.signed_name as string | null, signed_at: r.signed_at as string | null,
    })),
    calibration: calibration.map(c => ({
      hod: c.hod as string, n: c.n as number, mean_pct: c.mean_pct as number | null,
      min_pct: c.min_pct as number | null, max_pct: c.max_pct as number | null,
      outstanding: c.outstanding as number, commendable: c.commendable as number,
      adequate: c.adequate as number, inadequate: c.inadequate as number,
    })),
    bands: bandsByTrack,
    training: training.map(t => ({
      emp_code: t.emp_code as string, full_name: t.full_name as string,
      sub_department: t.sub_department as string | null, category: t.category as string,
      detail: t.detail as string | null,
    })),
  };

  const safeLabel = cyc[0].label.replace(/[^A-Za-z0-9._-]+/g, '-');
  return new NextResponse(buildWorkbookXml(data), {
    headers: {
      'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
      'Content-Disposition': `attachment; filename="EHRC-appraisal-${safeLabel}-cycle${cycleId}.xls"`,
    },
  });
}
