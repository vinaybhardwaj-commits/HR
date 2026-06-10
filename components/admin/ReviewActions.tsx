'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ReviewActions({ appraisalId }: { appraisalId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: 'resolve' | 'reopen') {
    if (!notes.trim()) { setError('Add resolution notes / reason first'); return; }
    if (action === 'reopen' && !confirm('Reopen this appraisal? Scores return to draft and the sign-off is cleared.')) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/appraisals/${appraisalId}/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason: notes })
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((j as { error?: string }).error ?? 'Failed');
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Resolution notes (kept on record)…"
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2" />
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => act('resolve')} disabled={busy}
          className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
          Mark resolved (uphold scores)
        </button>
        <button onClick={() => act('reopen')} disabled={busy}
          className="border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
          Reopen for re-scoring
        </button>
      </div>
    </div>
  );
}
