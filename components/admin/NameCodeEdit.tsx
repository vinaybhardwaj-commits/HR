'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Inline name (+ optional emp code) editor for roster rows. Pencil → inputs → save. */
export default function NameCodeEdit({ role, id, name, code }:
  { role: 'employee' | 'appraiser'; id: number; name: string; code?: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [n, setN] = useState(name);
  const [c, setC] = useState(code ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (n.trim() === name && (role !== 'employee' || c.trim() === (code ?? ''))) { setEditing(false); return; }
    setBusy(true); setErr(null);
    const body: Record<string, string> = { full_name: n };
    if (role === 'employee') body.emp_code = c;
    const res = await fetch(`/api/admin/roster/${role === 'employee' ? 'employees' : 'appraisers'}/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const j = await res.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (res.ok) { setEditing(false); router.refresh(); }
    else setErr(j.error ?? 'Failed');
  }

  if (!editing) {
    return (
      <span className="group inline-flex items-center gap-1.5">
        {role === 'employee' && <span className="font-mono text-xs text-slate-500">{code}</span>}
        <span className="font-medium">{name}</span>
        <button onClick={() => { setN(name); setC(code ?? ''); setEditing(true); }}
          title="Correct name / code"
          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-brand text-xs">✎</button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {role === 'employee' && (
        <input value={c} onChange={e => setC(e.target.value)} disabled={busy}
          className="border border-slate-300 rounded-md px-1.5 py-1 text-xs font-mono w-24" />
      )}
      <input value={n} onChange={e => setN(e.target.value)} disabled={busy} autoFocus
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        className="border border-slate-300 rounded-md px-1.5 py-1 text-xs w-44" />
      <button onClick={save} disabled={busy} className="text-xs text-green-700 border border-green-300 rounded-md px-2 py-1">
        {busy ? '…' : 'Save'}
      </button>
      <button onClick={() => setEditing(false)} disabled={busy} className="text-xs text-slate-500">cancel</button>
      {err && <span className="text-[11px] text-red-600 w-full">{err}</span>}
    </span>
  );
}
