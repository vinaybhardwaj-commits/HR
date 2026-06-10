'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    setBusy(false);
    if (res.ok) { router.push('/admin/dashboard'); router.refresh(); }
    else setError((await res.json().catch(() => ({})) as { error?: string }).error ?? 'Sign-in failed');
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <div className="text-xl font-bold">EVEN <span className="font-normal text-slate-500">· Appraise</span></div>
        <p className="text-sm text-slate-500 mt-1 mb-6">HR sign-in</p>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" required
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-4 text-sm" />
        <label className="block text-sm font-medium mb-1">Password</label>
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" required
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-4 text-sm" />
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button disabled={busy}
          className="w-full bg-brand text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
