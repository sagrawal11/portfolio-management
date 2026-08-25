// Server-only session helpers (use next/headers cookies). Do NOT import from
// middleware — middleware reads cookies off the request and uses lib/auth directly.
import 'server-only';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, expectedToken, isValidToken } from './auth';

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function isAuthed(): Promise<boolean> {
  const store = await cookies();
  return isValidToken(store.get(AUTH_COOKIE)?.value);
}

/** Throws if the caller is not authenticated (use at the top of server actions). */
export async function requireAuth(): Promise<void> {
  if (!(await isAuthed())) throw new Error('Not authenticated.');
}

export async function signIn(): Promise<void> {
  const store = await cookies();
  store.set(AUTH_COOKIE, await expectedToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS,
  });
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
}
