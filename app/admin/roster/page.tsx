import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import PageHelp from '@/components/admin/PageHelp';

export const dynamic = 'force-dynamic';

type Row = {
  emp_code: string; full_name: string; department: string; sub_department: string;
  designation: string; track: string; hod: string | null;
};

export default async function Roster() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin');

  const rows = (await sql()`
    SELECT e.emp_code, e.full_name, e.department, e.sub_department, e.designation, e.track,
           a.full_name AS hod
    FROM employee e
    LEFT JOIN appraiser a ON a.id = e.default_appraiser_id
    WHERE e.active
    ORDER BY e.emp_code`) as Row[];

  return (
    <AdminShell active="/admin/roster" adminName={admin.name}>
      <h1 className="text-xl font-bold mb-1">Roster</h1>
      <p className="text-sm text-slate-500 mb-6">
        {rows.length} active employees, as provided by HR.
      </p>
      <PageHelp items={[
        'Track decides which 4 of the 9 appraisal factors apply: Clinical (teal) or Non-clinical (amber). Spot-check these before launching a real cycle.',
        'HOD is the default appraiser — at cycle launch each employee\u2019s appraisal is assigned to this person. Every employee must have an HOD or launch will refuse and name the gaps.',
        'The roster is read-only here for now; corrections (names, tracks, HOD changes) go through HR and are applied by the system administrator. A roster editor and import wizard are on the backlog.'
      ]} />
      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Sub-department</th><th className="px-4 py-3">Designation</th>
              <th className="px-4 py-3">Track</th><th className="px-4 py-3">HOD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.emp_code} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">{r.emp_code}</td>
                <td className="px-4 py-2.5 font-medium">{r.full_name}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.sub_department}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.designation}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                    r.track === 'C' ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-700'}`}>
                    {r.track === 'C' ? 'Clinical' : 'Non-clinical'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{r.hod ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
