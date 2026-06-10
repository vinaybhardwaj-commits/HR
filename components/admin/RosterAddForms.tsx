'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Hod = { id: number; full_name: string };

export function AddEmployeeForm({ hods }: { hods: Hod[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [f, setF] = useState({ emp_code: '', full_name: '', department: '', sub_department: '', designation: '', track: 'N', hod: hods[0]?.id ?? 0, email: '' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setOkMsg(null);
    const res = await fetch('/api/admin/roster/employees', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, default_appraiser_id: Number(f.hod) })
    });
    const j = await res.json().catch(() => ({})) as { error?: string; live_cycles?: { label: string }[] };
    setBusy(false);
    if (res.ok) {
      const live = j.live_cycles ?? [];
      setOkMsg(`${f.full_name} added.` + (live.length
        ? ` To include them in ${live.map(c => c.label).join(', ')}, open the cycle and press "Re-run launch (fill missing)" — that creates their appraisal and personal link.`
        : ''));
      setF({ emp_code: '', full_name: '', department: '', sub_department: '', designation: '', track: 'N', hod: hods[0]?.id ?? 0, email: '' });
      router.refresh();
    } else setErr(j.error ?? 'Failed');
  }

  const inp = 'border border-slate-300 rounded-lg px-3 py-2 text-sm';
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
      <button onClick={() => setOpen(!open)} className="text-sm font-semibold text-brand">
        {open ? '− Add employee' : '+ Add employee'}
      </button>
      {open && (
        <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
          <div><label className="block text-xs font-medium mb-1">Code *</label>
            <input value={f.emp_code} onChange={e => setF({ ...f, emp_code: e.target.value })} required placeholder="BA120" className={`${inp} w-24`} /></div>
          <div><label className="block text-xs font-medium mb-1">Full name *</label>
            <input value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} required className={`${inp} w-48`} /></div>
          <div><label className="block text-xs font-medium mb-1">Department *</label>
            <input value={f.department} onChange={e => setF({ ...f, department: e.target.value })} required placeholder="Hospital" className={`${inp} w-32`} /></div>
          <div><label className="block text-xs font-medium mb-1">Sub-department</label>
            <input value={f.sub_department} onChange={e => setF({ ...f, sub_department: e.target.value })} placeholder="Nursing" className={`${inp} w-32`} /></div>
          <div><label className="block text-xs font-medium mb-1">Designation</label>
            <input value={f.designation} onChange={e => setF({ ...f, designation: e.target.value })} className={`${inp} w-36`} /></div>
          <div><label className="block text-xs font-medium mb-1">Track *</label>
            <select value={f.track} onChange={e => setF({ ...f, track: e.target.value })} className={inp}>
              <option value="C">Clinical</option><option value="N">Non-clinical</option>
            </select></div>
          <div><label className="block text-xs font-medium mb-1">HOD *</label>
            <select value={f.hod} onChange={e => setF({ ...f, hod: Number(e.target.value) })} className={`${inp} max-w-[12rem]`}>
              {hods.map(h => <option key={h.id} value={h.id}>{h.full_name}</option>)}
            </select></div>
          <button disabled={busy} className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {busy ? 'Adding…' : 'Add employee'}
          </button>
          {err && <p className="text-sm text-red-600 w-full">{err}</p>}
        </form>
      )}
      {okMsg && <p className="text-sm text-green-700 mt-2">{okMsg}</p>}
    </div>
  );
}

export function AddAppraiserForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const res = await fetch('/api/admin/roster/appraisers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: name, email })
    });
    const j = await res.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (res.ok) { setName(''); setEmail(''); router.refresh(); }
    else setErr(j.error ?? 'Failed');
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
      <button onClick={() => setOpen(!open)} className="text-sm font-semibold text-brand">
        {open ? '− Add HOD' : '+ Add HOD'}
      </button>
      {open && (
        <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
          <div><label className="block text-xs font-medium mb-1">Full name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-56" /></div>
          <div><label className="block text-xs font-medium mb-1">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-56" /></div>
          <button disabled={busy} className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {busy ? 'Adding…' : 'Add HOD'}
          </button>
          {err && <p className="text-sm text-red-600 w-full">{err}</p>}
        </form>
      )}
      <p className="text-xs text-slate-500 mt-2">
        New HODs get their personal queue link automatically once an employee is mapped to them and the cycle&apos;s launch is re-run.
      </p>
    </div>
  );
}
