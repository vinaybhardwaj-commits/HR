import { sql } from '@/lib/db';
import { resolvePortalToken } from '@/lib/portal';
import SelfAppraisalForm from '@/components/portal/SelfAppraisalForm';
import Stepper from '@/components/portal/Stepper';

export const dynamic = 'force-dynamic';

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
    SELECT a.id, a.status, a.self_json, e.full_name, e.designation, ap.full_name AS hod,
           c.label AS cycle_label, c.period_from, c.period_to
    FROM appraisal a
    JOIN employee e ON e.id = a.employee_id
    JOIN appraiser ap ON ap.id = a.appraiser_id
    JOIN cycle c ON c.id = a.cycle_id
    WHERE a.cycle_id = ${t.cycle_id} AND a.employee_id = ${t.holder_id}`) as {
    id: string; status: string; self_json: Record<string, unknown> | null;
    full_name: string; designation: string | null; hod: string;
    cycle_label: string; period_from: string; period_to: string;
  }[];
  const ap = rows[0];
  if (!ap) return <TokenError />;

  const step = ap.status === 'invited' ? 1
    : ['self_submitted', 'scored'].includes(ap.status) ? 2
    : ap.status === 'discussed' ? 3 : 4;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-xl mx-auto p-4 sm:p-6">
        <header className="mb-5">
          <div className="text-lg font-bold">EVEN <span className="font-normal text-slate-500">· Performance Appraisal</span></div>
          <p className="text-sm text-slate-600 mt-1">
            Hi {ap.full_name.split(' ')[0]} — {ap.cycle_label}
          </p>
        </header>
        <Stepper current={step} />
        {step === 1 && (
          <SelfAppraisalForm token={params.token} initial={ap.self_json ?? {}} />
        )}
        {step === 2 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-4">
            <h2 className="font-semibold mb-2">Thank you — your self-appraisal is in ✅</h2>
            <p className="text-sm text-slate-600">
              It is now with <span className="font-medium">{ap.hod}</span>. After your appraisal
              discussion, you will be able to review everything here and sign off.
            </p>
          </div>
        )}
        {step >= 3 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-4">
            <h2 className="font-semibold mb-2">Review &amp; sign-off</h2>
            <p className="text-sm text-slate-600">This step opens in the next release (P3/P4).</p>
          </div>
        )}
      </div>
    </main>
  );
}
