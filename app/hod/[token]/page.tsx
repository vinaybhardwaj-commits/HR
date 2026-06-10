import Link from 'next/link';
import { sql } from '@/lib/db';
import { resolvePortalToken } from '@/lib/portal';

export const dynamic = 'force-dynamic';

function TokenError() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="text-xl font-bold mb-2">EVEN <span className="font-normal text-slate-500">· Appraise</span></div>
        <p className="text-slate-600 text-sm">This link is not valid or has expired.
          Please contact the HR department for a fresh link.</p>
      </div>
    </main>
  );
}

type Row = {
  id: string; status: string; emp_code: string; full_name: string;
  designation: string | null; has_draft: boolean; days_in_status: number;
};

const GROUPS: { title: string; match: (r: Row) => boolean; chip: string; chipCls: string }[] = [
  { title: 'Ready to score', match: r => r.status === 'self_submitted' && !r.has_draft, chip: 'ready to score', chipCls: 'bg-amber-50 text-amber-700' },
  { title: 'Draft in progress', match: r => r.status === 'self_submitted' && r.has_draft, chip: 'draft saved', chipCls: 'bg-amber-50 text-amber-700' },
  { title: 'Waiting on self-appraisal', match: r => r.status === 'invited', chip: 'waiting on employee', chipCls: 'bg-slate-100 text-slate-500' },
  { title: 'Scored — discussion pending', match: r => r.status === 'scored', chip: 'mark discussion', chipCls: 'bg-violet-50 text-violet-700' },
  { title: 'Done', match: r => ['discussed', 'concurred', 'disagreed', 'hr_review', 'closed'].includes(r.status), chip: 'done', chipCls: 'bg-green-50 text-green-700' }
];

export default async function HodQueue({ params }: { params: { token: string } }) {
  const t = await resolvePortalToken(params.token);
  if (!t || t.role !== 'hod') return <TokenError />;

  const info = (await sql()`
    SELECT a.full_name AS hod_name, c.label AS cycle_label
    FROM appraiser a, cycle c WHERE a.id = ${t.holder_id} AND c.id = ${t.cycle_id}`) as
    { hod_name: string; cycle_label: string }[];

  const rows = (await sql()`
    SELECT ap.id, ap.status, e.emp_code, e.full_name, e.designation,
           EXISTS (SELECT 1 FROM score s WHERE s.appraisal_id = ap.id AND s.is_draft) AS has_draft,
           GREATEST(0, EXTRACT(epoch FROM (now() - COALESCE(ap.self_submitted_at, ap.created_at)))::int / 86400) AS days_in_status
    FROM appraisal ap JOIN employee e ON e.id = ap.employee_id
    WHERE ap.cycle_id = ${t.cycle_id} AND ap.appraiser_id = ${t.holder_id} AND ap.status <> 'cancelled'
    ORDER BY e.full_name`) as Row[];

  const doneCount = rows.filter(r => !['invited', 'self_submitted'].includes(r.status)).length;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <header className="mb-4">
          <div className="text-lg font-bold">EVEN <span className="font-normal text-slate-500">· Appraisals</span></div>
          <p className="text-sm text-slate-600 mt-1">{info[0]?.hod_name} · {info[0]?.cycle_label}</p>
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>{doneCount} of {rows.length} scored</span>
              <span>{rows.length - doneCount} remaining</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-brand rounded-full"
                style={{ width: `${rows.length ? Math.round((doneCount / rows.length) * 100) : 0}%` }} />
            </div>
          </div>
        </header>

        {GROUPS.map(g => {
          const items = rows.filter(g.match);
          if (!items.length) return null;
          return (
            <section key={g.title} className="mb-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{g.title} · {items.length}</h2>
              <div className="space-y-2">
                {items.map(r => {
                  const actionable = r.status === 'self_submitted' || r.status === 'scored';
                  const inner = (
                    <div className={`flex items-center justify-between bg-white border rounded-2xl p-4
                      ${actionable ? 'border-slate-200 hover:border-brand' : 'border-slate-100 opacity-80'}`}>
                      <div>
                        <div className="font-medium">{r.full_name}</div>
                        <div className="text-xs text-slate-500">{r.designation ?? r.emp_code}</div>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${g.chipCls}`}>{g.chip}</span>
                        {r.status === 'self_submitted' && r.days_in_status > 0 && (
                          <div className="text-[10px] text-slate-400 mt-1">{r.days_in_status}d</div>
                        )}
                      </div>
                    </div>
                  );
                  return r.status === 'invited'
                    ? <div key={r.id}>{inner}</div>
                    : <Link key={r.id} href={`/hod/${params.token}/a/${r.id}`} className="block">{inner}</Link>;
                })}
              </div>
            </section>
          );
        })}
        {rows.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 text-sm text-slate-500">
            No appraisals assigned in this cycle.
          </div>
        )}
      </div>
    </main>
  );
}
