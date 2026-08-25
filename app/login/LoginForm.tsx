'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from './actions';

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await login(password);
      if (res.ok) {
        router.push('/dashboard');
        router.refresh();
      } else {
        setError(res.error ?? 'Login failed.');
        setBusy(false);
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xs rounded-lg border border-zinc-200 bg-white p-6">
      <h1 className="text-lg font-semibold tracking-tight">Portfolio Tracker</h1>
      <p className="mt-1 text-sm text-zinc-500">Enter the password to continue.</p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoFocus
        className="mt-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy || !password}
        className="mt-4 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
