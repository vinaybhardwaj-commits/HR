'use client';

type FactorScore = { code: string; label: string; value: number; level: string; example: string | null };

// Retained only to render the label of any sign-off captured BEFORE the policy
// change (15 Jun 2026). New appraisals are accepted via the 1:1 discussion — there
// is no separate employee sign-off step.
const CHOICE_LABEL: Record<string, string> = {
  agree: 'I agree with this appraisal',
  agree_remarks: 'I agree, with remarks',
  disagree: 'I disagree',
};

export default function ReviewAndSign({ scores, totals, training, discussionDate, signed }: {
  token?: string;
  scores: FactorScore[];
  totals: { total: number | null; percent: string | null; band: string | null };
  training: { category: string; detail: string | null }[];
  discussionDate: string | null;
  signed: { choice: string; remarks: string | null; signed_name: string; signed_at: string } | null;
}) {
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
      </div>

      {signed ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="font-semibold mb-1">Signed ✅</h2>
          <p className="text-sm text-slate-600">
            {CHOICE_LABEL[signed.choice] ?? signed.choice} — signed by {signed.signed_name}.
          </p>
          {signed.remarks && <p className="text-sm text-slate-500 mt-1">Remarks: {signed.remarks}</p>}
        </div>
      ) : (
        <div className="bg-white border border-green-200 bg-green-50/40 rounded-2xl p-5">
          <h2 className="font-semibold mb-1 text-green-800">Discussed &amp; accepted ✅</h2>
          <p className="text-sm text-slate-700">
            Your appraisal was discussed with your manager{discussionDate ? ` on ${discussionDate}` : ''}.
            The discussion is taken as your acknowledgement of this appraisal — there is nothing further you need to do.
          </p>
          <p className="text-xs text-slate-500 mt-2">
            If anything here looks wrong, please raise it with your manager or HR.
          </p>
        </div>
      )}
    </div>
  );
}
