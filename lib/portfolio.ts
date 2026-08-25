// Portfolio valuation + class-rule validators. The valuation is split/dividend
// proof: each holding is an independent "money bag" valued by the ratio of
// adjusted closes, so a global rescale of a ticker's adj-close series (what
// Yahoo does on a split) cancels out and $100k at the start stays $100k.
import type { DateValue } from './metrics';

export interface Holding {
  id: number;
  ticker: string;
  allocation: number; // invariant $ constant (weight*notional, or swap proceeds)
  entryDate: string; // 'YYYY-MM-DD'
  exitDate: string | null;
  status: 'active' | 'closed';
  isOption: boolean;
}

export interface PriceRow {
  ticker: string;
  date: string;
  adjClose: number;
}

/** Adjusted-close lookup with forward-fill (last close on/before a date). */
export class PriceBook {
  private byTicker = new Map<string, DateValue[]>();

  constructor(rows: PriceRow[] = []) {
    const tmp = new Map<string, DateValue[]>();
    for (const r of rows) {
      if (!tmp.has(r.ticker)) tmp.set(r.ticker, []);
      tmp.get(r.ticker)!.push({ date: r.date, value: r.adjClose });
    }
    for (const [t, arr] of tmp) {
      arr.sort((a, b) => a.date.localeCompare(b.date));
      this.byTicker.set(t, arr);
    }
  }

  /** Last adjusted close on or before `date`, or null if none. */
  onOrBefore(ticker: string, date: string): number | null {
    const arr = this.byTicker.get(ticker);
    if (!arr) return null;
    let ans: number | null = null;
    for (const dv of arr) {
      if (dv.date <= date) ans = dv.value;
      else break;
    }
    return ans;
  }

  /** Distinct trading dates across the given tickers (or all), ascending. */
  tradingDates(tickers?: string[]): string[] {
    const set = new Set<string>();
    const keys = tickers ?? [...this.byTicker.keys()];
    for (const t of keys) for (const dv of this.byTicker.get(t) ?? []) set.add(dv.date);
    return [...set].sort();
  }
}

export function holdingActiveOn(h: Holding, date: string): boolean {
  return h.entryDate <= date && (h.exitDate == null || date < h.exitDate);
}

/** Split/dividend-proof value: allocation * adj(date)/adj(entry). null if no price. */
export function valueOfHolding(h: Holding, date: string, book: PriceBook): number | null {
  const entryAdj = book.onOrBefore(h.ticker, h.entryDate);
  const dateAdj = book.onOrBefore(h.ticker, date);
  if (entryAdj == null || dateAdj == null || entryAdj === 0) return null;
  return h.allocation * (dateAdj / entryAdj);
}

export function totalValueOn(holdings: Holding[], date: string, book: PriceBook): number | null {
  let total = 0;
  let any = false;
  for (const h of holdings) {
    if (!holdingActiveOn(h, date)) continue;
    const v = valueOfHolding(h, date, book);
    if (v == null) continue;
    total += v;
    any = true;
  }
  return any ? total : null;
}

/** Daily total-value series over the union of holding trading dates from start. */
export function buildDailyValueSeries(holdings: Holding[], book: PriceBook): DateValue[] {
  if (holdings.length === 0) return [];
  const start = holdings.reduce(
    (min, h) => (h.entryDate < min ? h.entryDate : min),
    holdings[0].entryDate,
  );
  const tickers = [...new Set(holdings.map((h) => h.ticker))];
  const dates = book.tradingDates(tickers).filter((d) => d >= start);
  const out: DateValue[] = [];
  for (const date of dates) {
    const v = totalValueOn(holdings, date, book);
    if (v != null) out.push({ date, value: v });
  }
  return out;
}

/** New holding's allocation when swapping OUT `old` on `swapDate` (full reinvest). */
export function swapProceeds(oldHolding: Holding, swapDate: string, book: PriceBook): number | null {
  return valueOfHolding(oldHolding, swapDate, book);
}

/**
 * Per-holding contribution to portfolio return between two dates, for the
 * graded "explain why" journal. Contribution_i = (value_i(to) - value_i(from))
 * / total_value(from). Contributions sum to the portfolio's return over the
 * window (for holdings active across the whole window).
 */
export interface Contribution {
  ticker: string;
  from: number | null;
  to: number | null;
  changePct: number | null; // holding's own return over the window
  contributionPct: number | null; // share of portfolio return
}

