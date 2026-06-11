import Link from 'next/link';
import { sql } from '@/lib/db';
import { resolveHodAppraisal, cycleFactorsForEmployee } from '@/lib/hod';
import ScoringView from '@/components/hod/ScoringView';

export const dynamic = 'force-dynamic';

function TokenError() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="text-xl font-bold mb-2">EVEN <span className="font-normal text-slate-500">· Appraise</span></div>
        <p className="text-slate-600 text-sm">This link is not valid, or this appraisal is not in your queue.</p>
      </div>
    </main>
  );
}

export default async function ScoringPage({ params }: { params: { token: string; id: string } }) {
  const ctx = await resolveHodAppraisal(params.token, params.id);
  if (!ctx) return <TokenError />;
  const { appraisal } = ctx;

  const meta = (await sql()`
    SELECT e.full_name, e.designation, e.sub_department, a.self_json, a.status, a.total_score,
           a.percent, a.band, a.discussion_date::text, a.reopened_count, c.label AS cycle_label
    FROM appraisal a JOIN employee e ON e.id = a.employee_id JOIN cycle c ON c.id = a.cycle_id
    WHERE a.id = ${appraisal.id}`) as {
    full_name: string; designation: string | null; sub_department: string | null;
    self_json: Record<string, unknown> | null; status: string;
    total_score: number | null; percent: string | null; band: string | null;
    discussion_date: string | null; reopened_count: number; cycle_label: string;
  }[];
  const m = meta[0];

  const factors = await cycleFactorsForEmployee(appraisal.cycle_id, appraisal.employee_id);
  const scores = (await sql()`
    SELECT factor_code, value, example_text FROM score WHERE appraisal_id = ${appraisal.id}`) as
    { factor_code: string; value: number; example_text: string | null }[];
  const training = (await sql()`
    SELECT category, detail FROM training_need WHERE appraisal_id = ${appraisal.id}`) as
    { category: string; detail: string | null }[];

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <Link href={`/hod/${params.token}`} className="text-xs text-brand font-medium">← Back to queue</Link>
            <h1 className="font-bold mt-1">{m.full_name}</h1>
            <p className="text-xs text-slate-500">{m.designation ?? ''} · {m.sub_department ?? ''} · {m.cycle_label}</p>
          </div>
        </header>
        <ScoringView
          token={params.token}
          appraisalId={appraisal.id}
          status={m.status}
          employeeName={m.full_name}
          reopenedCount={m.reopened_count}
          selfJson={m.self_json}
          factors={factors}
          initialScores={scores}
          initialTraining={training}
          result={{ total: m.total_score, percent: m.percent, band: m.band, discussionDate: m.discussion_date }}
        />
      </div>
    </main>
  );
}
