'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Polls router.refresh() so server-component dashboards stay live. */
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [last, setLast] = useState('');
  useEffect(() => {
    setLast(new Date().toLocaleTimeString());
    const id = setInterval(() => {
      router.refresh();
      setLast(new Date().toLocaleTimeString());
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return (
    <span className="text-xs text-slate-400 inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      Live · refreshes every {seconds}s{last && ` · updated ${last}`}
    </span>
  );
}
