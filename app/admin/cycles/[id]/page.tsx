import { redirect, notFound } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import CycleControl from '@/components/admin/CycleControl';
import { STATUS_META, type AppraisalStatus } from '@/lib/status';

export const dynamic = 'force-dynamic';

export default async function CycleDetail({ params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin');
  const cycleId = Number(params.id);
  const cycles = (await sql()`
    SELECT id, label, type, period_from::text, period_to::text, status, launched_at
    FROM cycle WHERE id = ${cycleId}`) as
    { id: number; label: string; type: string; period_from: string; period_to: string; status: string; launched_at: string | null }[];
  const cycle = cycles[0];
  if (!cycle) notFound();

  const rows = (await sql()`
    SELECT a.id, a.status, e.emp_code, e.full_name, e.sub_department, e.track, ap.full_name AS hod
    FROM appraisal a
    JOIN employee e ON e.id = a.employee_id
    JOIN appraiser ap ON ap.id = a.appraiser_id
    WHERE a.cycle_id = ${cycleId} ORDER BY e.emp_code`) as
    { id: string; status: AppraisalStatus; emp_code: string; full_name: string; sub_department: string; track: string; hod: string }[];

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;

  return (
    <AdminShell active="/admin/cycles" adminName={admin.name}>
      <h1 className="text-xl font-bold mb-1">{cycle.label}</h1>
      <p className="text-sm text-slate-500 mb-5">
        {cycle.period_from} → {cycle.period_to} · status: {cycle.status}
      </p>
      <CycleControl cycleId={cycle.id} status={cycle.status} appraisals={rows.length} />

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 mt-6 mb-4">
            {Object.entries(counts).map(([s, n]) => (
              <span key={s} className={`text-xs font-medium rounded-full px-3 py-1 ${STATUS_META[s as AppraisalStatus].cls}`}>
                {STATUS_META[s as AppraisalStatus].label}: {n}
              </span>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Sub-dept</th><th className="px-4 py-3">HOD</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{r.emp_code}</td>
                    <td className="px-4 py-2.5 font-medium">{r.full_name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.sub_department}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.hod}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${STATUS_META[r.status].cls}`}>
                        {STATUS_META[r.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminShell>
  );
}
