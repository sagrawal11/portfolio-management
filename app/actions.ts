'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/session';
import { syncAndRecompute } from '@/lib/sync';
import { generateDailyBrief } from '@/lib/brief';

/** Manual "Refresh now" — same sync path as the cron, gated by auth. */
export async function refreshNow() {
  await requireAuth();
  const result = await syncAndRecompute('manual');
  revalidatePath('/dashboard');
  return result;
}

/** Manually generate the autonomous daily brief (also runs in the cron). */
export async function generateBriefNow() {
  await requireAuth();
  const res = await generateDailyBrief('manual');
  revalidatePath('/journal');
  return res;
}
