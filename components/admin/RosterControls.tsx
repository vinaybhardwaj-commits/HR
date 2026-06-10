'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Hod = { id: number; full_name: string };
type Result = { notes?: string[]; moved?: { cycle: string }[]; kept?: { cycle: string; status: string }[]; error?: string };

/** Per-employee row controls: HOD remap, track, deactivate. */
export function EmployeeRowControls({ id, name, hodId, track, active, hods }:
  { id: number; name: string; hodId: number; track: string; active: boolean; hods: Hod[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function patch(body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) { router.refresh(); return; }
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/admin/roster/employees/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const j = await res.json().catch(() => ({})) as Result;
    setBusy(false);
    if (res.ok) {
      const parts: string[] = [];
      if (j.moved?.length) parts.push(`moved to the new HOD in ${j.moved.map(m => m.cycle).join(', ')}`);
      if (j.kept?.length) parts.push(`stays with the previous HOD for ${j.kept.map(k => k.cycle).join(', ')} (already ${j.kept[0].status})`);
      if (j.notes?.length) parts.push(...j.notes.filter(n => !n.startsWith('HOD')));
      setMsg({ ok: true, text: parts.length ? parts.join(' · ') : 'Saved ✓' });
      router.refresh();
    } else {
      setMsg({ ok: false, text: j.error ?? 'Failed' });
      router.refresh();
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <select value={hodId} disabled={busy}
          onChange={e => patch({ default_appraiser_id: Number(e.target.value) },
            `Move ${name} to ${hods.find(h => h.id === Number(e.target.value))?.full_name}?\n\nIn a live cycle: if not yet scored, their appraisal moves to the new HOD now; if already scored, it stays with the scorer and only future cycles change.`)}
          className="border border-slate-200 rounded-md px-1.5 py-1 text-xs max-w-[11rem]">
          {hods.map(h => <option key={h.id} value={h.id}>{h.full_name}</option>)}
        </select>
        <select value={track} disabled={busy}
          onChange={e => patch({ track: e.target.value },
            `Change ${name}'s track? This switches which 4 specialised factors apply. Blocked if scoring has already started in a live cycle.`)}
          className="border border-slate-200 rounded-md px-1.5 py-1 text-xs">
          <option value="C">Clinical</option>
          <option value="N">Non-clinical</option>
        </select>
        <button disabled={busy}
          onClick={() => patch({ active: !active },
            active ? `Deactivate ${name}? They are excluded from future launches. If they have an open appraisal in a live cycle, cancel it from the cycle board.` : undefined)}
          className={`text-xs rounded-md px-2 py-1 border ${active
            ? 'border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600'
            : 'border-green-300 text-green-700'}`}>
          {active ? 'Deactivate' : 'Reactivate'}
        </button>
      </div>
      {msg && <p className={`text-[11px] mt-1 ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
    </div>
  );
}

/** Appraiser row: deactivate/reactivate with mapped-employee guard server-side. */
export function AppraiserRowControls({ id, name, active, team }:
  { id: number; name: string; active: boolean; team: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function toggle() {
    if (active && !confirm(`Deactivate HOD ${name}? Only possible once no employees are mapped to them.`)) return;
    setBusy(true); setErr(null);
    const res = await fetch(`/api/admin/roster/appraisers/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active })
    });
    const j = await res.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (res.ok) router.refresh();
    else setErr(j.error ?? 'Failed');
  }
  return (
    <div>
      <button onClick={toggle} disabled={busy || (active && team > 0)}
        title={active && team > 0 ? 'Remap their employees first' : undefined}
        className={`text-xs rounded-md px-2 py-1 border disabled:opacity-40 ${active
          ? 'border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600'
          : 'border-green-300 text-green-700'}`}>
        {active ? 'Deactivate' : 'Reactivate'}
      </button>
      {err && <p className="text-[11px] mt-1 text-red-600">{err}</p>}
    </div>
  );
}
