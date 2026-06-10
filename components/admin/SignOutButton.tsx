'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => { /* intentional: redirect regardless */ });
    router.push('/admin');
    router.refresh();
  }
  return (
    <button onClick={signOut} disabled={busy}
      className="text-xs text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-300 rounded-md px-2.5 py-1.5 disabled:opacity-50">
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
