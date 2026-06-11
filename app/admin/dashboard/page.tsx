import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import PageHelp from '@/components/admin/PageHelp';
import AutoRefresh from '@/components/admin/AutoRefresh';
import { STATUS_META, type AppraisalStatus } from '@/lib/status';

export const dynamic = 'force-dynamic';

const DONE = new Set(['concurred', 'disagreed', 'hr_review', 'closed']);
const ACTION_LABEL: Record<string, string> = {
  self_submit: 'submitted their self-appraisal',
  score_submit: 'scores submitted',
  score_submit_blocked: 'blocked re-submit attempt',
  mark_discussion: 'discussion marked held',
  concur_agree: 'signed — agree',
  concur_remarks: 'signed — agree with remarks',
  concur_disagree: 'signed — DISAGREE',
  hr_resolve: 'HR resolved disagreement',
  close: 'appraisal closed',
  cancel: 'appraisal cancelled',
  reopen: 'reopened for re-scoring',
  score_version_snapshot: 'previous scores archived',
  cycle_launch: 'cycle launched',
  cycle_create: 'cycle created',
  cycle_purge: 'test cycle purged',
  cycle_test_flag: 'test flag changed',
  links_viewed: 'links panel opened',
  admin_login: 'admin signed in',
  login_failed: 'failed login attempt',
  employee_create: 'employee added',
  employee_update: 'employee updated',
  appraiser_create: 'HOD added',
  appraiser_update: 'HOD updated',
  override_self: 'self-appraisal requirement overridden',
  admin_create: 'admin account created',
  admin_password_reset: 'admin password reset',
  pdf_download: 'PDF downloaded'
};

