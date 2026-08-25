'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/session';
import { executeSwap, type SwapInput, type SwapResult } from '@/lib/swap';

export async function submitSwap(input: SwapInput): Promise<SwapResult> {
  await requireAuth();
  const res = await executeSwap(input);
  if (res.ok) {
    revalidatePath('/dashboard');
    revalidatePath('/swap');
  }
  return res;
}
