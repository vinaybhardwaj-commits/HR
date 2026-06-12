'use client';
import { useState } from 'react';

export type HodPanelRow = {
  hodId: number;
  hod: string;
  lastUsed: string | null;        // ISO or null = never opened
  chaseUrl: string | null;        // wa.me href (null if no link minted)
  meanPct: number | null;         // mean % of their submitted scores
  nScored: number;
  team: { name: string; status: string; readyDays: number | null; discDays: number | null }[];
};

const STATUS_LABEL: Record<string, string> = {
  invited: 'awaiting self-appraisal', self_submitted: 'READY TO SCORE', scored: 'scored — HOD must hold the 1:1 and mark it',
  discussed: 'awaiting employee sign-off', concurred: 'signed — agree', disagreed: 'signed — disagree',
  hr_review: 'with HR', closed: 'closed', cancelled: 'cancelled'
};

function ago(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

export default function HodCommandCentre({ rows, cycleMean }: { rows: HodPanelRow[]; cycleMean: number | null }) {
  const [open, setOpen] = useState<Record<number, boolean>>({});

  const enriched = rows.map(r => {
    const counts: Record<string, number> = {};
    for (const t of r.team) counts[t.status] = (counts[t.status] ?? 0) + 1;
    const actionable = r.team.filter(t => t.status !== 'cancelled').length;
    const toScore = counts['self_submitted'] ?? 0;
    const discPending = counts['scored'] ?? 0;
    const done = (counts['discussed'] ?? 0) + (counts['concurred'] ?? 0) + (counts['disagreed'] ?? 0) + (counts['hr_review'] ?? 0) + (counts['closed'] ?? 0);
    const awaitingSelf = counts['invited'] ?? 0;
    const readyDaysArr = r.team.filter(t => t.status === 'self_submitted').map(t => t.readyDays ?? 0);
    const discDaysArr = r.team.filter(t => t.status === 'scored').map(t => t.discDays ?? 0);
    const maxReady = readyDaysArr.length ? Math.max.apply(null, readyDaysArr) : 0;
    const maxDisc = discDaysArr.length ? Math.max.apply(null, discDaysArr) : 0;
    const outlier = r.meanPct != null && cycleMean != null && r.nScored >= 3 && Math.abs(r.meanPct - cycleMean) > 10;
    return { ...r, actionable, toScore, discPending, done, awaitingSelf, maxReady, maxDisc, outlier };
  }).sort((a, b) =>
    (b.toScore - a.toScore) ||
    (Number(!b.lastUsed) - Number(!a.lastUsed)) ||
    (b.discPending - a.discPending));

  return (
    <div className="border border-slate-100 rounded-xl divide-y divide-slate-50">
      {enriched.map(r => (
        <div key={r.hodId}>
          <button onClick={() => setOpen(o => ({ ...o, [r.hodId]: !o[r.hodId] }))}
            className="w-full text-left px-3 py-2.5 hover:bg-slate-50">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-medium text-sm w-44 truncate">{r.hod}</span>
              {r.lastUsed
                ? <span className="text-[10px] rounded-full px-2 py-0.5 bg-green-50 text-green-700">active {ago(r.lastUsed)}</span>
                : <span className="text-[10px] rounded-full px-2 py-0.5 bg-red-50 text-red-700 font-semibold">never opened link</span>}
              <div className="flex-1 min-w-[8rem] h-2 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-green-500" style={{ width: `${r.actionable ? (r.done / r.actionable) * 100 : 0}%` }} />
                <div className="h-full bg-violet-400" style={{ width: `${r.actionable ? (r.discPending / r.actionable) * 100 : 0}%` }} />
                <div className="h-full bg-amber-400" style={{ width: `${r.actionable ? (r.toScore / r.actionable) * 100 : 0}%` }} />
              </div>
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {r.done} done · {r.discPending} awaiting 1:1 · <span className={r.toScore ? 'text-amber-700 font-semibold' : ''}>{r.toScore} to score</span> · {r.awaitingSelf} awaiting self
              </span>
              {r.maxReady >= 3 && <span className="text-[10px] rounded-full px-2 py-0.5 bg-red-50 text-red-700 font-semibold">sitting {r.maxReady}d</span>}
              {r.maxDisc >= 7 && <span className="text-[10px] rounded-full px-2 py-0.5 bg-red-50 text-red-700 font-semibold">discussion {r.maxDisc}d</span>}
              {r.outlier && <span className="text-[10px] rounded-full px-2 py-0.5 bg-purple-50 text-purple-700 font-semibold"
                title={`Mean ${r.meanPct}% vs cycle ${cycleMean}%`}>calibration ⚠ {r.meanPct}%</span>}
              {r.chaseUrl && (r.toScore > 0 || !r.lastUsed) && (
                <a href={r.chaseUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className="text-[11px] border border-green-600 text-green-700 rounded-md px-2 py-1 hover:bg-green-50 ml-auto">
                  WhatsApp chase
                </a>
              )}
            </div>
          </button>
          {open[r.hodId] && (
            <div className="px-5 pb-3 pt-1 bg-slate-50/50">
              {r.team.filter(t => t.status !== 'cancelled').map((t, i) => (
                <div key={i} className="flex items-center justify-between py-1 text-sm border-b border-slate-100 last:border-0">
                  <span>{t.name}</span>
                  <span className="text-xs text-slate-500">
                    {STATUS_LABEL[t.status] ?? t.status}
                    {t.status === 'self_submitted' && t.readyDays != null && t.readyDays >= 1 &&
                      <span className={t.readyDays >= 3 ? 'text-red-600 font-semibold' : ''}> · {t.readyDays}d</span>}
                    {t.status === 'scored' && t.discDays != null && t.discDays >= 1 &&
                      <span className={t.discDays >= 7 ? 'text-red-600 font-semibold' : ''}> · {t.discDays}d</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {enriched.length === 0 && <p className="text-xs text-slate-400 p-3">No HODs in this cycle.</p>}
    </div>
  );
}
