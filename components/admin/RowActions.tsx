'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RowActions({ appraisalId, status }: { appraisalId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: string, reason?: string, date?: string) {
    setBusy(true);
    const res = await fetch(`/api/admin/appraisals/${appraisalId}/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason, date })
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => ({})) as { error?: string }).error ?? 'Failed');
  }

  return (
    <div className="flex gap-1.5 justify-end">
      {status === 'invited' && (
        <button disabled={busy} title="Let the HOD score without the self-appraisal"
          onClick={() => { if (confirm('Unlock scoring without the self-appraisal?')) act('override_self'); }}
          className="text-[11px] border border-slate-300 rounded-md px-2 py-1 hover:border-brand">
          Unlock scoring
        </button>
      )}
      {status === 'scored' && (
        <button disabled={busy} title="HR override: mark the 1:1 as held so the employee can sign off (Part D)"
          onClick={() => {
            const today = new Date().toISOString().slice(0, 10);
            const d = prompt(
              'HR override — mark the 1:1 discussion as held on the HOD’s behalf.\n' +
              'This releases sign-off (Part D) to the employee and is recorded in the audit trail.\n\n' +
              'Date the discussion was held (YYYY-MM-DD):',
              today
            );
            if (d === null) return;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d.trim())) { alert('Please enter the date as YYYY-MM-DD.'); return; }
            act('mark_discussion', undefined, d.trim());
          }}
          className="text-[11px] border border-slate-300 rounded-md px-2 py-1 text-violet-700 hover:border-violet-400">
          Mark discussion held
        </button>
      )}
      {status === 'closed' && (
        <a href={`/api/admin/appraisals/${appraisalId}/pdf`} target="_blank"
          className="text-[11px] border border-slate-300 rounded-md px-2 py-1 hover:border-brand">
          PDF
        </a>
      )}
      {!['closed', 'cancelled'].includes(status) && (
        <button disabled={busy} title="Cancel (e.g. employee exited)"
          onClick={() => { const r = prompt('Reason for cancelling this appraisal?'); if (r?.trim()) act('cancel', r); }}
          className="text-[11px] border border-slate-300 rounded-md px-2 py-1 text-slate-500 hover:border-red-400 hover:text-red-600">
          Cancel
        </button>
      )}
    </div>
  );
}
