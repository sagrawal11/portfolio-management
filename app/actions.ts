'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/session';
import { syncAndRecompute } from '@/lib/sync';

/** Manual "Refresh now" — same sync path as the cron, gated by auth. */
export async function refreshNow() {
  await requireAuth();
  const result = await syncAndRecompute('manual');
  revalidatePath('/dashboard');
  return result;
}
