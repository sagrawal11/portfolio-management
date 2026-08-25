'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { seedPortfolio } from './actions';
import {
  SEED_HOLDINGS,
  DEFAULT_NOTIONAL,
  DEFAULT_START_DATE,
  DEFAULT_BENCHMARK,
} from '@/lib/seed-data';

interface Row {
  ticker: string;
  weightPct: number;
  isOption: boolean;
}

const initialRows: Row[] = SEED_HOLDINGS.map((h) => ({
  ticker: h.ticker,
  weightPct: Math.round(h.weight * 1000) / 10,
  isOption: false,
}));

export default function SetupPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [notional, setNotional] = useState<number>(DEFAULT_NOTIONAL);
  const [startDate, setStartDate] = useState<string>(DEFAULT_START_DATE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = rows.filter((r) => r.ticker.trim().length > 0);
  const weightSum = useMemo(
    () => filled.reduce((a, r) => a + (Number.isFinite(r.weightPct) ? r.weightPct : 0), 0),
    [filled],
  );
  const countOk = filled.length >= 5 && filled.length <= 10;
  const sumOk = Math.abs(weightSum - 100) <= 1;

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    if (rows.length >= 10) return;
    setRows((rs) => [...rs, { ticker: '', weightPct: 0, isOption: false }]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await seedPortfolio({
        startDate,
        notional,
        benchmarkSymbol: DEFAULT_BENCHMARK,
        holdings: filled.map((r) => ({
          ticker: r.ticker.trim(),
          weight: r.weightPct / 100,
          isOption: r.isOption,
        })),
      });
      if (res.ok) {
        router.push('/dashboard');
        router.refresh();
      } else {
        setError(res.error);
        setSubmitting(false);
      }
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Portfolio setup</h1>
      <p className="mt-2 text-sm text-zinc-600">
        5–10 holdings summing to ~100%, max one crypto or option. On save, each ticker&apos;s
        closing price on the start date is fetched to lock in entry prices. Your starting portfolio
        is pre-filled below.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">Portfolio value (fictitious $)</span>
          <input
            type="number"
            min={1}
            value={notional}
            onChange={(e) => setNotional(Number(e.target.value))}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">Competition start date</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
          />
        </label>
      </div>

      <div className="mt-8 overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Ticker</th>
              <th className="px-4 py-2 font-medium">Weight %</th>
              <th className="px-4 py-2 font-medium">Option?</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-4 py-2">
                  <input
                    value={r.ticker}
                    onChange={(e) => update(i, { ticker: e.target.value.toUpperCase() })}
                    placeholder="AAPL"
                    className="w-32 rounded-md border border-zinc-300 px-2 py-1.5 font-mono text-sm outline-none focus:border-zinc-900"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.1"
                    value={r.weightPct}
                    onChange={(e) => update(i, { weightPct: Number(e.target.value) })}
                    className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-zinc-900"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={r.isOption}
                    onChange={(e) => update(i, { isOption: e.target.checked })}
                    className="h-4 w-4"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="text-xs text-zinc-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= 10}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Add holding
        </button>
        <div className="flex items-center gap-4">
          <span className={countOk ? 'text-zinc-500' : 'text-red-600'}>{filled.length} holdings</span>
          <span className={sumOk ? 'text-emerald-600' : 'text-red-600'}>
            Σ {weightSum.toFixed(1)}%
          </span>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting || !countOk || !sumOk}
        className="mt-6 w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? 'Resolving tickers & fetching prices…' : 'Create portfolio'}
      </button>
      <p className="mt-3 text-center text-xs text-zinc-400">
        Benchmark: {DEFAULT_BENCHMARK} (S&amp;P 500 total return). This may take ~20s while prices are fetched.
      </p>
    </main>
  );
}
