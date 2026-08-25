import Nav from '@/components/Nav';
import { db } from '@/lib/db';
import JournalPanel, { type Entry } from './JournalPanel';

export const dynamic = 'force-dynamic';

export default async function JournalPage() {
  const rows = await db()`
    SELECT id, date::text AS date, note, source FROM journal_entries ORDER BY date DESC, id DESC`;
  const entries: Entry[] = (rows as { id: number; date: string; note: string; source: string }[]).map((r) => ({
    id: r.id,
    date: r.date,
    note: r.note,
    source: r.source,
  }));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-3xl px-6 py-8">
        <h1 className="text-xl font-semibold tracking-tight">Journal</h1>
        <p className="mt-1 text-sm text-zinc-500">Weekly notes — most recent first.</p>
        <div className="mt-6">
          <JournalPanel entries={entries} today={today} />
        </div>
      </main>
    </>
  );
}