export function attribution(
  holdings: Holding[],
  fromDate: string,
  toDate: string,
  book: PriceBook,
): Contribution[] {
  const base = totalValueOn(holdings, fromDate, book);
  return holdings
    .filter((h) => holdingActiveOn(h, toDate))
    .map((h) => {
      const from = valueOfHolding(h, fromDate, book);
      const to = valueOfHolding(h, toDate, book);
      const changePct = from != null && to != null && from !== 0 ? to / from - 1 : null;
      const contributionPct =
        from != null && to != null && base != null && base !== 0 ? (to - from) / base : null;
      return { ticker: h.ticker, from, to, changePct, contributionPct };
    });
}

// ---- Class-rule validators (pure) -------------------------------------------

export type ValidationResult = { ok: true } | { ok: false; error: string };

const CRYPTO_RE = /-USD[T]?$/i;
export function isCryptoTicker(ticker: string): boolean {
  return CRYPTO_RE.test(ticker.trim());
}

export interface SetupHoldingInput {
  ticker: string;
  weight: number; // 0..1
  isCrypto: boolean;
  isOption: boolean;
}

export function validateSetup(holdings: SetupHoldingInput[]): ValidationResult {
  const n = holdings.length;
  if (n < 5 || n > 10) {
    return { ok: false, error: `Portfolio must hold 5–10 assets (you have ${n}).` };
  }
  const tickers = holdings.map((h) => h.ticker.trim().toUpperCase());
  const dupes = [...new Set(tickers.filter((t, i) => tickers.indexOf(t) !== i))];
  if (dupes.length) {
    return { ok: false, error: `Duplicate ticker(s): ${dupes.join(', ')}. Each holding must be distinct.` };
  }
  const sum = holdings.reduce((a, h) => a + h.weight, 0);
  if (Math.abs(sum - 1) > 0.01) {
    return { ok: false, error: `Weights must sum to ~100% (they sum to ${(sum * 100).toFixed(2)}%).` };
  }
  const cryptos = holdings.filter((h) => h.isCrypto || isCryptoTicker(h.ticker)).length;
  if (cryptos > 1) {
    return { ok: false, error: `At most one crypto position is allowed (you have ${cryptos}).` };
  }
  const options = holdings.filter((h) => h.isOption).length;
  if (options > 1) {
    return { ok: false, error: `At most one option position is allowed (you have ${options}).` };
  }
  return { ok: true };
}

export interface SwapValidationInput {
  activeHoldings: { ticker: string; isOption: boolean }[];
  everHeldTickers: string[]; // active OR closed
  tickerOut: string;
  tickerIn: string;
  tickerInIsCrypto: boolean;
  tickerInIsOption: boolean;
}

export function validateSwap(input: SwapValidationInput): ValidationResult {
  const out = input.tickerOut.trim().toUpperCase();
  const inc = input.tickerIn.trim().toUpperCase();
  const active = input.activeHoldings.map((h) => ({ ...h, ticker: h.ticker.trim().toUpperCase() }));
  const ever = new Set(input.everHeldTickers.map((t) => t.trim().toUpperCase()));

  if (!inc) return { ok: false, error: 'Enter a ticker to swap into.' };
  if (inc === out) {
    return { ok: false, error: 'The new ticker must be different from the one you are swapping out.' };
  }
  const outHolding = active.find((h) => h.ticker === out);
  if (!outHolding) {
    return { ok: false, error: `You can only swap out a holding you currently own (${out} is not active).` };
  }
  if (ever.has(inc)) {
    return {
      ok: false,
      error: `You cannot swap into ${inc} — the new stock must be one you have never invested in (per competition rules).`,
    };
  }

  const activeCryptoNow = active.filter((h) => isCryptoTicker(h.ticker)).length;
  const cryptoAfter =
    activeCryptoNow - (isCryptoTicker(out) ? 1 : 0) + (input.tickerInIsCrypto || isCryptoTicker(inc) ? 1 : 0);
  if (cryptoAfter > 1) {
    return { ok: false, error: 'That swap would leave you holding more than one crypto position (max is one).' };
  }

  const activeOptionNow = active.filter((h) => h.isOption).length;
  const optionAfter = activeOptionNow - (outHolding.isOption ? 1 : 0) + (input.tickerInIsOption ? 1 : 0);
  if (optionAfter > 1) {
    return { ok: false, error: 'That swap would leave you holding more than one option position (max is one).' };
  }

  return { ok: true };
}
