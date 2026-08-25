'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addJournalEntry, deleteJournalEntry } from './actions';

export interface Entry {
  id: number;
  date: string;
  note: string;
}

export default function JournalPanel({ entries, today }: { entries: Entry[]; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
            />
            <span className="text-xs text-zinc-400">This is what your grade is based on — explain what happened and why.</span>
          </div>
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
        {entries.map((e) => (
          <div key={e.id} className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{e.date}</span>
              <button onClick={() => remove(e.id)} className="text-xs text-zinc-400 hover:text-red-600">
                Delete
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm text-zinc-800">{e.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
