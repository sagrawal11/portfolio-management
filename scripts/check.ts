import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const cfg = await sql`SELECT start_date::text AS start_date, notional, benchmark_symbol FROM portfolio_config WHERE id=1`;
  console.log('config:', cfg[0]);

  const h = await sql`
    SELECT display_ticker, ticker, ROUND(allocation::numeric,2) AS alloc,
           ROUND(entry_price::numeric,2) AS entry, ROUND(shares::numeric,4) AS shares, currency
    FROM holdings ORDER BY allocation DESC`;
  console.table(h);

  const ph = await sql`SELECT COUNT(*)::int AS rows, COUNT(DISTINCT ticker)::int AS tickers, MIN(date)::text AS min, MAX(date)::text AS max FROM price_history`;
  console.log('price_history:', ph[0]);
  const bp = await sql`SELECT COUNT(*)::int AS rows, MIN(date)::text AS min, MAX(date)::text AS max FROM benchmark_prices`;
  console.log('benchmark_prices:', bp[0]);
  const sn = await sql`SELECT COUNT(*)::int AS rows, MIN(date)::text AS min, MAX(date)::text AS max FROM portfolio_snapshots`;
  console.log('snapshots:', sn[0]);
  const snv = await sql`(SELECT date::text, ROUND(total_value::numeric,2) AS v FROM portfolio_snapshots ORDER BY date ASC LIMIT 1) UNION ALL (SELECT date::text, ROUND(total_value::numeric,2) FROM portfolio_snapshots ORDER BY date DESC LIMIT 1)`;
  console.log('snapshot first/last:', snv);
  const sr = await sql`SELECT id, status, trigger, error, detail FROM sync_runs ORDER BY id DESC LIMIT 3`;
  console.log('sync_runs:', sr);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
