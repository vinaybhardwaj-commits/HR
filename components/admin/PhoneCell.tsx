'use client';
import { useState } from 'react';

/** Inline phone editor for roster rows (employee or appraiser). Saves on blur/Enter. */
export default function PhoneCell({ role, id, phone }:
  { role: 'employee' | 'appraiser'; id: number; phone: string | null }) {
  const [value, setValue] = useState(phone ?? '');
  const [saved, setSaved] = useState<string | null>(phone ?? null);
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (value.trim() === (saved ?? '')) return;
    setState('busy'); setErr(null);
    const res = await fetch('/api/admin/roster/phone', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, id, phone: value })
    });
    const j = await res.json().catch(() => ({})) as { phone?: string | null; error?: string };
    if (res.ok) {
      setSaved(j.phone ?? null); setValue(j.phone ?? ''); setState('ok');
      setTimeout(() => setState('idle'), 1200);
    } else {
      setState('err'); setErr(j.error ?? 'Save failed');
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          value={value}
          onChange={e => { setValue(e.target.value); setState('idle'); setErr(null); }}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="98765 43210"
          inputMode="tel"
          className={`border rounded-md px-2 py-1 text-xs w-32 font-mono
            ${state === 'err' ? 'border-red-400' : 'border-slate-200 focus:border-brand'}`}
        />
        {state === 'busy' && <span className="text-[10px] text-slate-400">…</span>}
        {state === 'ok' && <span className="text-[10px] text-green-600">✓</span>}
      </div>
      {err && <p className="text-[10px] text-red-600 mt-0.5">{err}</p>}
    </div>
  );
}
