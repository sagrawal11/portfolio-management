'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/session';
import { db } from '@/lib/db';

export type JournalResult = { ok: true } | { ok: false; error: string };

export async function addJournalEntry(input: { date: string; note: string }): Promise<JournalResult> {
  await requireAuth();
  const note = input.note.trim();
  if (!note) return { ok: false, error: 'Write something before saving.' };
  const date = input.date?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  await db()`INSERT INTO journal_entries (date, note) VALUES (${date}, ${note})`;
  revalidatePath('/journal');
  return { ok: true };
}

export async function deleteJournalEntry(id: number): Promise<JournalResult> {
  await requireAuth();
  await db()`DELETE FROM journal_entries WHERE id = ${id}`;
  revalidatePath('/journal');
  return { ok: true };
}
