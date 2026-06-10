'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateCycleForm() {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [type, setType] = useState('H');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [isTest, setIsTest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch('/api/admin/cycles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, type, period_from: from, period_to: to, is_test: isTest })
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setLabel(''); setIsTest(false); router.refresh(); }
    else setError((j as { error?: string }).error ?? 'Failed');
  }

  return (
    <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium mb-1">Label</label>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="H1 2026" required
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-36" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Type</label>
        <select value={type} onChange={e => setType(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
          <option value="Q">Quarterly</option>
          <option value="H">Half-yearly</option>
          <option value="A">Annual</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">From</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} required
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">To</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} required
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
      </div>
      <label className="flex items-center gap-1.5 text-sm text-slate-600 pb-2.5" title="Test cycles are excluded from the dashboard and report defaults, and can be purged from the cycle page.">
        <input type="checkbox" checked={isTest} onChange={e => setIsTest(e.target.checked)} />
        Test cycle
      </label>
      <button disabled={busy} className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
        {busy ? 'Creating…' : 'Create cycle'}
      </button>
      {error && <p className="text-sm text-red-600 w-full">{error}</p>}
    </form>
  );
}
