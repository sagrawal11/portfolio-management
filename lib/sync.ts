// Shared price-sync + snapshot-recompute, called by BOTH the cron route and the
// manual "Refresh now" action ("same code path"). Idempotent and self-healing:
// it re-fetches the full daily history from the competition start date every
// run, so a missed/late trigger never leaves a permanent gap.
import { db } from './db';
import { fetchDailyBars, sleep, type DailyBar } from './yahoo';
import { PriceBook, buildDailyValueSeries, type Holding } from './portfolio';

const THROTTLE_MS = 200;

export interface SyncResult {
  ok: boolean;
  tickers: number;
  priceRows: number;
  snapshots: number;
  errors: string[];
}

function isoDate(v: unknown): string {
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

async function fetchWithRetry(ticker: string, p1: Date, p2: Date): Promise<DailyBar[]> {
  try {
    return await fetchDailyBars(ticker, p1, p2);
  } catch {
    await sleep(1000);
    return fetchDailyBars(ticker, p1, p2); // one retry; throws on second failure
  }
}

async function upsertPrices(table: 'price_history' | 'benchmark_prices', key: string, bars: DailyBar[]) {
  const sql = db();
  const keyCol = table === 'price_history' ? 'ticker' : 'symbol';
  const values: string[] = [];
  const params: (string | number)[] = [];
  bars.forEach((b, i) => {
    const o = i * 4;
    values.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4})`);
    params.push(key, b.date, b.adjClose, b.close);
  });
  await sql.query(
    `INSERT INTO ${table} (${keyCol}, date, adj_close, close) VALUES ${values.join(',')}
     ON CONFLICT (${keyCol}, date) DO UPDATE SET adj_close = EXCLUDED.adj_close, close = EXCLUDED.close`,
    params,
  );
}

async function insertSnapshots(series: { date: string; value: number }[]) {
  const sql = db();
  const values: string[] = [];
  const params: (string | number)[] = [];
  series.forEach((s, i) => {
    const o = i * 2;
    values.push(`($${o + 1}, $${o + 2})`);
    params.push(s.date, s.value);
  });
  await sql.query(
    `INSERT INTO portfolio_snapshots (date, total_value) VALUES ${values.join(',')}
     ON CONFLICT (date) DO UPDATE SET total_value = EXCLUDED.total_value`,
    params,
  );
}

export async function syncAndRecompute(trigger: 'cron' | 'manual'): Promise<SyncResult> {
  const sql = db();
  const runRows = await sql`INSERT INTO sync_runs (status, trigger) VALUES ('running', ${trigger}) RETURNING id`;
  const runId = (runRows[0] as { id: number }).id;
  const errors: string[] = [];
  let priceRows = 0;

  try {
    const cfgRows = await sql`
      SELECT start_date::text AS start_date, end_date::text AS end_date, benchmark_symbol
      FROM portfolio_config WHERE id = 1`;
    if (cfgRows.length === 0) throw new Error('Portfolio is not configured yet — complete setup first.');
    const cfg = cfgRows[0] as { start_date: string; end_date: string | null; benchmark_symbol: string };

    const startDate = isoDate(cfg.start_date);
    const period1 = new Date(`${startDate}T00:00:00Z`);
    const period2 = new Date(Date.now() + 86_400_000); // include today's bar once it posts

    // Every ticker ever held — closed holdings still need history for past snapshots.
    const tickerRows = await sql`SELECT DISTINCT ticker FROM holdings`;
    const tickers = tickerRows.map((r) => (r as { ticker: string }).ticker);

    // 1) Backfill holding prices (throttled).
    for (const ticker of tickers) {
      try {
        const bars = await fetchWithRetry(ticker, period1, period2);
        if (bars.length) {
          await upsertPrices('price_history', ticker, bars);
          priceRows += bars.length;
        }
      } catch (e) {
        errors.push(`price ${ticker}: ${(e as Error).message}`);
      }
      await sleep(THROTTLE_MS);
    }

    // 2) Backfill benchmark.
    try {
      const bars = await fetchWithRetry(cfg.benchmark_symbol, period1, period2);
      if (bars.length) {
        await upsertPrices('benchmark_prices', cfg.benchmark_symbol, bars);
        priceRows += bars.length;
      }
    } catch (e) {
      errors.push(`benchmark ${cfg.benchmark_symbol}: ${(e as Error).message}`);
    }

    // 3) Rebuild the daily total-value series from the (possibly updated) prices.
    const priceData = await sql`
      SELECT ticker, date::text AS date, adj_close
      FROM price_history
      WHERE ticker IN (SELECT DISTINCT ticker FROM holdings)`;
    const book = new PriceBook(
      priceData.map((r) => {
        const row = r as { ticker: string; date: string; adj_close: string };
        return { ticker: row.ticker, date: isoDate(row.date), adjClose: Number(row.adj_close) };
      }),
    );

    const holdingRows = await sql`
      SELECT id, ticker, allocation, entry_date::text AS entry_date,
             exit_date::text AS exit_date, status, is_option
      FROM holdings`;
    const holdings: Holding[] = holdingRows.map((r) => {
      const row = r as {
        id: number; ticker: string; allocation: string; entry_date: string;
        exit_date: string | null; status: 'active' | 'closed'; is_option: boolean;
      };
      return {
        id: row.id,
        ticker: row.ticker,
        allocation: Number(row.allocation),
        entryDate: isoDate(row.entry_date),
        exitDate: row.exit_date ? isoDate(row.exit_date) : null,
        status: row.status,
        isOption: row.is_option,
      };
    });

    let series = buildDailyValueSeries(holdings, book);
    const endDate = cfg.end_date ? isoDate(cfg.end_date) : null;
    if (endDate) series = series.filter((s) => s.date <= endDate);

    // Full rebuild (idempotent). Non-atomic DELETE+INSERT is acceptable: the sync
    // is fast and self-heals, and it only ever runs for a single user.
    await sql`DELETE FROM portfolio_snapshots`;
    if (series.length) await insertSnapshots(series);

    await sql`
      UPDATE sync_runs
      SET status = 'ok', finished_at = now(),
          error = ${errors.length ? errors.join('; ') : null},
          detail = ${JSON.stringify({ tickers: tickers.length, priceRows, snapshots: series.length })}::jsonb
      WHERE id = ${runId}`;

    return { ok: true, tickers: tickers.length, priceRows, snapshots: series.length, errors };
  } catch (e) {
    await sql`UPDATE sync_runs SET status = 'error', finished_at = now(), error = ${(e as Error).message} WHERE id = ${runId}`;
    throw e;
  }
}
