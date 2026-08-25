'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { refreshNow } from '@/app/actions';

export default function RefreshButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function onClick() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await refreshNow();
      router.refresh();
      if (res.errors?.length) setMsg(`Synced with warnings: ${res.errors.length}`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-amber-600">{msg}</span>}
      <button
        onClick={onClick}
        disabled={busy}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
      >
        {busy ? 'Refreshing…' : 'Refresh now'}
      </button>
    </div>
  );
}
