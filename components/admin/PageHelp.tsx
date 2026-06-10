import type { ReactNode } from 'react';

/** Collapsible per-page instructions box, used across admin pages. */
export default function PageHelp({ title = 'How this page works', items }:
  { title?: string; items: ReactNode[] }) {
  return (
    <details className="bg-blue-50/70 border border-blue-100 rounded-xl px-4 py-3 mb-6 text-sm text-slate-700">
      <summary className="cursor-pointer font-semibold text-slate-800 select-none">{title}</summary>
      <ul className="mt-2 space-y-1.5 list-disc pl-5">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </details>
  );
}
