// Dashboard data aggregator: one DB round of reads + all metric computation,
// so the page component stays presentational. Reads snapshots (daily total
// value) as the single source for the chart + weekly-derived metrics.
import { db } from './db';
import {
  PriceBook,
  valueOfHolding,
  attribution,
  isCryptoTicker,
  type Holding,
} from './portfolio';
import {
  type DateValue,
  type SharpeResult,
  type BetaResult,
  weeklyRiskFree,
  portfolioWeeklyReturns,
  sharpe as calcSharpe,
  annualizedVolatility,
  alignedWeeklyReturns,
  beta as calcBeta,
  absoluteReturn,
  weeklyAnchors,
} from './metrics';

function isoDate(v: unknown): string {
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export interface DashboardHolding {
  ticker: string;
  displayTicker: string;
  weightPct: number | null;
  shares: number | null;
  entryPrice: number | null;
  currentPrice: number | null;
  value: number | null;
  gainDollar: number | null;
  gainPct: number | null;
  isCrypto: boolean;
  isOption: boolean;
  currency: string | null;
  status: string;
  entryDate: string;
  exitDate: string | null;
}

export interface DashboardData {
  startDate: string;
  endDate: string | null;
  notional: number;
  benchmarkSymbol: string;
  asOf: string | null;
  currentValue: number | null;
  absoluteReturnPct: number | null;
  benchmarkReturnPct: number | null;
  sharpe: SharpeResult;
  beta: BetaResult;
  annualVolPct: number | null;
  weeks: number;
  chart: { date: string; portfolio: number; benchmark: number | null }[];
  holdings: DashboardHolding[];
  attribution: { ticker: string; contributionPct: number | null; changePct: number | null }[];
  attributionWindow: { from: string; to: string } | null;
  lastSync: { finishedAt: string | null; status: string; error: string | null } | null;
}

export async function getDashboardData(): Promise<DashboardData | null> {
  const sql = db();
  const cfgRows = await sql`
    SELECT start_date::text AS start_date, end_date::text AS end_date,
           notional, benchmark_symbol, risk_free_annual
    FROM portfolio_config WHERE id = 1`;
  if (cfgRows.length === 0) return null;
  const cfg = cfgRows[0] as {
    start_date: string; end_date: string | null; notional: string;
    benchmark_symbol: string; risk_free_annual: string;
  };
  const startDate = isoDate(cfg.start_date);
  const notional = Number(cfg.notional);
  const benchmarkSymbol = cfg.benchmark_symbol;
  const riskFreeAnnual = Number(cfg.risk_free_annual);

  const [holdingRows, priceRows, benchRows, snapRows, syncRows] = await Promise.all([
    sql`SELECT id, ticker, display_ticker, weight, allocation, shares,
               entry_date::text AS entry_date, entry_price,
               exit_date::text AS exit_date, status, is_option, currency
        FROM holdings ORDER BY allocation DESC`,
    sql`SELECT ticker, date::text AS date, adj_close, close FROM price_history
        WHERE ticker IN (SELECT DISTINCT ticker FROM holdings)`,
    sql`SELECT date::text AS date, adj_close FROM benchmark_prices
        WHERE symbol = ${benchmarkSymbol} ORDER BY date`,
    sql`SELECT date::text AS date, total_value FROM portfolio_snapshots ORDER BY date`,
    sql`SELECT finished_at, status, error FROM sync_runs ORDER BY id DESC LIMIT 1`,
  ]);

  // Adjusted-close book for valuation; latest raw close per ticker for display.
  const adjBook = new PriceBook(
    (priceRows as { ticker: string; date: string; adj_close: string }[]).map((r) => ({
      ticker: r.ticker,
      date: isoDate(r.date),
      adjClose: Number(r.adj_close),
    })),
  );
  const rawLatest = new Map<string, number>();
  const rawLatestDate = new Map<string, string>();
  for (const r of priceRows as { ticker: string; date: string; close: string }[]) {
    const d = isoDate(r.date);
    if (!rawLatestDate.has(r.ticker) || d > rawLatestDate.get(r.ticker)!) {
      rawLatestDate.set(r.ticker, d);
      rawLatest.set(r.ticker, Number(r.close));
    }
  }

  const holdingsAll: Holding[] = (holdingRows as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as number,
    ticker: r.ticker as string,
    allocation: Number(r.allocation),
    entryDate: isoDate(r.entry_date),
    exitDate: r.exit_date ? isoDate(r.exit_date) : null,
    status: r.status as 'active' | 'closed',
    isOption: Boolean(r.is_option),
  }));

  const snapshots: DateValue[] = (snapRows as { date: string; total_value: string }[]).map((r) => ({
    date: isoDate(r.date),
    value: Number(r.total_value),
  }));
  const benchmarkDaily: DateValue[] = (benchRows as { date: string; adj_close: string }[]).map((r) => ({
    date: isoDate(r.date),
    value: Number(r.adj_close),
  }));

  const asOf = snapshots.length ? snapshots[snapshots.length - 1].date : null;
  const currentValue = snapshots.length ? snapshots[snapshots.length - 1].value : null;
  const absoluteReturnPct = currentValue != null ? absoluteReturn(currentValue, notional) : null;

  const benchBook = new PriceBook(
    benchmarkDaily.map((d) => ({ ticker: benchmarkSymbol, date: d.date, adjClose: d.value })),
  );
  const benchAtStart = benchBook.onOrBefore(benchmarkSymbol, startDate);
  const benchAtEnd = asOf ? benchBook.onOrBefore(benchmarkSymbol, asOf) : null;
  const benchmarkReturnPct =
    benchAtStart && benchAtEnd ? benchAtEnd / benchAtStart - 1 : null;

  const weeklyRf = weeklyRiskFree(riskFreeAnnual);
  const pWeekly = portfolioWeeklyReturns(snapshots);
  const sharpe = calcSharpe(pWeekly, weeklyRf);
  const aligned = alignedWeeklyReturns(snapshots, benchmarkDaily);
  const beta = calcBeta(aligned.rp, aligned.rm);
  const annualVolPct = annualizedVolatility(pWeekly);

  const chart = snapshots.map((s) => {
    const b = benchAtStart ? benchBook.onOrBefore(benchmarkSymbol, s.date) : null;
    return {
      date: s.date,
      portfolio: (s.value / notional) * 100,
      benchmark: benchAtStart && b != null ? (b / benchAtStart) * 100 : null,
    };
  });

  const activeValueTotal = asOf
    ? holdingsAll
        .filter((h) => h.status === 'active')
        .reduce((a, h) => a + (valueOfHolding(h, asOf, adjBook) ?? 0), 0)
    : 0;

  const holdings: DashboardHolding[] = (holdingRows as Array<Record<string, unknown>>).map((r) => {
    const h = holdingsAll.find((x) => x.id === (r.id as number))!;
    const value = asOf ? valueOfHolding(h, asOf, adjBook) : null;
    const alloc = Number(r.allocation);
    return {
      ticker: r.ticker as string,
      displayTicker: r.display_ticker as string,
      weightPct:
        value != null && activeValueTotal > 0 && r.status === 'active'
          ? (value / activeValueTotal) * 100
          : null,
      shares: r.shares != null ? Number(r.shares) : null,
      entryPrice: r.entry_price != null ? Number(r.entry_price) : null,
      currentPrice: rawLatest.get(r.ticker as string) ?? null,
      value,
      gainDollar: value != null ? value - alloc : null,
      gainPct: value != null && alloc !== 0 ? value / alloc - 1 : null,
      isCrypto: isCryptoTicker(r.ticker as string),
      isOption: Boolean(r.is_option),
      currency: (r.currency as string) ?? null,
      status: r.status as string,
      entryDate: isoDate(r.entry_date),
      exitDate: r.exit_date ? isoDate(r.exit_date) : null,
    };
  });

  // Attribution over the most recent week (for the graded "why").
  const anchors = weeklyAnchors(snapshots);
  let attributionWindow: { from: string; to: string } | null = null;
  let attr: { ticker: string; contributionPct: number | null; changePct: number | null }[] = [];
  if (asOf && snapshots.length) {
    const from = anchors.length >= 2 ? anchors[anchors.length - 2].date : snapshots[0].date;
    attributionWindow = { from, to: asOf };
    attr = attribution(holdingsAll, from, asOf, adjBook)
      .map((c) => ({ ticker: c.ticker, contributionPct: c.contributionPct, changePct: c.changePct }))
      .sort((a, b) => (b.contributionPct ?? -Infinity) - (a.contributionPct ?? -Infinity));
  }

  const sync = syncRows[0] as { finished_at: unknown; status: string; error: string | null } | undefined;
  const lastSync = sync
    ? {
        finishedAt: sync.finished_at ? new Date(sync.finished_at as string).toISOString() : null,
        status: sync.status,
        error: sync.error,
      }
    : null;

  return {
    startDate,
    endDate: cfg.end_date ? isoDate(cfg.end_date) : null,
    notional,
    benchmarkSymbol,
    asOf,
    currentValue,
    absoluteReturnPct,
    benchmarkReturnPct,
    sharpe,
    beta,
    annualVolPct,
    weeks: pWeekly.length,
    chart,
    holdings,
    attribution: attr,
    attributionWindow,
    lastSync,
  };
}
