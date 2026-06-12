'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Mobile Safari (and Chrome) restore cached page snapshots when a tab is
 * re-opened or the device wakes — which showed HODs stale queues / blank
 * forms after submitting. Re-fetch server data whenever the page becomes
 * visible again or is restored from the back/forward cache.
 */
export default function RefreshOnFocus() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) router.refresh(); };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', refresh);
    };
  }, [router]);
  return null;
}
