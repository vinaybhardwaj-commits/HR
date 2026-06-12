import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import AdminShell from '@/components/admin/AdminShell';
import { STATUS_META, type AppraisalStatus } from '@/lib/status';

export const dynamic = 'force-dynamic';

const LEVEL_LABEL: Record<number, string> = {
  5: 'Exceptional', 4: 'Exceeds expectations', 3: 'Meets expectations', 2: 'Partially meets', 1: 'Does not meet'
};

type Factor = { code: string; track: string; label: string; description: string | null; anchors: Record<string, string> };
type Goals = { goal?: string; measure?: string }[];
type SelfJson = {
  accomplishments?: string; challenges?: string; duty_changes?: string;
  training_wants?: string; satisfaction?: number; goals?: Goals;
};

export default async function AppraisalDetail({ params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin');
  const db = sql();

  const rows = (await db`
    SELECT a.id, a.status, a.cycle_id, a.self_json, a.self_submitted_at::text, a.self_overridden,
           a.total_score, a.percent::text, a.band, a.scores_submitted_at::text, a.scored_by_label,
           a.discussion_date::text, a.reopened_count, a.hr_notes, a.cancelled_reason, a.closed_at::text,
           e.emp_code, e.full_name, e.designation, e.sub_department, e.track,
           ap.full_name AS hod, c.label AS cycle_label, c.factor_snapshot
    FROM appraisal a
    JOIN employee e ON e.id = a.employee_id
    JOIN appraiser ap ON ap.id = a.appraiser_id
    JOIN cycle c ON c.id = a.cycle_id
    WHERE a.id = ${params.id}`) as {
    id: string; status: AppraisalStatus; cycle_id: number; self_json: SelfJson | null;
    self_submitted_at: string | null; self_overridden: boolean;
    total_score: number | null; percent: string | null; band: string | null;
    scores_submitted_at: string | null; scored_by_label: string | null;
    discussion_date: string | null; reopened_count: number; hr_notes: string | null;
    cancelled_reason: string | null; closed_at: string | null;
    emp_code: string; full_name: string; designation: string | null; sub_department: string | null;
    track: string; hod: string; cycle_label: string; factor_snapshot: Factor[] | null;
  }[];
  const a = rows[0];
  if (!a) notFound();

  const scores = (await db`
    SELECT factor_code, value, example_text, is_draft, updated_at::text
    FROM score WHERE appraisal_id = ${a.id}`) as
    { factor_code: string; value: number | null; example_text: string | null; is_draft: boolean; updated_at: string }[];
  const training = (await db`
    SELECT category, detail FROM training_need WHERE appraisal_id = ${a.id}`) as
    { category: string; detail: string | null }[];
  const signed = ((await db`
    SELECT choice, remarks, signed_name, signed_at::text FROM concurrence WHERE appraisal_id = ${a.id}`) as
    { choice: string; remarks: string | null; signed_name: string; signed_at: string }[])[0] ?? null;

  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'appraisal_viewed', appraisalId: a.id });

  const factors = (a.factor_snapshot ?? []).filter(f => f.track === 'ALL' || f.track === a.track);
  const byCode = new Map(scores.map(s => [s.factor_code, s]));
  const self = a.self_json;
  const anyDraft = scores.some(s => s.is_draft && s.value != null) && a.status !== 'scored';

  return (
    <AdminShell active="/admin/scoring" adminName={admin.name}>
      <Link href="/admin/scoring" className="text-xs text-brand font-medium">← Back to scoring browser</Link>
      <div className="flex items-center justify-between flex-wrap gap-2 mt-1 mb-1">
        <h1 className="text-xl font-bold">{a.full_name} <span className="text-sm text-slate-400 font-mono">{a.emp_code}</span></h1>
        <span className={`text-xs font-medium rounded-full px-3 py-1 ${STATUS_META[a.status].cls}`}>{STATUS_META[a.status].label}</span>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        {a.designation ?? ''}{a.sub_department ? ` · ${a.sub_department}` : ''} · {a.track === 'C' ? 'Clinical' : 'Non-clinical'} track
        · HOD: <span className="font-medium">{a.hod}</span> · {a.cycle_label}
        {a.reopened_count > 0 && <span className="ml-2 text-purple-700 font-semibold">version {a.reopened_count + 1} (previous in audit)</span>}
      </p>

      {a.total_score != null && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 flex items-center gap-4 flex-wrap text-sm">
          <span><span className="text-2xl font-bold">{a.total_score}</span> <span className="text-slate-400">/ {factors.length * 5}</span></span>
          <span className="text-2xl font-bold">{a.percent}%</span>
          <span className="text-xs font-bold rounded-full px-3 py-1 bg-brand-soft text-brand uppercase">{a.band}</span>
          <span className="text-xs text-slate-500">
            scored by {a.scored_by_label ?? a.hod}{a.scores_submitted_at ? ` · ${a.scores_submitted_at.slice(0, 16)}` : ''}
            {a.discussion_date ? ` · discussion held ${a.discussion_date}` : ' · discussion not yet held'}
          </span>
        </div>
      )}
      {anyDraft && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-4 text-sm text-amber-800 font-medium">
          Scoring in progress — these are the HOD&apos;s unsubmitted draft scores and may still change.
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <section className="bg-white border border-slate-200 rounded-2xl p-4 text-sm space-y-3">
          <h2 className="text-[11px] font-semibold text-slate-500 uppercase">Part A — self-appraisal</h2>
          {!self && <p className="text-slate-500">Not submitted{a.self_overridden ? ' (HR overrode the requirement)' : ''}.</p>}
          {self && ([['Accomplishments', self.accomplishments], ['Challenges', self.challenges],
            ['Changes to duties', self.duty_changes], ['Training requested', self.training_wants]] as const)
            .map(([k, v]) => v ? (
              <div key={k}>
                <div className="font-medium">{k}</div>
                <p className="text-slate-600 whitespace-pre-wrap">{v}</p>
              </div>
            ) : null)}
          {self?.goals?.some(g => g.goal) && (
            <div>
              <div className="font-medium">Goals</div>
              {self.goals.filter(g => g.goal).map((g, i) => (
                <p key={i} className="text-slate-600">{i + 1}. {g.goal}{g.measure ? ` — measured by: ${g.measure}` : ''}</p>
              ))}
            </div>
          )}
          {self?.satisfaction != null && (
            <div className="border-t border-slate-100 pt-2">
              <div className="font-medium">Workplace satisfaction <span className="text-[10px] rounded-full px-2 py-0.5 bg-red-50 text-red-700 font-semibold ml-1">HR-ONLY — never shown to HOD or in PDFs</span></div>
              <p className="text-slate-600">{self.satisfaction} / 5</p>
            </div>
          )}
          {self && a.self_submitted_at && <p className="text-xs text-slate-400">Submitted {a.self_submitted_at.slice(0, 16)}</p>}
        </section>

        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-slate-500 uppercase">Part B — HOD scoring ({a.hod})</h2>
          {factors.map(f => {
            const s = byCode.get(f.code);
            const v = s?.value ?? null;
            return (
              <div key={f.code} className="bg-white border border-slate-200 rounded-2xl p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{f.code} · {f.label}</span>
                  {v != null ? (
                    <span className="flex items-center gap-2 shrink-0">
                      {s?.is_draft && a.status !== 'scored' &&
                        <span className="text-[10px] rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 font-semibold">draft</span>}
                      <span className="text-lg font-bold">{v}</span>
                      <span className="text-xs text-slate-500">{LEVEL_LABEL[v]}</span>
                    </span>
                  ) : <span className="text-xs text-slate-400">not scored yet</span>}
                </div>
                {v != null && f.anchors?.[String(v)] && (
                  <p className="text-xs text-slate-500 mt-1 italic">Anchor: {f.anchors[String(v)]}</p>
                )}
                {s?.example_text && (
                  <p className="text-slate-600 mt-2 whitespace-pre-wrap"><span className="font-medium">Example:</span> {s.example_text}</p>
                )}
              </div>
            );
          })}
          {training.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 text-sm">
              <div className="font-semibold mb-1">Training needs (HOD-identified)</div>
              {training.map((t, i) => <p key={i} className="text-slate-600">• {t.category}{t.detail ? ` — ${t.detail}` : ''}</p>)}
            </div>
          )}
        </section>
      </div>

      <section className="bg-white border border-slate-200 rounded-2xl p-4 mt-4 text-sm">
        <h2 className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Part D — sign-off & HR</h2>
        {signed ? (
          <p>
            <span className={`font-semibold ${signed.choice === 'disagree' ? 'text-red-700' : 'text-green-700'}`}>
              {signed.choice === 'agree' ? 'Agreed' : signed.choice === 'agree_remarks' ? 'Agreed with remarks' : 'DISAGREED'}
            </span>
            {' '}— signed “{signed.signed_name}” on {signed.signed_at.slice(0, 16)}
            {signed.remarks && <span className="block text-slate-600 mt-1 whitespace-pre-wrap">Remarks: {signed.remarks}</span>}
          </p>
        ) : <p className="text-slate-500">Not signed yet.</p>}
        {a.hr_notes && <p className="mt-2"><span className="font-medium">HR resolution notes:</span> {a.hr_notes}</p>}
        {a.cancelled_reason && <p className="mt-2 text-red-700"><span className="font-medium">Cancelled:</span> {a.cancelled_reason}</p>}
        {a.closed_at && <p className="text-xs text-slate-400 mt-2">Closed {a.closed_at.slice(0, 16)}</p>}
      </section>
    </AdminShell>
  );
}
