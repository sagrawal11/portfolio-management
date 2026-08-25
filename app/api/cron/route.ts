import { type NextRequest } from 'next/server';
import { syncAndRecompute } from '@/lib/sync';

// Triggered by the GitHub Actions workflow (primary) and the Vercel cron backup,
// both sending `Authorization: Bearer <CRON_SECRET>`. Not protected by the
// password gate (see middleware matcher) — it authenticates via the secret.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const result = await syncAndRecompute('cron');
    return Response.json(result);
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
