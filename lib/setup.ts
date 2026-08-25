// Portfolio creation/seed — shared by the web setup form and `npm run seed`.
// Resolves/canonicalizes tickers, enforces the class rules, writes config +
// holdings + initial_buy transactions, then syncs prices and backfills display
// entry prices. Re-running replaces the existing portfolio (clean re-seed).
import { db } from './db';
import { resolveSymbol, sleep } from './yahoo';
import { validateSetup, type SetupHoldingInput } from './portfolio';
import { syncAndRecompute } from './sync';
import { DEFAULT_BENCHMARK, DEFAULT_RISK_FREE_ANNUAL } from './seed-data';

export interface SeedHoldingInput {
  ticker: string;
  weight: number; // fraction 0..1
  isOption?: boolean;
}

export interface CreatePortfolioInput {
  startDate: string; // 'YYYY-MM-DD'
  notional: number;
  benchmarkSymbol?: string;
  riskFreeAnnual?: number;
  endDate?: string | null;
  holdings: SeedHoldingInput[];
}

export type CreatePortfolioResult = { ok: true } | { ok: false; error: string };

export async function createPortfolio(input: CreatePortfolioInput): Promise<CreatePortfolioResult> {
  if (!input.startDate) return { ok: false, error: 'Choose a competition start date.' };
  if (!(input.notional > 0)) return { ok: false, error: 'Enter a portfolio value greater than 0.' };

  // 1) Resolve/canonicalize each ticker (also detects crypto/option, currency).
  const resolved: {
    input: SeedHoldingInput;
    symbol: string;
    display: string;
    isCrypto: boolean;
    isOption: boolean;
    currency: string;
  }[] = [];
  for (const h of input.holdings) {
    if (!h.ticker?.trim()) continue;
    try {
      const meta = await resolveSymbol(h.ticker);
      resolved.push({
        input: h,
        symbol: meta.symbol,
        display: h.ticker.trim().toUpperCase(),
        isCrypto: meta.isCrypto,
        isOption: Boolean(h.isOption) || meta.isOption,
        currency: meta.currency,
      });
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    await sleep(150);
  }

  // 2) Enforce class rules on the canonical symbols.
  const setupInput: SetupHoldingInput[] = resolved.map((r) => ({
    ticker: r.symbol,
    weight: r.input.weight,
    isCrypto: r.isCrypto,
    isOption: r.isOption,
  }));
  const v = validateSetup(setupInput);
  if (!v.ok) return v;

  const symbols = resolved.map((r) => r.symbol);
  const dup = symbols.find((s, i) => symbols.indexOf(s) !== i);
  if (dup) return { ok: false, error: `Duplicate holding after normalization: ${dup}.` };

  // 3) Write config + holdings + initial_buy transactions (clean re-seed).
  const sql = db();
  await sql`DELETE FROM transactions`;
  await sql`DELETE FROM portfolio_snapshots`;
  await sql`DELETE FROM holdings`;
  await sql`DELETE FROM portfolio_config`;
  await sql`
    INSERT INTO portfolio_config (id, start_date, end_date, notional, risk_free_annual, benchmark_symbol)
    VALUES (1, ${input.startDate}, ${input.endDate ?? null}, ${input.notional},
            ${input.riskFreeAnnual ?? DEFAULT_RISK_FREE_ANNUAL},
            ${input.benchmarkSymbol ?? DEFAULT_BENCHMARK})`;

  for (const r of resolved) {
    const allocation = r.input.weight * input.notional;
    await sql`
      INSERT INTO holdings (ticker, display_ticker, weight, allocation, entry_date, status, is_option, currency)
      VALUES (${r.symbol}, ${r.display}, ${r.input.weight}, ${allocation}, ${input.startDate}, 'active', ${r.isOption}, ${r.currency})`;
    await sql`
      INSERT INTO transactions (date, type, ticker_in, notes)
      VALUES (${input.startDate}, 'initial_buy', ${r.symbol}, 'Initial position')`;
  }

  // 4) Fetch prices + build snapshots.
  await syncAndRecompute('manual');

  // 5) Backfill display entry_price + shares + tx price from the synced closes
  //    (raw close on/before each holding's entry_date).
  await sql`
    UPDATE holdings h SET
      entry_price = p.close,
      shares = CASE WHEN p.close IS NULL OR p.close = 0 THEN NULL ELSE h.allocation / p.close END
    FROM (
      SELECT DISTINCT ON (ph.ticker) ph.ticker, ph.close
      FROM price_history ph
      JOIN holdings hh ON hh.ticker = ph.ticker AND ph.date <= hh.entry_date
      ORDER BY ph.ticker, ph.date DESC
    ) p
    WHERE h.ticker = p.ticker AND h.entry_price IS NULL`;
  await sql`
    UPDATE transactions t SET price = h.entry_price
    FROM holdings h
    WHERE t.ticker_in = h.ticker AND t.type = 'initial_buy' AND t.price IS NULL`;

  return { ok: true };
}
