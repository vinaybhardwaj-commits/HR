import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';

const BAND_ORDER = ['Outstanding', 'Commendable', 'Adequate', 'Inadequate'];
const BAND_CLS: Record<string, string> = {
  Outstanding: 'bg-green-50 text-green-700', Commendable: 'bg-teal-50 text-teal-700',
  Adequate: 'bg-amber-50 text-amber-700', Inadequate: 'bg-red-50 text-red-700'
};

export default async function Reports({ searchParams }: { searchParams: { cycle?: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin');
  const db = sql();

  const cycles = (await db`SELECT id, label FROM cycle ORDER BY id DESC`) as { id: number; label: string }[];
  const cycleId = Number(searchParams.cycle ?? cycles[0]?.id ?? 0);

  const calibration = (await db`
    SELECT ap.full_name AS hod, count(*)::int AS n,
           round(avg(a.percent), 1)::text AS mean_pct,
           round(min(a.percent), 1)::text AS min_pct,
           round(max(a.percent), 1)::text AS max_pct,
           count(*) FILTER (WHERE a.band = 'Outstanding')::int AS outstanding,
           count(*) FILTER (WHERE a.band = 'Commendable')::int AS commendable,
           count(*) FILTER (WHERE a.band = 'Adequate')::int AS adequate,
           count(*) FILTER (WHERE a.band = 'Inadequate')::int AS inadequate
    FROM appraisal a JOIN appraiser ap ON ap.id = a.appraiser_id
    WHERE a.cycle_id = ${cycleId} AND a.percent IS NOT NULL
    GROUP BY ap.full_name ORDER BY count(*) DESC`) as {
    hod: string; n: number; mean_pct: string; min_pct: string; max_pct: string;
    outstanding: number; commendable: number; adequate: number; inadequate: number;
  }[];

  const bands = (await db`
    SELECT e.track, a.band, count(*)::int AS n
    FROM appraisal a JOIN employee e ON e.id = a.employee_id
    WHERE a.cycle_id = ${cycleId} AND a.band IS NOT NULL
    GROUP BY e.track, a.band`) as { track: string; band: string; n: number }[];

  const training = (await db`
    SELECT tn.category, count(*)::int AS n,
           string_agg(DISTINCT e.full_name, ', ' ORDER BY e.full_name) AS people
    FROM training_need tn
    JOIN appraisal a ON a.id = tn.appraisal_id
    JOIN employee e ON e.id = a.employee_id
    WHERE a.cycle_id = ${cycleId}
    GROUP BY tn.category ORDER BY count(*) DESC`) as { category: string; n: number; people: string }[];

  const totalScored = calibration.reduce((s, c) => s + c.n, 0);

  return (
    <AdminShell active="/admin/reports" adminName={admin.name}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
        <h1 className="text-xl font-bold">Reports</h1>
        <form className="flex items-center gap-2">
          <select name="cycle" defaultValue={cycleId}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm">
            {cycles.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <button className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm">View</button>
        </form>
      </div>
      <p className="text-sm text-slate-500 mb-6">{totalScored} appraisals scored in this cycle.</p>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Calibration — score distribution per HOD</h2>
          <a href={`/api/admin/reports/calibration?cycle=${cycleId}`} className="text-xs text-brand font-medium">Download CSV</a>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Watch for leniency/severity: an HOD whose mean is far from the others (especially with large n) may need a calibration conversation.
        </p>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="px-4 py-3">HOD</th><th className="px-4 py-3">n</th>
                <th className="px-4 py-3">Mean %</th><th className="px-4 py-3">Range</th>
                <th className="px-4 py-3">O / C / A / I</th>
              </tr>
            </thead>
            <tbody>
              {calibration.map(r => (
                <tr key={r.hod} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium">{r.hod}</td>
                  <td className="px-4 py-2.5">{r.n}</td>
                  <td className="px-4 py-2.5 font-semibold">{r.mean_pct}%</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.min_pct}–{r.max_pct}%</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.outstanding} / {r.commendable} / {r.adequate} / {r.inadequate}</td>
                </tr>
              ))}
              {calibration.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-sm text-slate-500">No scored appraisals yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Band distribution by track</h2>
          <a href={`/api/admin/reports/bands?cycle=${cycleId}`} className="text-xs text-brand font-medium">Download CSV</a>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {(['C', 'N'] as const).map(track => (
            <div key={track} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="text-sm font-semibold mb-3">{track === 'C' ? 'Clinical' : 'Non-clinical'}</div>
              {BAND_ORDER.map(band => {
                const n = bands.find(b => b.track === track && b.band === band)?.n ?? 0;
                const total = bands.filter(b => b.track === track).reduce((s, b) => s + b.n, 0) || 1;
                return (
                  <div key={band} className="flex items-center gap-2 mb-1.5">
                    <span className={`w-28 text-xs rounded-full px-2 py-0.5 text-center ${BAND_CLS[band]}`}>{band}</span>
                    <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand rounded-full" style={{ width: `${Math.round((n / total) * 100)}%` }} />
                    </div>
                    <span className="text-xs w-6 text-right">{n}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Training needs rollup</h2>
          <a href={`/api/admin/reports/training?cycle=${cycleId}`} className="text-xs text-brand font-medium">Download CSV</a>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
          {training.map(t => (
            <div key={t.category} className="p-4">
              <div className="flex justify-between">
                <span className="font-medium text-sm">{t.category}</span>
                <span className="text-sm font-semibold">{t.n}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{t.people}</p>
            </div>
          ))}
          {training.length === 0 && <p className="p-4 text-sm text-slate-500">No training needs recorded yet.</p>}
        </div>
      </section>
    </AdminShell>
  );
}
