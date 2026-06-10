'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

type Goal = { goal: string; measure: string };
type Answers = {
  accomplishments?: string; challenges?: string; duty_changes?: string;
  goals?: Goal[]; training_wants?: string; satisfaction?: number | null;
};

const Q = [
  { key: 'accomplishments', label: 'Your most significant accomplishments this period', required: true },
  { key: 'challenges', label: 'Challenges that affected your work' },
  { key: 'duty_changes', label: 'Changes to your duties or workload this period' }
] as const;

export default function SelfAppraisalForm({ token, initial }: { token: string; initial: Record<string, unknown> }) {
  const [a, setA] = useState<Answers>({ goals: [{ goal: '', measure: '' }], ...(initial as Answers) });
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (answers: Answers, submit = false) => {
    setSaved('saving'); setError(null);
    const res = await fetch('/api/me/self', {
      method: submit ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, answers, submit })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setSaved('idle'); setError((j as { error?: string }).error ?? 'Could not save'); return false; }
    setSaved('saved');
    return true;
  }, [token]);

  const update = (patch: Partial<Answers>) => {
    const next = { ...a, ...patch };
    setA(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { save(next).catch(() => setSaved('idle')); }, 800);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function onSubmit() {
    if (!a.accomplishments?.trim()) { setError('Please fill in your accomplishments before submitting.'); return; }
    if (!confirm('Submit your self-appraisal? You will not be able to edit it afterwards.')) return;
    if (timer.current) clearTimeout(timer.current);
    const ok = await save(a, true);
    if (ok) setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-4">
        <h2 className="font-semibold mb-2">Submitted ✅</h2>
        <p className="text-sm text-slate-600">Your self-appraisal is with your HOD now. You can close this page.</p>
      </div>
    );
  }

  const goals = a.goals ?? [];
  return (
    <div className="mt-4 space-y-4">
      {Q.map(q => (
        <div key={q.key} className="bg-white border border-slate-200 rounded-2xl p-4">
          <label className="block text-sm font-medium mb-2">
            {q.label}{'required' in q && q.required ? ' *' : ''}
          </label>
          <textarea rows={4} value={(a[q.key] as string) ?? ''}
            onChange={e => update({ [q.key]: e.target.value } as Partial<Answers>)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" />
        </div>
      ))}

      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <label className="block text-sm font-medium mb-1">Goals for the next period (1–3)</label>
        <p className="text-xs text-slate-500 mb-3">For each goal, say how success will be measured.</p>
        {goals.map((g, i) => (
          <div key={i} className="mb-3 space-y-2">
            <input value={g.goal} placeholder={`Goal ${i + 1}`}
              onChange={e => { const gs = [...goals]; gs[i] = { ...gs[i], goal: e.target.value }; update({ goals: gs }); }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" />
            <input value={g.measure} placeholder="How will success be measured?"
              onChange={e => { const gs = [...goals]; gs[i] = { ...gs[i], measure: e.target.value }; update({ goals: gs }); }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" />
          </div>
        ))}
        <div className="flex gap-2">
          {goals.length < 3 && (
            <button type="button" onClick={() => update({ goals: [...goals, { goal: '', measure: '' }] })}
              className="text-sm text-brand font-medium">+ Add goal</button>
          )}
          {goals.length > 1 && (
            <button type="button" onClick={() => update({ goals: goals.slice(0, -1) })}
              className="text-sm text-slate-500">Remove last</button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <label className="block text-sm font-medium mb-2">Training or support you would like</label>
        <textarea rows={3} value={a.training_wants ?? ''}
          onChange={e => update({ training_wants: e.target.value })}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <label className="block text-sm font-medium mb-1">How satisfied are you in your current role?</label>
        <p className="text-xs text-slate-500 mb-3">Optional · visible to HR only, not your HOD.</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => update({ satisfaction: a.satisfaction === n ? null : n })}
              className={`w-11 h-11 rounded-lg border text-sm font-semibold
                ${a.satisfaction === n ? 'bg-brand text-white border-brand' : 'border-slate-300 text-slate-600'}`}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center justify-between pb-8">
        <span className="text-xs text-slate-400">
          {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved ✓' : ''}
        </span>
        <button onClick={onSubmit}
          className="bg-brand text-white rounded-xl px-6 py-3 text-sm font-semibold">
          Submit self-appraisal
        </button>
      </div>
    </div>
  );
}
