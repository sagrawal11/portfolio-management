import { signOut } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  await signOut();
  return Response.redirect(new URL('/login', req.url), 303);
}
