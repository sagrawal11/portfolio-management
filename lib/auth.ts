// Edge-safe auth primitives (no next/headers, no Node Buffer) so this module can
// be imported by both middleware (Edge runtime) and route handlers. The auth
// cookie holds a SHA-256 HMAC-style token derived from AUTH_SECRET + APP_PASSWORD;
// it's constant per deployment (single-user tool) and not guessable without both.

export const AUTH_COOKIE = 'pt_auth';

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function expectedToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET ?? '';
  const password = process.env.APP_PASSWORD ?? '';
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${secret}:${password}`),
  );
  return toHex(digest);
}

/** Constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function isValidPassword(input: string): boolean {
  const password = process.env.APP_PASSWORD ?? '';
  return password.length > 0 && timingSafeEqual(input, password);
}

export async function isValidToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  return timingSafeEqual(token, await expectedToken());
}
