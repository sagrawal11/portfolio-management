'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addJournalEntry, deleteJournalEntry } from './actions';
import { generateBriefNow } from '@/app/actions';

export interface Entry {
  id: number;
  date: string;
  note: string;
  source: string; // 'manual' | 'auto'
}

export default function JournalPanel({ entries, today }: { entries: Entry[]; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState(false);
  const [briefMsg, setBriefMsg] = useState<string | null>(null);

  async function add() {
    setError(null);
    setBusy(true);
    try {
      const res = await addJournalEntry({ date, note });
      if (res.ok) {
        setNote('');
        router.refresh();
      } else {
        setError(res.error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await deleteJournalEntry(id);
    router.refresh();
  }

  async function brief() {
    setBriefing(true);
    setBriefMsg(null);
    try {
      const res = await generateBriefNow();
      setBriefMsg(res.saved ? `Auto brief generated for ${res.date}.` : res.reason ?? 'Nothing to brief yet.');
      router.refresh();
    } catch (e) {
      setBriefMsg((e as Error).message);
    } finally {
      setBriefing(false);
    }
  }

  return (
    <div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-400">
            Graded on your reasoning — explain what happened and why, in your own words.
          </span>
          <button
            onClick={brief}
            disabled={briefing}
            className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
            title="Generate the autonomous daily brief now"
          >
            {briefing ? 'Generating…' : 'Generate daily brief'}
          </button>
        </div>
        {briefMsg && <div className="mb-2 text-xs text-amber-600">{briefMsg}</div>}
        <div className="flex flex-col gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="This week: NEE rallied on rate-cut expectations; GLD flat; trimmed nothing…"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
          />
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button
            onClick={add}
            disabled={busy || !note.trim()}
            className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save entry'}
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {entries.length === 0 && <p className="text-sm text-zinc-400">No entries yet.</p>}
        {entries.map((e) => {
          const auto = e.source === 'auto';
          return (
            <div key={e.id} className={`rounded-lg border p-4 ${auto ? 'border-blue-200 bg-blue-50/40' : 'border-zinc-200 bg-white'}`}>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {e.date}
                  {auto && (
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                      Auto brief
                    </span>
                  )}
                </span>
                <button onClick={() => remove(e.id)} className="text-xs text-zinc-400 hover:text-red-600">
                  Delete
                </button>
              </div>
              <p className="whitespace-pre-wrap font-mono text-[13px] leading-5 text-zinc-800">{e.note}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
