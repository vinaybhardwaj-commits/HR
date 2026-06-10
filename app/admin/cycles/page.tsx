import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import CreateCycleForm from '@/components/admin/CreateCycleForm';
import PageHelp from '@/components/admin/PageHelp';

export const dynamic = 'force-dynamic';

export default async function Cycles() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin');
  const cycles = (await sql()`
    SELECT c.id, c.label, c.type, c.period_from::text, c.period_to::text, c.status, c.is_test,
           (SELECT count(*)::int FROM appraisal a WHERE a.cycle_id = c.id) AS appraisals
    FROM cycle c ORDER BY c.id DESC`) as
    { id: number; label: string; type: string; period_from: string; period_to: string; status: string; is_test: boolean; appraisals: number }[];

  return (
    <AdminShell active="/admin/cycles" adminName={admin.name}>
      <h1 className="text-xl font-bold mb-1">Appraisal cycles</h1>
      <p className="text-sm text-slate-500 mb-4">Create a cycle, launch it, then share the personal links.</p>
      <PageHelp items={[
        'Create a cycle with a label (e.g. \u201CH1 2026\u201D), type and review period. Tick \u201CTest cycle\u201D for rehearsals — test cycles carry a purple TEST badge, stay out of the dashboard and report defaults, and can be purged completely afterwards.',
        'A cycle is draft until you launch it from its page. Launch creates an appraisal for every active employee and mints one personal link per employee and per HOD. Launch is safe to re-run — it only fills in anything missing.',
        'Statuses: draft → live (launched, in progress) → closed (sign-offs finalised, PDFs available).',
        'Open a cycle for everything else: the board, WhatsApp link sharing, closing, and (for test cycles) purge.'
      ]} />
      <CreateCycleForm />
      <div className="mt-6 space-y-2">
        {cycles.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 text-sm text-slate-500">
            No cycles yet — create the first one above.
          </div>
        )}
        {cycles.map(c => (
          <Link key={c.id} href={`/admin/cycles/${c.id}`}
            className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-4 hover:border-brand">
            <div>
              <div className="font-semibold">
                {c.label}
                {c.is_test && (
                  <span className="ml-2 text-[10px] font-bold rounded-full px-2 py-0.5 bg-purple-100 text-purple-700 align-middle">TEST</span>
                )}
              </div>
              <div className="text-xs text-slate-500">{c.period_from} → {c.period_to} · {c.appraisals} appraisals</div>
            </div>
            <span className={`text-xs font-semibold rounded-full px-3 py-1
              ${c.status === 'live' ? 'bg-green-50 text-green-700' :
                c.status === 'closed' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>
              {c.status}
            </span>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
