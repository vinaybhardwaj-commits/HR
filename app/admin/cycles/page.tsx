import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import CreateCycleForm from '@/components/admin/CreateCycleForm';

export const dynamic = 'force-dynamic';

export default async function Cycles() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin');
  const cycles = (await sql()`
    SELECT c.id, c.label, c.type, c.period_from::text, c.period_to::text, c.status,
           (SELECT count(*)::int FROM appraisal a WHERE a.cycle_id = c.id) AS appraisals
    FROM cycle c ORDER BY c.id DESC`) as
    { id: number; label: string; type: string; period_from: string; period_to: string; status: string; appraisals: number }[];

  return (
    <AdminShell active="/admin/cycles" adminName={admin.name}>
      <h1 className="text-xl font-bold mb-1">Appraisal cycles</h1>
      <p className="text-sm text-slate-500 mb-6">Create a cycle, then launch it to mint links for all staff.</p>
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
              <div className="font-semibold">{c.label}</div>
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
