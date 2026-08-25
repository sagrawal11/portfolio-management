'use server';

import { isValidPassword } from '@/lib/auth';
import { signIn } from '@/lib/session';

export async function login(password: string): Promise<{ ok: boolean; error?: string }> {
  if (!isValidPassword(password)) return { ok: false, error: 'Incorrect password.' };
  await signIn();
  return { ok: true };
}
