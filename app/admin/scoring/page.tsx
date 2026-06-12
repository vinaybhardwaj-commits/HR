import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import PageHelp from '@/components/admin/PageHelp';
import { STATUS_META, type AppraisalStatus } from '@/lib/status';

export const dynamic = 'force-dynamic';

export default async function Scoring({ searchParams }: { searchParams: { cycle?: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin');
  const db = sql();

  const cycles = (await db`SELECT id, label, is_test FROM cycle ORDER BY id DESC`) as
    { id: number; label: string; is_test: boolean }[];
  const defaultCycle = cycles.find(c => !c.is_test) ?? cycles[0];
  const cycleId = Number(searchParams.cycle ?? defaultCycle?.id ?? 0);

  const rows = (await db`
    SELECT a.id, a.status, a.total_score, a.percent::text, a.band, a.reopened_count,
           e.emp_code, e.full_name, e.track, ap.id AS hod_id, ap.full_name AS hod,
           (SELECT count(*)::int FROM score s WHERE s.appraisal_id = a.id AND s.value IS NOT NULL) AS factors_scored,
           (SELECT count(*)::int FROM score s WHERE s.appraisal_id = a.id AND s.is_draft AND s.value IS NOT NULL) AS draft_scores
    FROM appraisal a
    JOIN employee e ON e.id = a.employee_id
    JOIN appraiser ap ON ap.id = a.appraiser_id
    WHERE a.cycle_id = ${cycleId} AND a.status <> 'cancelled'
    ORDER BY ap.full_name, e.full_name`) as {
    id: string; status: AppraisalStatus; total_score: number | null; percent: string | null; band: string | null;
    reopened_count: number; emp_code: string; full_name: string; track: string;
    hod_id: number; hod: string; factors_scored: number; draft_scores: number;
  }[];

  const byHod = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byHod.get(r.hod) ?? [];
    list.push(r);
    byHod.set(r.hod, list);
  }

  return (
    <AdminShell active="/admin/scoring" adminName={admin.name}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
        <h1 className="text-xl font-bold">Scoring browser</h1>
        <form className="flex items-center gap-2">
          <select name="cycle" defaultValue={cycleId}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm">
            {cycles.map(c => <option key={c.id} value={c.id}>{c.label}{c.is_test ? ' (TEST)' : ''}</option>)}
          </select>
          <button className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm">View</button>
        </form>
      </div>
      <p className="text-sm text-slate-500 mb-4">Every HOD&apos;s scoring of every employee — including work in progress.</p>
      <PageHelp items={[
        'Each HOD section lists their team. Click any person to open the full appraisal: their Part A self-appraisal, all 9 factor scores with the HOD’s written examples, totals and band, training needs, and sign-off state.',
        'An amber "draft" chip means the HOD has started scoring but not submitted — what you see may still change. Submitted scores are final (locked) unless HR reopens.',
        'Every appraisal you open is recorded in the audit trail (appraisal_viewed), because this is sensitive personnel data.',
        'For scoring-pattern comparison across HODs (leniency / strictness), use Reports → calibration; this page is for reading individual appraisals.'
      ]} />

      {Array.from(byHod.entries()).map(([hod, list]) => (
        <section key={hod} className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
          <h2 className="font-bold text-sm mb-2">{hod} <span className="text-slate-400 font-normal">· {list.length}</span></h2>
          <div className="divide-y divide-slate-50">
            {list.map(r => (
              <Link key={r.id} href={`/admin/appraisals/${r.id}`}
                className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50 px-2 -mx-2 rounded-lg">
                <span className="text-sm font-medium">{r.full_name} <span className="text-xs text-slate-400 font-mono">{r.emp_code}</span></span>
                <span className="flex items-center gap-2">
                  {r.draft_scores > 0 && r.status !== 'scored' && (
                    <span className="text-[10px] rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 font-semibold">
                      draft · {r.factors_scored} factor{r.factors_scored === 1 ? '' : 's'}
                    </span>
                  )}
                  {r.reopened_count > 0 && (
                    <span className="text-[10px] rounded-full px-2 py-0.5 bg-purple-50 text-purple-700">v{r.reopened_count + 1}</span>
                  )}
                  {r.total_score != null && (
                    <span className="text-xs text-slate-600">{r.total_score} · {r.percent}% · <span className="font-semibold">{r.band}</span></span>
                  )}
                  <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${STATUS_META[r.status].cls}`}>
                    {STATUS_META[r.status].label}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
      {rows.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-sm text-slate-500">No appraisals in this cycle.</div>
      )}
    </AdminShell>
  );
}
