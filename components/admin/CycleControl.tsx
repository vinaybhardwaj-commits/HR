'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type LinkRow = {
  role: 'hod' | 'employee'; name: string; code?: string;
  status: string; pending: boolean; url: string;
};

function waMessage(l: LinkRow): string {
  return l.role === 'employee'
    ? `Dear ${l.name.split(' ')[0]},\n\nAs part of the Even performance appraisal, please complete your self-appraisal using your personal link below. It takes about 10 minutes and works on your phone.\n\n${l.url}\n\nPlease do not forward this link — it is personal to you.\n\n— HR, Even Healthcare`
    : `Dear ${l.name.split(' ')[0]},\n\nYour appraisal queue for your team is ready. Use your personal link below to review each self-appraisal and score your team members.\n\n${l.url}\n\nPlease do not forward this link — it is personal to you.\n\n— HR, Even Healthcare`;
}

export default function CycleControl({ cycleId, status, appraisals, isTest, label }:
  { cycleId: number; status: string; appraisals: number; isTest?: boolean; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [waResult, setWaResult] = useState<{
    kind: string; sent: number; deduped: number;
    skipped_no_phone: string[]; failed: { name: string; error: string }[];
  } | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);

  async function launch() {
    if (!confirm('Launch this cycle? This creates appraisals and personal links for all active staff.')) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/cycles/${cycleId}/launch`, { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((j as { error?: string }).error ?? 'Launch failed');
  }

  async function closeAll() {
    if (!confirm('Close all signed-off (concurred / HR-resolved) appraisals in this cycle? PDFs become available after close.')) return;
    setBusy(true); setError(null);
    const res = await fetch('/api/admin/appraisals/close', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycleId })
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { alert(`Closed ${(j as { closed: number }).closed} appraisal(s).`); router.refresh(); }
    else setError((j as { error?: string }).error ?? 'Close failed');
  }

  async function sendWa(kind: 'invite' | 'reminder') {
    const what = kind === 'invite'
      ? 'Send WhatsApp INVITES to everyone in this cycle who has a phone number and has not been invited yet?'
      : 'Send WhatsApp REMINDERS to everyone with a pending step (and a phone number)?';
    if (!confirm(what)) return;
    setBusy(true); setError(null); setWaResult(null);
    const res = await fetch(`/api/admin/cycles/${cycleId}/send-wa`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind })
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setWaResult(j as typeof waResult);
    else setError((j as { error?: string }).error ?? 'Send failed');
  }

  async function purge() {
    const typed = prompt(
      `PURGE TEST CYCLE\n\nThis permanently deletes ALL appraisals, scores, sign-offs, links and the cycle itself. Audit entries are kept.\n\nType the cycle label (${label}) to confirm:`);
    if (typed == null) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/cycles/${cycleId}/purge`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: typed })
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { alert('Test cycle purged.'); window.location.href = '/admin/cycles'; }
    else setError((j as { error?: string }).error ?? 'Purge failed');
  }

  async function loadLinks() {
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/cycles/${cycleId}/links`);
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setLinks((j as { links: LinkRow[] }).links);
    else setError('Could not load links');
  }

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  const filtered = useMemo(() => {
    if (!links) return [];
    const needle = q.toLowerCase();
    return links.filter(l =>
      (!onlyPending || l.pending) &&
      (!needle || l.name.toLowerCase().includes(needle) || (l.code ?? '').toLowerCase().includes(needle)));
  }, [links, q, onlyPending]);

  function copyChaseList(role: 'employee' | 'hod') {
    const pend = (links ?? []).filter(l => l.role === role && l.pending);
    const text = pend.map(l => `${l.name}${l.code ? ` (${l.code})` : ''} — ${l.status}\n${l.url}`).join('\n\n');
    copy(text || 'Nothing pending 🎉', `chase-${role}`);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-3">
        {status !== 'closed' && (
          <button onClick={launch} disabled={busy}
            className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {appraisals > 0 ? 'Re-run launch (fill missing)' : 'Launch cycle'}
          </button>
        )}
        {appraisals > 0 && status === 'live' && (
          <button onClick={closeAll} disabled={busy}
            className="border border-green-600 text-green-700 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            Close signed-off
          </button>
        )}
        {appraisals > 0 && (
          <button onClick={loadLinks} disabled={busy}
            className="border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            {links ? 'Refresh links' : 'Share links (WhatsApp)'}
          </button>
        )}
        {appraisals > 0 && status === 'live' && (
          <>
            <button onClick={() => sendWa('invite')} disabled={busy}
              className="border border-green-600 text-green-700 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
              Send invites (WhatsApp)
            </button>
            <button onClick={() => sendWa('reminder')} disabled={busy}
              className="border border-amber-500 text-amber-700 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
              Send reminders (pending)
            </button>
          </>
        )}
        {isTest && (
          <button onClick={purge} disabled={busy}
            className="border border-red-600 text-red-700 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            Purge test cycle
          </button>
        )}
        <span className="text-xs text-slate-500">
          Links are personal. Send automatically via Twilio WhatsApp, or share manually below. No emails are sent.
        </span>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {waResult && (
        <div className="mt-3 border border-slate-200 rounded-xl p-3 text-sm bg-slate-50">
          <p className="font-semibold">
            WhatsApp {waResult.kind}s: {waResult.sent} sent
            {waResult.deduped > 0 && ` · ${waResult.deduped} already invited (skipped)`}
          </p>
          {waResult.skipped_no_phone.length > 0 && (
            <p className="text-amber-700 mt-1">
              No phone number ({waResult.skipped_no_phone.length}) — add on the Roster page or use the manual links below:{' '}
              {waResult.skipped_no_phone.join(', ')}
            </p>
          )}
          {waResult.failed.length > 0 && (
            <p className="text-red-700 mt-1">
              Failed ({waResult.failed.length}): {waResult.failed.map(f => `${f.name} (${f.error})`).join('; ')}
            </p>
          )}
        </div>
      )}

      {links && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or code…"
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-48" />
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} />
              Pending only
            </label>
            <div className="flex-1" />
            <button onClick={() => copyChaseList('employee')}
              className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 hover:border-brand">
              {copied === 'chase-employee' ? 'Copied ✓' : 'Copy pending list (employees)'}
            </button>
            <button onClick={() => copyChaseList('hod')}
              className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 hover:border-brand">
              {copied === 'chase-hod' ? 'Copied ✓' : 'Copy pending list (HODs)'}
            </button>
          </div>

          <div className="max-h-[28rem] overflow-y-auto">
            {(['hod', 'employee'] as const).map(role => {
              const items = filtered.filter(l => l.role === role);
              if (!items.length) return null;
              return (
                <div key={role} className="mb-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1">
                    {role === 'hod' ? `HODs · ${items.length}` : `Employees · ${items.length}`}
                  </div>
                  {items.map(l => (
                    <div key={l.url} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm">{l.name}</span>
                        <span className={`ml-2 text-[10px] rounded-full px-2 py-0.5 align-middle
                          ${l.pending ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                          {l.status}
                        </span>
                      </div>
                      <a href={`https://wa.me/?text=${encodeURIComponent(waMessage(l))}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs border border-green-600 text-green-700 rounded-md px-2.5 py-1 hover:bg-green-50 shrink-0">
                        WhatsApp
                      </a>
                      <button onClick={() => copy(waMessage(l), `msg-${l.url}`)}
                        className="text-xs border border-slate-300 rounded-md px-2.5 py-1 hover:border-brand shrink-0">
                        {copied === `msg-${l.url}` ? 'Copied ✓' : 'Copy message'}
                      </button>
                      <button onClick={() => copy(l.url, `url-${l.url}`)}
                        className="text-xs border border-slate-300 rounded-md px-2.5 py-1 hover:border-brand shrink-0">
                        {copied === `url-${l.url}` ? '✓' : 'Link'}
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
            {filtered.length === 0 && <p className="text-sm text-slate-500 py-3">No matches.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
