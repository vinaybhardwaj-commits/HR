'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type FactorScore = { code: string; label: string; value: number; level: string; example: string | null };

const CHOICES = [
  { v: 'agree', label: 'I agree with this appraisal' },
  { v: 'agree_remarks', label: 'I agree, with remarks' },
  { v: 'disagree', label: 'I disagree' }
] as const;

export default function ReviewAndSign({ token, scores, totals, training, discussionDate, signed }: {
  token: string;
  scores: FactorScore[];
  totals: { total: number | null; percent: string | null; band: string | null };
  training: { category: string; detail: string | null }[];
  discussionDate: string | null;
  signed: { choice: string; remarks: string | null; signed_name: string; signed_at: string } | null;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<string>('agree');
  const [remarks, setRemarks] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!confirm('Sign and submit your response? This completes your appraisal.')) return;
    setBusy(true); setError(null);
    const res = await fetch('/api/me/concur', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, choice, remarks, signed_name: name })
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((j as { error?: string }).error ?? 'Failed');
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Your assessment</h2>
          <div className="text-sm">
            <span className="font-bold">{totals.total}</span> · <span className="font-bold">{totals.percent}%</span>
            <span className="ml-2 text-xs font-bold rounded-full px-2.5 py-1 bg-brand-soft text-brand uppercase">{totals.band}</span>
          </div>
        </div>
        <div className="space-y-2">
          {scores.map(s => (
            <div key={s.code} className="border-b border-slate-100 last:border-0 pb-2">
              <div className="flex justify-between text-sm">
                <span>{s.label}</span>
                <span className="font-semibold">{s.value} · {s.level}</span>
              </div>
              {s.example && <p className="text-xs text-slate-500 italic mt-0.5">"{s.example}"</p>}
            </div>
          ))}
        </div>
        {training.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Training plan</div>
            {training.map((t, i) => (
              <p key={i} className="text-sm text-slate-600">• {t.category}{t.detail ? ` — ${t.detail}` : ''}</p>
            ))}
          </div>
        )}
        {discussionDate && (
          <p className="text-xs text-slate-500 mt-3">Appraisal discussion held on {discussionDate}.</p>
        )}
      </div>

      {signed ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="font-semibold mb-1">Signed ✅</h2>
          <p className="text-sm text-slate-600">
            {CHOICES.find(c => c.v === signed.choice)?.label} — signed by {signed.signed_name}.
          </p>
          {signed.remarks && <p className="text-sm text-slate-500 mt-1">Remarks: {signed.remarks}</p>}
          {signed.choice === 'disagree' && (
            <p className="text-xs text-slate-500 mt-2">HR will review your response before this appraisal is finalised.</p>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="font-semibold mb-3">Your response</h2>
          <div className="space-y-2 mb-3">
            {CHOICES.map(c => (
              <label key={c.v} className={`flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer
                ${choice === c.v ? 'border-brand bg-brand-soft' : 'border-slate-200'}`}>
                <input type="radio" name="choice" checked={choice === c.v} onChange={() => setChoice(c.v)} />
                <span className="text-sm font-medium">{c.label}</span>
              </label>
            ))}
          </div>
          {choice !== 'agree' && (
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Your remarks *</label>
              <textarea rows={3} value={remarks} onChange={e => setRemarks(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" />
            </div>
          )}
          <label className="block text-sm font-medium mb-1">Type your full name to sign *</label>
          <p className="text-xs text-slate-500 mb-2">Must match your name as per HR records.</p>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base mb-3" />
          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          <button onClick={submit} disabled={busy || !name.trim()}
            className="w-full bg-brand text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40">
            {busy ? 'Signing…' : 'Sign & submit'}
          </button>
        </div>
      )}
    </div>
  );
}
