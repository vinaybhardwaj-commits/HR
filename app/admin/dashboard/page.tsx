import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin');

  const db = sql();
  const [emp] = (await db`SELECT count(*)::int AS n FROM employee WHERE active`) as { n: number }[];
  const [apr] = (await db`SELECT count(*)::int AS n FROM appraiser WHERE active`) as { n: number }[];
  const [fac] = (await db`SELECT count(*)::int AS n FROM factor WHERE active`) as { n: number }[];
  const [cyc] = (await db`SELECT count(*)::int AS n FROM cycle WHERE status = 'live'`) as { n: number }[];

  const cards = [
    { label: 'Active employees', value: emp.n },
    { label: 'Appraisers (HODs)', value: apr.n },
    { label: 'Factors seeded', value: fac.n },
    { label: 'Live cycles', value: cyc.n }
  ];

  return (
    <AdminShell active="/admin/dashboard" adminName={admin.name}>
      <h1 className="text-xl font-bold mb-1">Dashboard</h1>
      <p className="text-sm text-slate-500 mb-6">P1 foundation — cycle management arrives in P2.</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="text-3xl font-bold">{c.value}</div>
            <div className="text-sm text-slate-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
