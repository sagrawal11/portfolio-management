import YahooFinance from 'yahoo-finance2';

// Server-only Yahoo Finance access. Do NOT import this module from a client
// component ('use client'); it is used by server actions, route handlers, and
// the tsx scripts (seed/migrate). yahoo-finance2 v4 is a class you instantiate.
const yf = new YahooFinance();

export interface DailyBar {
  date: string; // 'YYYY-MM-DD' (UTC calendar date of the bar — see toDateKey)
  close: number; // raw close
  adjClose: number; // split/dividend-adjusted close (falls back to raw close)
}

export interface ResolvedSymbol {
  symbol: string; // canonical Yahoo symbol that actually returned data
  currency: string; // native currency (FX assumed constant per competition rules)
  instrumentType: string; // EQUITY | ETF | INDEX | CRYPTOCURRENCY | OPTION | ...
  isCrypto: boolean;
  isOption: boolean;
  name?: string;
}

/**
 * Candidate Yahoo symbols to try for a user-typed ticker. Yahoo uses '-' for US
 * share classes (BRK.B -> BRK-B) but '.' for exchange suffixes (ASML.AS, 7203.T),
 * so we try the input as-is first, then a dotted->hyphen variant as a fallback.
 * Confirmed empirically: 'BRK.B' 404s, 'BRK-B' works.
 */
export function tickerCandidates(input: string): string[] {
  const t = input.trim().toUpperCase();
  const out = [t];
  if (t.includes('.')) out.push(t.replace(/\./g, '-'));
  return [...new Set(out)].filter(Boolean);
}

/** Heuristic crypto check by symbol suffix; prefer instrumentType when available. */
export function isCryptoSymbol(symbol: string): boolean {
  return /-USD[T]?$/i.test(symbol.trim());
}

/**
 * UTC calendar date of a bar. Equity/ETF/index daily bars are timestamped
 * mid-day UTC (same calendar day as their local/ET trading date); crypto bars
 * are at 00:00 UTC (Yahoo's daily label). The UTC date aligns them consistently
 * across the whole portfolio + benchmark.
 */
function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

/**
 * Resolve + validate a user-typed ticker to its canonical Yahoo symbol, or throw
 * a clear error if not quotable. Returns metadata used for the class-rule checks
 * (crypto/option caps). A successful chart() call is our "quotable on Yahoo" test.
 */
export async function resolveSymbol(input: string): Promise<ResolvedSymbol> {
  const candidates = tickerCandidates(input);
  let lastErr: unknown;
  for (const symbol of candidates) {
    try {
      const r = await yf.chart(symbol, {
        period1: daysAgo(14),
        interval: '1d',
      });
      const type = String(r.meta.instrumentType ?? '');
      return {
        symbol: r.meta.symbol ?? symbol,
        currency: r.meta.currency ?? 'USD',
        instrumentType: type,
        isCrypto: type === 'CRYPTOCURRENCY' || isCryptoSymbol(symbol),
        isOption: type === 'OPTION',
        name:
          (r.meta.longName as string | undefined) ??
          (r.meta.shortName as string | undefined),
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `"${input}" is not quotable on Yahoo Finance (tried ${candidates.join(', ')}).` +
      (lastErr instanceof Error ? ` ${lastErr.message}` : ''),
  );
}

/**
 * Fetch daily bars (raw + adjusted close) for a symbol over [period1, period2].
 * Pass period2 = today+1 to include today's bar once it posts. Rows with no
 * usable close are skipped. Callers should throttle across many symbols.
 */
export async function fetchDailyBars(
  symbol: string,
  period1: Date | string,
  period2?: Date | string,
): Promise<DailyBar[]> {
  const r = await yf.chart(symbol, { period1, period2, interval: '1d' });
  const bars: DailyBar[] = [];
  for (const q of r.quotes) {
    if (q.close == null && q.adjclose == null) continue;
    bars.push({
      date: toDateKey(q.date),
      close: (q.close ?? q.adjclose) as number,
      adjClose: (q.adjclose ?? q.close) as number,
    });
  }
  return bars;
}

/** Sequential throttle helper for callers fetching many symbols (Yahoo ~10 req/min). */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
