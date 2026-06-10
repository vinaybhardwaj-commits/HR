'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type LinkRow = { role: string; name: string; url: string };

export default function CycleControl({ cycleId, status, appraisals }:
  { cycleId: number; status: string; appraisals: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function launch() {
    if (!confirm(`Launch this cycle? This creates appraisals and personal links for all active staff.`)) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/cycles/${cycleId}/launch`, { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((j as { error?: string }).error ?? 'Launch failed');
  }

  async function loadLinks() {
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/cycles/${cycleId}/links`);
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setLinks((j as { links: LinkRow[] }).links);
    else setError('Could not load links');
  }

  async function copy(url: string, name: string) {
    await navigator.clipboard.writeText(url);
    setCopied(name);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-3">
        {status !== 'closed' && (
          <button onClick={launch} disabled={busy}
            className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {appraisals > 0 ? 'Re-run launch (fill missing)' : 'Launch cycle'}
          </button>
        )}
        {appraisals > 0 && (
          <button onClick={loadLinks} disabled={busy}
            className="border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            {links ? 'Refresh links' : 'Show portal links'}
          </button>
        )}
        <span className="text-xs text-slate-500">
          Links are personal — share each via WhatsApp/print. Email invites arrive once addresses are added.
        </span>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {links && (
        <div className="mt-4 max-h-96 overflow-y-auto border-t border-slate-100 pt-3">
          {(['hod', 'employee'] as const).map(role => (
            <div key={role} className="mb-3">
              <div className="text-xs font-semibold text-slate-500 uppercase mb-1">
                {role === 'hod' ? 'HOD links' : 'Employee links'}
              </div>
              {links.filter(l => l.role === role).map(l => (
                <div key={l.url} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-sm">{l.name}</span>
                  <button onClick={() => copy(l.url, l.name)}
                    className="text-xs border border-slate-300 rounded-md px-2.5 py-1 hover:border-brand">
                    {copied === l.name ? 'Copied ✓' : 'Copy link'}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
