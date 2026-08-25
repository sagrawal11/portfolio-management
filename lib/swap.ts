// Reallocation (1-for-1 swap). Enforces the class rules, computes the swapped-in
// allocation as the old holding's value on the effective date (full reinvest, no
// idle cash), and records exit/entry + an audit transaction, then re-syncs.
import { db } from './db';
import { resolveSymbol, fetchDailyBars } from './yahoo';
import { validateSwap } from './portfolio';
import { syncAndRecompute } from './sync';

export interface SwapInput {
  tickerOut: string;
  tickerIn: string;
  date?: string; // requested effective date; defaults to today
  note?: string;
  isOption?: boolean;
}
export type SwapResult = { ok: true; effectiveDate: string } | { ok: false; error: string };

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function executeSwap(input: SwapInput): Promise<SwapResult> {
  const sql = db();
  const cfg = await sql`SELECT 1 FROM portfolio_config WHERE id = 1`;
  if (cfg.length === 0) return { ok: false, error: 'Portfolio is not set up yet.' };

  const reqDate = (input.date && input.date.slice(0, 10)) || isoToday();

  const activeRows = await sql`
    SELECT id, ticker, allocation, entry_date::text AS entry_date, is_option
    FROM holdings WHERE status = 'active'`;
  const everRows = await sql`SELECT DISTINCT ticker FROM holdings`;
  const active = (activeRows as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as number,
    ticker: r.ticker as string,
    allocation: Number(r.allocation),
    entryDate: r.entry_date as string,
    isOption: Boolean(r.is_option),
  }));
  const everHeld = (everRows as { ticker: string }[]).map((r) => r.ticker);

  const out = input.tickerOut.trim().toUpperCase();

  // Resolve/canonicalize the new ticker (also gives crypto/option/currency).
  let meta;
  try {
    meta = await resolveSymbol(input.tickerIn);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const isOption = Boolean(input.isOption) || meta.isOption;

  const v = validateSwap({
    activeHoldings: active.map((h) => ({ ticker: h.ticker, isOption: h.isOption })),
    everHeldTickers: everHeld,
    tickerOut: out,
    tickerIn: meta.symbol,
    tickerInIsCrypto: meta.isCrypto,
    tickerInIsOption: isOption,
  });
  if (!v.ok) return v;

  const oldH = active.find((h) => h.ticker.toUpperCase() === out);
  if (!oldH) return { ok: false, error: `${out} is not an active holding.` };

  // New ticker price on/before the requested date fixes the effective date.
  let newBars;
  try {
    const base = new Date(`${reqDate}T00:00:00Z`).getTime();
    newBars = await fetchDailyBars(meta.symbol, new Date(base - 12 * 864e5), new Date(base + 864e5));
  } catch (e) {
    return { ok: false, error: `Couldn't fetch prices for ${meta.symbol}: ${(e as Error).message}` };
  }
  const newBar = newBars.filter((b) => b.date <= reqDate).at(-1);
  if (!newBar) return { ok: false, error: `No price for ${meta.symbol} on or before ${reqDate}.` };
  const effectiveDate = newBar.date;

  // Old holding's adjusted close at the effective date and at entry (from the
  // already-synced price history) → proceeds via the allocation ratio.
  const oldAtDate = await sql`
    SELECT adj_close, close FROM price_history
    WHERE ticker = ${oldH.ticker} AND date <= ${effectiveDate} ORDER BY date DESC LIMIT 1`;
  const oldAtEntry = await sql`
    SELECT adj_close FROM price_history
    WHERE ticker = ${oldH.ticker} AND date <= ${oldH.entryDate} ORDER BY date DESC LIMIT 1`;
  if (oldAtDate.length === 0 || oldAtEntry.length === 0) {
    return { ok: false, error: `Missing price history for ${oldH.ticker} — run a refresh and retry.` };
  }
  const adjOldAtDate = Number((oldAtDate[0] as { adj_close: string }).adj_close);
  const rawOldAtDate = Number((oldAtDate[0] as { close: string | null }).close);
  const adjOldAtEntry = Number((oldAtEntry[0] as { adj_close: string }).adj_close);
  if (!(adjOldAtEntry > 0)) return { ok: false, error: `Bad entry price for ${oldH.ticker}.` };

  const proceeds = oldH.allocation * (adjOldAtDate / adjOldAtEntry);
  const newShares = newBar.close ? proceeds / newBar.close : null;

  await sql`
    UPDATE holdings SET exit_date = ${effectiveDate}, exit_price = ${rawOldAtDate}, status = 'closed'
    WHERE id = ${oldH.id}`;
  await sql`
    INSERT INTO holdings (ticker, display_ticker, allocation, shares, entry_date, entry_price, status, is_option, currency)
    VALUES (${meta.symbol}, ${input.tickerIn.trim().toUpperCase()}, ${proceeds}, ${newShares},
            ${effectiveDate}, ${newBar.close}, 'active', ${isOption}, ${meta.currency})`;
  await sql`
    INSERT INTO transactions (date, type, ticker_out, ticker_in, price, notes)
    VALUES (${effectiveDate}, 'swap', ${oldH.ticker}, ${meta.symbol}, ${newBar.close}, ${input.note ?? null})`;

  // Re-fetch (now includes the new ticker's full history) and rebuild snapshots.
  await syncAndRecompute('manual');
  return { ok: true, effectiveDate };
}
