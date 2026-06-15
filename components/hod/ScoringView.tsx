'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { bandFor, exampleRequired } from '@/lib/scoring';

type Factor = { code: string; label: string; description: string | null; anchors: Record<string, string> };
type ScoreRow = { factor_code: string; value: number; example_text: string | null };
type Training = { category: string; detail: string | null };

const CATEGORIES = ['Clinical skills', 'Communication', 'Software / systems', 'Compliance & safety',
  'Service & soft skills', 'Leadership', 'Other'];

const LEVEL_LABEL: Record<number, string> = {
  5: 'Exceptional', 4: 'Exceeds', 3: 'Meets', 2: 'Partially meets', 1: 'Does not meet'
};

export default function ScoringView({ token, appraisalId, status, employeeName, reopenedCount, selfJson, factors, initialScores, initialTraining, result }: {
  token: string; appraisalId: string; status: string; employeeName: string; reopenedCount: number;
  selfJson: Record<string, unknown> | null;
  factors: Factor[];
  initialScores: ScoreRow[];
  initialTraining: Training[];
  result: { total: number | null; percent: string | null; band: string | null; discussionDate: string | null };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'self' | 'score'>('score');
  const [scores, setScores] = useState<Record<string, { value?: number; example?: string }>>(() => {
    const m: Record<string, { value?: number; example?: string }> = {};
    for (const s of initialScores) m[s.factor_code] = { value: s.value, example: s.example_text ?? '' };
    return m;
  });
  const [training, setTraining] = useState<{ category: string; detail: string }[]>(
    initialTraining.length ? initialTraining.map(t => ({ category: t.category, detail: t.detail ?? '' })) : []);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [discussionDate, setDiscussionDate] = useState('');
  const [justSubmitted, setJustSubmitted] = useState<{ total: number; percent: number; band: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editable = ['invited', 'self_submitted'].includes(status);
  const scoredCount = factors.filter(f => scores[f.code]?.value).length;
  const live = useMemo(() => {
    let total = 0;
    for (const f of factors) total += scores[f.code]?.value ?? 0;
    const max = factors.length * 5;
    const pct = max ? Math.round((total / max) * 1000) / 10 : 0;
    return { total, max, pct, band: bandFor(pct) };
  }, [factors, scores]);

  const examplesMissing = factors.filter(f => {
    const s = scores[f.code];
    return s?.value && exampleRequired(s.value) && !s.example?.trim();
  });
  const canSubmit = editable && scoredCount === factors.length && examplesMissing.length === 0;

  function payload(submit: boolean) {
    return {
      token, appraisalId, submit,
      scores: factors.filter(f => scores[f.code]?.value).map(f => ({
        factor_code: f.code, value: scores[f.code].value!, example_text: scores[f.code].example ?? ''
      })),
      training: training.filter(t => t.category)
    };
  }

  async function save(submit = false) {
    setSaved('saving'); setError(null);
    const res = await fetch('/api/hod/score', {
      method: submit ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload(submit))
    });
    const j = await res.json().catch(() => ({})) as
      { error?: string; message?: string; total?: number; percent?: number; band?: string };
    if (!res.ok) {
      setSaved('idle');
      setError(j.error === 'already_submitted'
        ? (j.message ?? 'Already submitted — scores are locked.')
        : j.error ?? 'Could not save');
      if (j.error === 'already_submitted') router.refresh();
      return;
    }
    setSaved('saved');
    if (submit) {
      if (typeof j.total === 'number') setJustSubmitted({ total: j.total, percent: j.percent ?? 0, band: j.band ?? '' });
      router.refresh();
    }
  }

  function queueSave() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { save(false).catch(() => setSaved('idle')); }, 1200);
  }

  async function markDiscussion() {
    if (!discussionDate) { setError('Pick the discussion date first'); return; }
    setError(null);
    const res = await fetch('/api/hod/discussion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, appraisalId, date: discussionDate })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError((j as { error?: string }).error ?? 'Failed'); return; }
    router.refresh();
  }

  const self = (selfJson ?? {}) as {
    accomplishments?: string; challenges?: string; duty_changes?: string;
    goals?: { goal: string; measure: string }[]; training_wants?: string;
  };

  const partA = (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 text-sm space-y-3 lg:max-h-[70vh] lg:overflow-y-auto">
      <div className="text-[11px] font-semibold text-slate-500 uppercase">Part A — self-appraisal (read-only)</div>
      {!selfJson && <p className="text-slate-500">Not submitted yet.</p>}
      {([['Accomplishments', self.accomplishments], ['Challenges', self.challenges],
        ['Changes to duties', self.duty_changes], ['Training requested', self.training_wants]] as const)
        .map(([k, v]) => v ? (
          <div key={k}>
            <div className="font-medium">{k}</div>
            <p className="text-slate-600 whitespace-pre-wrap">{v}</p>
          </div>
        ) : null)}
      {self.goals?.some(g => g.goal) && (
        <div>
          <div className="font-medium">Goals</div>
          {self.goals.filter(g => g.goal).map((g, i) => (
            <p key={i} className="text-slate-600">{i + 1}. {g.goal}{g.measure ? ` — measured by: ${g.measure}` : ''}</p>
          ))}
        </div>
      )}
    </div>
  );

  const banners = (
    <>
      {justSubmitted && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4">
          <p className="font-semibold text-green-800">✓ Scores submitted for {employeeName}</p>
          <p className="text-sm text-green-700 mt-1">
            Total <span className="font-bold">{justSubmitted.total}</span> · {justSubmitted.percent}% ·{' '}
            <span className="font-bold">{justSubmitted.band}</span>. Scores are now locked.
            Next: hold the face-to-face discussion, then record the date in the bar below —
            that records the discussion and completes the appraisal (the employee accepts it via the discussion).
          </p>
        </div>
      )}
      {!justSubmitted && reopenedCount > 0 && editable && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
          <p className="font-semibold text-amber-800">Reopened by HR — you are editing version {reopenedCount + 1}</p>
          <p className="text-sm text-amber-700 mt-1">
            The previous submission is preserved on record. Re-score all factors and submit again.
          </p>
        </div>
      )}
    </>
  );

  const scoring = (
    <div className="space-y-3">
      {factors.map(f => {
        const s = scores[f.code] ?? {};
        const needsEx = s.value ? exampleRequired(s.value) : false;

  return (
          <div key={f.code} className={`bg-white border rounded-2xl p-4 ${needsEx && !s.example?.trim() ? 'border-amber-300' : 'border-slate-200'}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold">{f.code} · {f.label}</div>
                {f.description && <div className="text-xs text-slate-500 mt-0.5">{f.description}</div>}
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" disabled={!editable}
                    onClick={() => { setScores(p => ({ ...p, [f.code]: { ...p[f.code], value: n } })); queueSave(); }}
                    className={`w-10 h-10 rounded-lg border text-sm font-semibold
                      ${s.value === n ? 'bg-brand text-white border-brand' : 'border-slate-300 text-slate-600'}
                      ${!editable ? 'opacity-60' : ''}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {s.value && (
              <p className="text-xs text-slate-600 mt-2">
                <span className="font-semibold">{s.value} — {LEVEL_LABEL[s.value]}:</span> {f.anchors[String(s.value)]}
              </p>
            )}
            {needsEx && editable && (
              <div className="mt-2">
                <label className="block text-xs font-medium text-amber-700 mb-1">
                  A specific example is required for a score of {s.value}
                </label>
                <textarea rows={2} value={s.example ?? ''}
                  onChange={e => { setScores(p => ({ ...p, [f.code]: { ...p[f.code], example: e.target.value } })); queueSave(); }}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            )}
            {!editable && s.example?.trim() && (
              <p className="text-xs text-slate-500 mt-2 italic">Example: {s.example}</p>
            )}
          </div>
        );
      })}

      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="text-sm font-semibold mb-1">Training needs</div>
        <p className="text-xs text-slate-500 mb-3">Areas where training would improve their performance (up to 3).</p>
        {training.map((t, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <select value={t.category} disabled={!editable}
              onChange={e => { const ts = [...training]; ts[i] = { ...ts[i], category: e.target.value }; setTraining(ts); queueSave(); }}
              className="border border-slate-300 rounded-lg px-2 py-2 text-sm">
              <option value="">Category…</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input value={t.detail} disabled={!editable} placeholder="Detail (optional)"
              onChange={e => { const ts = [...training]; ts[i] = { ...ts[i], detail: e.target.value }; setTraining(ts); queueSave(); }}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        ))}
        {editable && training.length < 3 && (
          <button type="button" onClick={() => setTraining([...training, { category: '', detail: '' }])}
            className="text-sm text-brand font-medium">+ Add training need</button>
        )}
      </div>
    </div>
  );

  return (
    <div>
      {banners}
      {/* mobile tabs */}
      <div className="flex lg:hidden gap-2 mb-3">
        <button onClick={() => setTab('self')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium border ${tab === 'self' ? 'bg-brand text-white border-brand' : 'border-slate-300'}`}>
          Their self-appraisal
        </button>
        <button onClick={() => setTab('score')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium border ${tab === 'score' ? 'bg-brand text-white border-brand' : 'border-slate-300'}`}>
          Your assessment
        </button>
      </div>
      <div className="lg:grid lg:grid-cols-[2fr,3fr] lg:gap-4">
        <div className={tab === 'self' ? '' : 'hidden lg:block'}>{partA}</div>
        <div className={tab === 'score' ? 'mt-3 lg:mt-0' : 'hidden lg:block'}>{scoring}</div>
      </div>

      {/* sticky summary */}
      <div className="sticky bottom-0 mt-4 -mx-4 sm:-mx-6 border-t border-slate-200 bg-white/95 backdrop-blur px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {editable ? (
          <div className="flex items-center justify-between gap-3 max-w-5xl mx-auto flex-wrap">
            <div className="text-sm">
              <span className="font-bold">{live.total} / {live.max}</span>
              <span className="text-slate-400"> · </span>
              <span className="font-bold">{live.pct}%</span>
              {scoredCount === factors.length && (
                <span className="ml-2 text-xs font-bold rounded-full px-2.5 py-1 bg-brand-soft text-brand uppercase">{live.band}</span>
              )}
              <span className="text-xs text-slate-500 ml-2">{scoredCount}/{factors.length} scored
                {examplesMissing.length > 0 && ` · ${examplesMissing.length} example(s) needed`}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved ✓' : ''}</span>
              <button onClick={() => save(false)} className="border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium">Save draft</button>
              <button onClick={() => { if (confirm('Submit scores? You cannot edit after submitting.')) save(true); }}
                disabled={!canSubmit || saved === 'saving'}
                className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40">
                Submit scores
              </button>
            </div>
          </div>
        ) : status === 'scored' ? (
          <div className="flex items-center justify-between gap-3 max-w-5xl mx-auto flex-wrap">
            <div className="text-sm">
              <span className="font-bold">{result.total}</span> · <span className="font-bold">{result.percent}%</span>
              <span className="ml-2 text-xs font-bold rounded-full px-2.5 py-1 bg-brand-soft text-brand uppercase">{result.band}</span>
              <span className="text-xs text-slate-500 ml-2">Submitted — now hold the 1:1, then mark it here.</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={discussionDate} onChange={e => setDiscussionDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <button onClick={markDiscussion} className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold">
                Discussion held
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm max-w-5xl mx-auto">
            <span className="font-bold">{result.total}</span> · <span className="font-bold">{result.percent}%</span>
            <span className="ml-2 text-xs font-bold rounded-full px-2.5 py-1 bg-brand-soft text-brand uppercase">{result.band}</span>
            <span className="text-xs text-slate-500 ml-2">
              Discussion held{result.discussionDate ? ` on ${result.discussionDate}` : ''} — recorded as discussed & accepted.
            </span>
          </div>
        )}
        {error && <p className="text-sm text-red-600 mt-1 max-w-5xl mx-auto">{error}</p>}
      </div>
    </div>
  );
}
