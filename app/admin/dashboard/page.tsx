import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import PageHelp from '@/components/admin/PageHelp';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin');

  const db = sql();
  const [emp] = (await db`SELECT count(*)::int AS n FROM employee WHERE active`) as { n: number }[];
  const [apr] = (await db`SELECT count(*)::int AS n FROM appraiser WHERE active`) as { n: number }[];
  const [fac] = (await db`SELECT count(*)::int AS n FROM factor WHERE active`) as { n: number }[];
  const [cyc] = (await db`SELECT count(*)::int AS n FROM cycle WHERE status = 'live' AND NOT is_test`) as { n: number }[];

  const cards = [
    { label: 'Active employees', value: emp.n },
    { label: 'Appraisers (HODs)', value: apr.n },
    { label: 'Factors seeded', value: fac.n },
    { label: 'Live cycles', value: cyc.n }
  ];

  return (
    <AdminShell active="/admin/dashboard" adminName={admin.name}>
      <h1 className="text-xl font-bold mb-1">Dashboard</h1>
      <p className="text-sm text-slate-500 mb-4">Even Healthcare performance appraisals — live overview.</p>
      <PageHelp title="How the appraisal system works" items={[
        'The flow per cycle: HR launches → employees submit their self-appraisal (Part A) → HODs score the 9 factors → HOD holds a face-to-face discussion and marks it held → the employee sees the scores and signs (agree / agree with remarks / disagree) → disagreements go to Review → HR closes signed-off appraisals and PDFs become available.',
        'Nobody except HR logs in. Every employee and HOD gets a personal link, shared by HR via WhatsApp from the cycle page. A link is the person\u2019s identity — never forwarded.',
        'Day-to-day progress lives in Cycles → open the live cycle: the board shows each person\u2019s status, and the links panel shows who is pending with one-tap WhatsApp chase.',
        'Test cycles (purple TEST badge) are rehearsal sandboxes — excluded from this dashboard and report defaults, and purgeable.'
      ]} />
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