export default async function Dashboard() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin');
  const db = sql();

  const [emp] = (await db`SELECT count(*)::int AS n FROM employee WHERE active`) as { n: number }[];
  const [apr] = (await db`SELECT count(*)::int AS n FROM appraiser WHERE active`) as { n: number }[];
  const [cyc] = (await db`SELECT count(*)::int AS n FROM cycle WHERE status = 'live' AND NOT is_test`) as { n: number }[];

  // All live cycles including TEST (badged) so rehearsals are watchable too.
  const liveCycles = (await db`
    SELECT id, label, is_test, launched_at::text FROM cycle WHERE status = 'live' ORDER BY id DESC`) as
    { id: number; label: string; is_test: boolean; launched_at: string }[];
  const ids = liveCycles.map(c => c.id);

  type CountRow = { cycle_id: number; status: AppraisalStatus; n: number };
  type PendingRow = { cycle_id: number; emp_code: string; full_name: string; hod: string; days: number };
  type HodRow = { cycle_id: number; hod: string; status: AppraisalStatus; n: number };
  let counts: CountRow[] = [], waitingEmp: PendingRow[] = [], waitingHod: PendingRow[] = [], hodRows: HodRow[] = [];

  if (ids.length) {
    counts = (await db`
      SELECT cycle_id, status, count(*)::int AS n FROM appraisal
      WHERE cycle_id = ANY(${ids}::int[]) GROUP BY cycle_id, status`) as CountRow[];
    waitingEmp = (await db`
      SELECT a.cycle_id, e.emp_code, e.full_name, ap.full_name AS hod,
             GREATEST(0, floor(extract(epoch FROM now() - a.created_at) / 86400))::int AS days
      FROM appraisal a JOIN employee e ON e.id = a.employee_id JOIN appraiser ap ON ap.id = a.appraiser_id
      WHERE a.cycle_id = ANY(${ids}::int[]) AND a.status = 'invited'
      ORDER BY days DESC, e.full_name`) as PendingRow[];
    waitingHod = (await db`
      SELECT a.cycle_id, e.emp_code, e.full_name, ap.full_name AS hod,
             GREATEST(0, floor(extract(epoch FROM now() - a.self_submitted_at) / 86400))::int AS days
      FROM appraisal a JOIN employee e ON e.id = a.employee_id JOIN appraiser ap ON ap.id = a.appraiser_id
      WHERE a.cycle_id = ANY(${ids}::int[]) AND a.status = 'self_submitted'
      ORDER BY days DESC, e.full_name`) as PendingRow[];
    hodRows = (await db`
      SELECT a.cycle_id, ap.full_name AS hod, a.status, count(*)::int AS n
      FROM appraisal a JOIN appraiser ap ON ap.id = a.appraiser_id
      WHERE a.cycle_id = ANY(${ids}::int[]) AND a.status <> 'cancelled'
      GROUP BY a.cycle_id, ap.full_name, a.status`) as HodRow[];
  }

  const activity = (await db`
    SELECT al.at::text, al.actor_type, al.actor_label, al.action, al.appraisal_id, e.full_name
    FROM audit_log al
    LEFT JOIN appraisal a ON a.id = al.appraisal_id
    LEFT JOIN employee e ON e.id = a.employee_id
    ORDER BY al.at DESC LIMIT 15`) as
    { at: string; actor_type: string; actor_label: string | null; action: string; appraisal_id: string | null; full_name: string | null }[];

  return (
    <AdminShell active="/admin/dashboard" adminName={admin.name}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <AutoRefresh seconds={30} />
      </div>
      <p className="text-sm text-slate-500 mb-4">Even Healthcare performance appraisals — live command centre.</p>
      <PageHelp title="How the appraisal system works" items={[
        'The flow per cycle: HR launches → employees submit their self-appraisal (Part A) → HODs score the 9 factors → HOD holds a face-to-face discussion and marks it held → the employee sees the scores and signs (agree / agree with remarks / disagree) → disagreements go to Review → HR closes signed-off appraisals and PDFs become available.',
        'Nobody except HR logs in. Every employee and HOD gets a personal link, shared by HR via WhatsApp from the cycle page.',
        'This page is live: it refreshes itself every 30 seconds. Every state change and blocked attempt is recorded — the latest activity is at the bottom, the full trail is in Audit.',
        'The "waiting on" lists show exactly who to chase, with their HOD and days waiting. One-tap chase messages live in the cycle page links panel.'
      ]} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[{ label: 'Active employees', value: emp.n }, { label: 'Appraisers (HODs)', value: apr.n },
          { label: 'Live cycles', value: cyc.n }, { label: 'Live incl. test', value: liveCycles.length }].map(c => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="text-3xl font-bold">{c.value}</div>
            <div className="text-sm text-slate-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {liveCycles.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-sm text-slate-500 mb-6">
          No live cycle right now. Create and launch one from the Cycles page — this dashboard comes alive once a cycle is running.
        </div>
      )}

      {liveCycles.map(c => {
        const cCounts = counts.filter(x => x.cycle_id === c.id);
        const total = cCounts.reduce((s, x) => s + (x.status === 'cancelled' ? 0 : x.n), 0);
        const done = cCounts.filter(x => DONE.has(x.status)).reduce((s, x) => s + x.n, 0);
        const pct = total ? Math.round((done / total) * 100) : 0;
        const wEmp = waitingEmp.filter(x => x.cycle_id === c.id);
        const wHod = waitingHod.filter(x => x.cycle_id === c.id);
        const hods = new Map<string, Record<string, number>>();
        for (const r of hodRows.filter(x => x.cycle_id === c.id)) {
          const m = hods.get(r.hod) ?? {};
          m[r.status] = r.n;
          hods.set(r.hod, m);
        }
        return (
          <section key={c.id} className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h2 className="font-bold">
                {c.label}
                {c.is_test && <span className="ml-2 text-[10px] font-bold rounded-full px-2 py-0.5 bg-purple-100 text-purple-700 align-middle">TEST</span>}
              </h2>
              <Link href={`/admin/cycles/${c.id}`} className="text-xs text-brand font-medium">Open cycle board →</Link>
            </div>

            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span>{done} of {total} signed off</span><span>{pct}%</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3">
              <div className="h-full bg-brand rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex flex-wrap gap-2 mb-5">
              {(Object.keys(STATUS_META) as AppraisalStatus[]).map(st => {
                const n = cCounts.find(x => x.status === st)?.n ?? 0;
                if (!n) return null;
                return (
                  <span key={st} className={`text-xs font-medium rounded-full px-3 py-1 ${STATUS_META[st].cls}`}>
                    {STATUS_META[st].label}: {n}
                  </span>
                );
              })}
            </div>

            <div className="grid lg:grid-cols-2 gap-5">
              <div>
                <h3 className="text-sm font-semibold mb-2">Waiting on employee — self-appraisal pending ({wEmp.length})</h3>
                <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-xl">
                  {wEmp.length === 0 && <p className="text-xs text-slate-400 p-3">Nobody — all self-appraisals are in 🎉</p>}
                  {wEmp.map(r => (
                    <div key={r.emp_code} className="flex items-center justify-between px-3 py-1.5 border-b border-slate-50 last:border-0 text-sm">
                      <span>{r.full_name} <span className="text-xs text-slate-400">→ {r.hod}</span></span>
                      <span className={`text-xs ${r.days >= 7 ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>{r.days}d</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Waiting on HOD — scoring pending ({wHod.length})</h3>
                <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-xl">
                  {wHod.length === 0 && <p className="text-xs text-slate-400 p-3">Nobody — HODs are up to date 🎉</p>}
                  {wHod.map(r => (
                    <div key={r.emp_code} className="flex items-center justify-between px-3 py-1.5 border-b border-slate-50 last:border-0 text-sm">
                      <span>{r.full_name} <span className="text-xs text-slate-400">→ {r.hod}</span></span>
                      <span className={`text-xs ${r.days >= 3 ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>{r.days}d</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <h3 className="text-sm font-semibold mt-5 mb-2">HOD progress</h3>
            <div className="border border-slate-100 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="px-3 py-2">HOD</th><th className="px-3 py-2">Team</th>
                    <th className="px-3 py-2">Awaiting self</th><th className="px-3 py-2">To score</th>
                    <th className="px-3 py-2">Discussion pending</th><th className="px-3 py-2">Done</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(hods.entries()).sort((a, b) => (b[1]['self_submitted'] ?? 0) - (a[1]['self_submitted'] ?? 0)).map(([hod, m]) => {
                    const teamTotal = Object.values(m).reduce((s, n) => s + n, 0);
                    const doneN = (m['discussed'] ?? 0) + (m['concurred'] ?? 0) + (m['disagreed'] ?? 0) + (m['hr_review'] ?? 0) + (m['closed'] ?? 0);
                    return (
                      <tr key={hod} className="border-b border-slate-50 last:border-0">
                        <td className="px-3 py-1.5 font-medium">{hod}</td>
                        <td className="px-3 py-1.5">{teamTotal}</td>
                        <td className="px-3 py-1.5 text-slate-500">{m['invited'] ?? 0}</td>
                        <td className={`px-3 py-1.5 ${m['self_submitted'] ? 'text-amber-700 font-semibold' : 'text-slate-500'}`}>{m['self_submitted'] ?? 0}</td>
                        <td className={`px-3 py-1.5 ${m['scored'] ? 'text-violet-700 font-semibold' : 'text-slate-500'}`}>{m['scored'] ?? 0}</td>
                        <td className="px-3 py-1.5 text-green-700">{doneN}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-sm">Recent activity</h2>
          <Link href="/admin/audit" className="text-xs text-brand font-medium">Full audit trail →</Link>
        </div>
        {activity.length === 0 && <p className="text-xs text-slate-400">Nothing yet.</p>}
        {activity.map((a, i) => (
          <div key={i} className="flex items-baseline gap-2 py-1 border-b border-slate-50 last:border-0 text-sm">
            <span className="text-xs text-slate-400 font-mono shrink-0 w-36">{a.at.slice(0, 16).replace('T', ' ')}</span>
            <span>
              {a.full_name ? <span className="font-medium">{a.full_name}: </span> : null}
              {ACTION_LABEL[a.action] ?? a.action}
              {a.actor_type === 'admin' && a.actor_label ? <span className="text-xs text-slate-400"> · by {a.actor_label}</span> : null}
            </span>
          </div>
        ))}
      </section>
    </AdminShell>
  );
}
