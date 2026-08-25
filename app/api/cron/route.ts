import { type NextRequest } from 'next/server';
import { syncAndRecompute } from '@/lib/sync';
import { generateDailyBrief } from '@/lib/brief';

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
    // Auto-journal brief, best-effort: a brief failure must not fail the sync.
    let brief: unknown;
    try {
      brief = await generateDailyBrief('cron');
    } catch (e) {
      brief = { ok: false, error: (e as Error).message };
    }
    return Response.json({ ...result, brief });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
