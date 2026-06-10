import { sql } from '@/lib/db';
import { resolvePortalToken } from '@/lib/portal';
import { cycleFactorsForEmployee } from '@/lib/hod';
import SelfAppraisalForm from '@/components/portal/SelfAppraisalForm';
import ReviewAndSign from '@/components/portal/ReviewAndSign';
import Stepper from '@/components/portal/Stepper';

export const dynamic = 'force-dynamic';

const LEVEL_LABEL: Record<number, string> = {
  5: 'Exceptional', 4: 'Exceeds', 3: 'Meets', 2: 'Partially meets', 1: 'Does not meet'
};

function TokenError() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="text-xl font-bold mb-2">EVEN <span className="font-normal text-slate-500">· Appraise</span></div>
        <p className="text-slate-600 text-sm">This link is not valid or has expired.
          Please contact the HR department for a fresh link.</p>
      </div>
    </main>
  );
}

export default async function EmployeePortal({ params }: { params: { token: string } }) {
  const t = await resolvePortalToken(params.token);
  if (!t || t.role !== 'employee') return <TokenError />;

  const rows = (await sql()`
    SELECT a.id, a.status, a.self_json, a.total_score, a.percent::text, a.band,
           a.discussion_date::text, e.full_name, e.designation, ap.full_name AS hod,
           c.label AS cycle_label
    FROM appraisal a
    JOIN employee e ON e.id = a.employee_id
    JOIN appraiser ap ON ap.id = a.appraiser_id
    JOIN cycle c ON c.id = a.cycle_id
    WHERE a.cycle_id = ${t.cycle_id} AND a.employee_id = ${t.holder_id}`) as {
    id: string; status: string; self_json: Record<string, unknown> | null;
    total_score: number | null; percent: string | null; band: string | null;
    discussion_date: string | null; full_name: string; designation: string | null;
    hod: string; cycle_label: string;
  }[];
  const ap = rows[0];
  if (!ap) return <TokenError />;

  const reviewable = ['discussed', 'concurred', 'disagreed', 'hr_review', 'closed'].includes(ap.status);
  const step = ap.status === 'invited' ? 1
    : ['self_submitted', 'scored'].includes(ap.status) ? 2
    : ap.status === 'discussed' ? 3 : 4;

  // Scores are loaded ONLY once the discussion has been held (never earlier).
  let scores: { code: string; label: string; value: number; level: string; example: string | null }[] = [];
  let training: { category: string; detail: string | null }[] = [];
  let signed = null as { choice: string; remarks: string | null; signed_name: string; signed_at: string } | null;
  if (reviewable) {
    const factors = await cycleFactorsForEmployee(t.cycle_id, t.holder_id);
    const raw = (await sql()`SELECT factor_code, value, example_text FROM score
      WHERE appraisal_id = ${ap.id} AND NOT is_draft`) as
      { factor_code: string; value: number; example_text: string | null }[];
    const byCode = new Map(raw.map(r => [r.factor_code, r]));
    scores = factors.flatMap(f => {
      const s = byCode.get(f.code);
      return s ? [{ code: f.code, label: f.label, value: s.value, level: LEVEL_LABEL[s.value], example: s.example_text }] : [];
    });
    training = (await sql()`SELECT category, detail FROM training_need WHERE appraisal_id = ${ap.id}`) as typeof training;
    const c = (await sql()`SELECT choice, remarks, signed_name, signed_at::text FROM concurrence
      WHERE appraisal_id = ${ap.id}`) as typeof signed extends null ? never[] :
      { choice: string; remarks: string | null; signed_name: string; signed_at: string }[];
    signed = c[0] ?? null;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-xl mx-auto p-4 sm:p-6">
        <header className="mb-5">
          <div className="text-lg font-bold">EVEN <span className="font-normal text-slate-500">· Performance Appraisal</span></div>
          <p className="text-sm text-slate-600 mt-1">Hi {ap.full_name.split(' ')[0]} — {ap.cycle_label}</p>
        </header>
        <Stepper current={step} />
        {step === 1 && <SelfAppraisalForm token={params.token} initial={ap.self_json ?? {}} />}
        {step === 2 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-4">
            <h2 className="font-semibold mb-2">Thank you — your self-appraisal is in ✅</h2>
            <p className="text-sm text-slate-600">
              It is now with <span className="font-medium">{ap.hod}</span>. After your appraisal
              discussion, you will be able to review everything here and sign off.
            </p>
          </div>
        )}
        {reviewable && (
          <ReviewAndSign
            token={params.token}
            scores={scores}
            totals={{ total: ap.total_score, percent: ap.percent, band: ap.band }}
            training={training}
            discussionDate={ap.discussion_date}
            signed={signed}
          />
        )}
      </div>
    </main>
  );
}
