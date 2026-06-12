'use client';
import { useState } from 'react';
import Link from 'next/link';

/**
 * Per-employee quick action on the roster:
 *  - submitted → link straight to the appraisal detail (Part A view)
 *  - pending   → inline panel with their personal link: copy link / copy message / WhatsApp
 */
export default function RosterEmpAction({ state, appraisalId, url, message }: {
  state: 'submitted' | 'pending' | 'none';
  appraisalId?: string;
  url?: string;
  message?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  if (state === 'submitted' && appraisalId) {
    return (
      <Link href={`/admin/appraisals/${appraisalId}`}
        className="ml-2 text-[11px] text-brand font-medium hover:underline whitespace-nowrap">
        View self-appraisal →
      </Link>
    );
  }
  if (state === 'pending' && url) {
    return (
      <span className="ml-2 inline-flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setOpen(!open)}
          className="text-[11px] border border-slate-300 rounded-md px-2 py-0.5 text-slate-600 hover:border-brand hover:text-brand">
          {open ? 'Hide link' : 'Get link'}
        </button>
        {open && (
          <>
            <button onClick={() => copy(url, 'url')}
              className="text-[11px] border border-slate-300 rounded-md px-2 py-0.5 hover:border-brand">
              {copied === 'url' ? 'Copied ✓' : 'Copy link'}
            </button>
            {message && (
              <>
                <button onClick={() => copy(message, 'msg')}
                  className="text-[11px] border border-slate-300 rounded-md px-2 py-0.5 hover:border-brand">
                  {copied === 'msg' ? 'Copied ✓' : 'Copy message'}
                </button>
                <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] border border-green-600 text-green-700 rounded-md px-2 py-0.5 hover:bg-green-50">
                  WhatsApp
                </a>
              </>
            )}
          </>
        )}
      </span>
    );
  }
  return null;
}
