import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import PageHelp from '@/components/admin/PageHelp';
import { AddEmployeeForm, AddAppraiserForm } from '@/components/admin/RosterAddForms';
import { EmployeeRowControls, AppraiserRowControls } from '@/components/admin/RosterControls';
import NameCodeEdit from '@/components/admin/NameCodeEdit';

export const dynamic = 'force-dynamic';

type Row = {
  id: number; emp_code: string; full_name: string; department: string; sub_department: string;
  designation: string; track: string; active: boolean; default_appraiser_id: number; hod: string | null;
};
type HodRow = { id: number; full_name: string; active: boolean; team: number };

export default async function Roster() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin');

  const rows = (await sql()`
    SELECT e.id, e.emp_code, e.full_name, e.department, e.sub_department, e.designation, e.track,
           e.active, e.default_appraiser_id, a.full_name AS hod
    FROM employee e
    LEFT JOIN appraiser a ON a.id = e.default_appraiser_id
    ORDER BY e.active DESC, e.emp_code`) as Row[];

  const hods = (await sql()`
    SELECT a.id, a.full_name, a.active,
           (SELECT count(*)::int FROM employee e WHERE e.default_appraiser_id = a.id AND e.active) AS team
    FROM appraiser a
    ORDER BY a.active DESC, team DESC, a.full_name`) as HodRow[];

  const activeHods = hods.filter(h => h.active).map(h => ({ id: h.id, full_name: h.full_name }));
  const activeCount = rows.filter(r => r.active).length;

  // Group employees under their HOD; groups ordered like the HOD table (largest team first).
  const groups = hods
    .map(h => ({
      hod: h,
      members: rows
        .filter(r => r.default_appraiser_id === h.id)
        .sort((a, b) => Number(b.active) - Number(a.active) || a.full_name.localeCompare(b.full_name))
    }))
    .filter(g => g.members.length > 0);
  const orphans = rows.filter(r => !hods.some(h => h.id === r.default_appraiser_id));
  if (orphans.length) groups.push({ hod: { id: -1, full_name: 'No HOD assigned', active: false, team: 0 }, members: orphans });

  return (
    <AdminShell active="/admin/roster" adminName={admin.name}>
      <h1 className="text-xl font-bold mb-1">Roster</h1>
      <p className="text-sm text-slate-500 mb-4">
        {activeCount} active employees · {activeHods.length} active HODs.
      </p>
      <PageHelp items={[
        'Add employees and HODs here; everything saves instantly and is audit-logged.',
        'New joiner while a cycle is live: add them, then open the cycle and press “Re-run launch (fill missing)” — that creates their appraisal and personal link without touching anyone else.',
        'Lateral move: change the HOD in the row. If their live-cycle appraisal is not yet scored it moves to the new HOD immediately (the new HOD gets a link if they lack one); if already scored it stays with the scorer for this cycle and only future cycles follow the new mapping. The row tells you which happened.',
        'Track decides which 4 of the 9 factors apply (Clinical / Non-clinical). Changing it is blocked once scoring has started in a live cycle.',
        'Leavers: Deactivate — they are excluded from future launches; cancel any open appraisal from the cycle board. HODs can only be deactivated once nobody is mapped to them.',
        'Name or code typos: hover a name and click the pencil to correct it in place (audited). Note: an employee signs their appraisal by typing their name exactly as it appears here — fix spellings before the sign-off stage.'
      ]} />
      <AddEmployeeForm hods={activeHods} />
      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Sub-department</th><th className="px-4 py-3">Designation</th>
              <th className="px-4 py-3">HOD / Track / Status</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => [
              <tr key={`h${g.hod.id}`} className="bg-slate-50 border-b border-slate-200">
                <td colSpan={5} className="px-4 py-2 text-xs font-bold text-slate-600 uppercase tracking-wide">
                  {g.hod.full_name} · {g.members.filter(m => m.active).length} report{g.members.filter(m => m.active).length === 1 ? '' : 's'}
                </td>
              </tr>,
              ...g.members.map(r => (
              <tr key={r.id} className={`border-b border-slate-100 last:border-0 ${r.active ? '' : 'opacity-45'}`}>
                <td className="px-4 py-2.5" colSpan={2}>
                  <NameCodeEdit role="employee" id={r.id} name={r.full_name} code={r.emp_code} />
                  {!r.active && <span className="ml-2 text-[10px] text-slate-400">(inactive)</span>}
                </td>
                <td className="px-4 py-2.5 text-slate-600">{r.sub_department}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.designation}</td>
                <td className="px-4 py-2.5">
                  <EmployeeRowControls id={r.id} name={r.full_name} hodId={r.default_appraiser_id}
                    track={r.track} active={r.active} hods={activeHods} />
                </td>
              </tr>
              ))
            ])}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-bold mt-8 mb-3">Appraisers (HODs)</h2>
      <AddAppraiserForm />
      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Team size</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {hods.map(h => (
              <tr key={h.id} className={`border-b border-slate-100 last:border-0 ${h.active ? '' : 'opacity-45'}`}>
                <td className="px-4 py-2.5"><NameCodeEdit role="appraiser" id={h.id} name={h.full_name} /></td>
                <td className="px-4 py-2.5 text-slate-600">{h.team}</td>
                <td className="px-4 py-2.5">
                  <AppraiserRowControls id={h.id} name={h.full_name} active={h.active} team={h.team} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
