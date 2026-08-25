import { type NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, isValidToken } from '@/lib/auth';

// Password gate — Next 16 "proxy" convention (formerly middleware.ts). API
// routes self-authenticate (cron via CRON_SECRET, export/logout via cookie);
// /login is public.
export async function proxy(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (await isValidToken(token)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!login|api|_next/static|_next/image|favicon.ico).*)'],
};
