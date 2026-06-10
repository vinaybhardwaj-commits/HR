import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';

export default async function Audit({ searchParams }: { searchParams: { action?: string; appraisal?: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin');
  const action = searchParams.action?.trim() || null;
  const appraisal = searchParams.appraisal?.trim() || null;

  const rows = (await sql()`
    SELECT id, at::text, actor_type, actor_label, action, appraisal_id, meta
    FROM audit_log
    WHERE (${action}::text IS NULL OR action ILIKE '%' || ${action} || '%')
      AND (${appraisal}::text IS NULL OR appraisal_id = ${appraisal})
    ORDER BY id DESC LIMIT 200`) as {
    id: number; at: string; actor_type: string; actor_label: string | null;
    action: string; appraisal_id: string | null; meta: Record<string, unknown> | null;
  }[];

  return (
    <AdminShell active="/admin/audit" adminName={admin.name}>
      <h1 className="text-xl font-bold mb-1">Audit log</h1>
      <p className="text-sm text-slate-500 mb-4">Last 200 events (filterable).</p>
      <form className="flex flex-wrap gap-2 mb-4">
        <input name="action" defaultValue={action ?? ''} placeholder="Filter by action…"
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
        <input name="appraisal" defaultValue={appraisal ?? ''} placeholder="Appraisal id (apr_…)"
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
        <button className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm">Filter</button>
      </form>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="px-4 py-3">When (UTC)</th><th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th><th className="px-4 py-3">Appraisal</th>
              <th className="px-4 py-3">Meta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 align-top">
                <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">{r.at.slice(0, 19)}</td>
                <td className="px-4 py-2 text-xs">{r.actor_type}{r.actor_label ? ` · ${r.actor_label}` : ''}</td>
                <td className="px-4 py-2 font-medium text-xs">{r.action}</td>
                <td className="px-4 py-2 font-mono text-[10px]">{r.appraisal_id ?? ''}</td>
                <td className="px-4 py-2 text-[10px] text-slate-500 max-w-xs truncate">
                  {r.meta ? JSON.stringify(r.meta) : ''}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-sm text-slate-500">No events match.</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
