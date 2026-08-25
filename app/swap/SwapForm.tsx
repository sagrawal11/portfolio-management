'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitSwap } from './actions';

export interface ActiveHolding {
  ticker: string;
  display: string;
}

export default function SwapForm({ holdings, today }: { holdings: ActiveHolding[]; today: string }) {
  const router = useRouter();
  const [tickerOut, setTickerOut] = useState(holdings[0]?.ticker ?? '');
  const [tickerIn, setTickerIn] = useState('');
  const [date, setDate] = useState(today);
  const [isOption, setIsOption] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setOkMsg(null);
    setBusy(true);
    try {
      const res = await submitSwap({ tickerOut, tickerIn: tickerIn.trim(), date, isOption, note: note.trim() || undefined });
      if (res.ok) {
        setOkMsg(`Swapped ${tickerOut} → ${tickerIn.toUpperCase()} at the ${res.effectiveDate} close.`);
        setTickerIn('');
        setNote('');
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">Swap out (a current holding)</span>
          <select
            value={tickerOut}
            onChange={(e) => setTickerOut(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
          >
            {holdings.map((h) => (
              <option key={h.ticker} value={h.ticker}>
                {h.display}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">Swap into (a new ticker)</span>
          <input
            value={tickerIn}
            onChange={(e) => setTickerIn(e.target.value.toUpperCase())}
            placeholder="e.g. NVDA"
            className="rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm outline-none focus:border-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">Effective date (class day)</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
          />
          <span className="text-xs text-zinc-400">Priced at that day&apos;s close (rolls back if the close isn&apos;t posted yet).</span>
        </label>
        <label className="flex items-center gap-2 self-end text-sm text-zinc-700">
          <input type="checkbox" checked={isOption} onChange={(e) => setIsOption(e.target.checked)} className="h-4 w-4" />
          New ticker is an option
        </label>
      </div>

      <label className="mt-4 flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700">Note (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why are you making this change?"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
        />
      </label>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {okMsg && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {okMsg}
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy || !tickerIn.trim() || !tickerOut}
        className="mt-4 rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
      >
        {busy ? 'Validating & executing…' : 'Execute swap'}
      </button>
    </div>
  );
}
