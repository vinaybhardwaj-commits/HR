import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import AdminShell from '@/components/admin/AdminShell';
import ReviewActions from '@/components/admin/ReviewActions';

export const dynamic = 'force-dynamic';

export default async function Review() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin');
  const rows = (await sql()`
    SELECT a.id, a.status, a.band, a.percent::text, a.hr_notes, e.full_name, e.emp_code,
           ap.full_name AS hod, c.label AS cycle_label, co.remarks, co.signed_name, co.signed_at::text
    FROM appraisal a
    JOIN employee e ON e.id = a.employee_id
    JOIN appraiser ap ON ap.id = a.appraiser_id
    JOIN cycle c ON c.id = a.cycle_id
    LEFT JOIN concurrence co ON co.appraisal_id = a.id
    WHERE a.status IN ('disagreed', 'hr_review')
    ORDER BY co.signed_at DESC NULLS LAST`) as {
    id: string; status: string; band: string | null; percent: string | null; hr_notes: string | null;
    full_name: string; emp_code: string; hod: string; cycle_label: string;
    remarks: string | null; signed_name: string | null; signed_at: string | null;
  }[];

  return (
    <AdminShell active="/admin/review" adminName={admin.name}>
      <h1 className="text-xl font-bold mb-1">Disagreement review</h1>
      <p className="text-sm text-slate-500 mb-6">
        Appraisals where the employee disagreed. Resolve each before close-out.
      </p>
      {rows.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-sm text-slate-500">
          Nothing to review — no disagreements. 🎉
        </div>
      )}
      <div className="space-y-3">
        {rows.map(r => (
          <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold">{r.full_name} <span className="font-mono text-xs text-slate-400">{r.emp_code}</span></div>
                <div className="text-xs text-slate-500">{r.cycle_label} · HOD: {r.hod} · {r.percent}% {r.band}</div>
              </div>
              <span className={`text-xs font-semibold rounded-full px-3 py-1
                ${r.status === 'disagreed' ? 'bg-red-50 text-red-700' : 'bg-teal-50 text-teal-700'}`}>
                {r.status === 'disagreed' ? 'needs resolution' : 'resolved — ready to close'}
              </span>
            </div>
            {r.remarks && (
              <p className="text-sm text-slate-600 mt-2"><span className="font-medium">Employee remarks:</span> {r.remarks}</p>
            )}
            {r.hr_notes && (
              <p className="text-sm text-slate-600 mt-1"><span className="font-medium">HR resolution:</span> {r.hr_notes}</p>
            )}
            {r.status === 'disagreed' && <ReviewActions appraisalId={r.id} />}
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
