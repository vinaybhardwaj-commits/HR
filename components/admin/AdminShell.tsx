import Link from 'next/link';
import SignOutButton from '@/components/admin/SignOutButton';

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/roster', label: 'Roster' },
  { href: '/admin/cycles', label: 'Cycles' },
  { href: '/admin/scoring', label: 'Scoring' },
  { href: '/admin/review', label: 'Review' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/audit', label: 'Audit' }
];

export default function AdminShell({ active, adminName, children }:
  { active: string; adminName: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4 flex flex-col">
        <div className="font-bold mb-6">EVEN <span className="font-normal text-slate-500">· Appraise</span></div>
        <nav className="space-y-1 text-sm flex-1">
          {NAV.map(n => (
            <Link key={n.href} href={n.href}
              className={`block rounded-lg px-3 py-2 ${active === n.href
                ? 'bg-brand-soft text-brand font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-slate-400 truncate">{adminName}</div>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
