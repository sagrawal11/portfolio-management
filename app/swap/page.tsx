import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import { db } from '@/lib/db';
import SwapForm, { type ActiveHolding } from './SwapForm';

export const dynamic = 'force-dynamic';

export default async function SwapPage() {
  const sql = db();
  const cfg = await sql`SELECT 1 FROM portfolio_config WHERE id = 1`;
  if (cfg.length === 0) redirect('/setup');

  const rows = await sql`
    SELECT ticker, display_ticker FROM holdings WHERE status = 'active' ORDER BY allocation DESC`;
  const holdings: ActiveHolding[] = (rows as { ticker: string; display_ticker: string }[]).map((r) => ({
    ticker: r.ticker,
    display: r.display_ticker,
  }));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-3xl px-6 py-8">
        <h1 className="text-xl font-semibold tracking-tight">Swap a holding</h1>
        <p className="mt-1 text-sm text-zinc-500">
          One holding is exchanged 1-for-1 for a brand-new ticker (one you&apos;ve never held). No
          splitting, no merging, max one crypto or option. The full proceeds are reinvested at the
          effective-day close.
        </p>
        <div className="mt-6">
          <SwapForm holdings={holdings} today={today} />
        </div>
      </main>
    </>
  );
}
