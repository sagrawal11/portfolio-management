import { db } from '@/lib/db';
import { isAuthed } from '@/lib/session';

export const dynamic = 'force-dynamic';

function csv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '(none)\n';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

export async function GET() {
  if (!(await isAuthed())) return new Response('Unauthorized', { status: 401 });
  const sql = db();

  const holdings = await sql`
    SELECT display_ticker, ticker, status, weight, allocation, shares,
           entry_date::text AS entry_date, entry_price,
           exit_date::text AS exit_date, exit_price, is_option, currency
    FROM holdings ORDER BY entry_date, allocation DESC`;
  const transactions = await sql`
    SELECT date::text AS date, type, ticker_out, ticker_in, price, notes
    FROM transactions ORDER BY date, id`;
  const snapshots = await sql`SELECT date::text AS date, total_value FROM portfolio_snapshots ORDER BY date`;
  const journal = await sql`SELECT date::text AS date, note FROM journal_entries ORDER BY date, id`;
  const prices = await sql`SELECT ticker, date::text AS date, adj_close, close FROM price_history ORDER BY ticker, date`;

  const body =
    `# HOLDINGS\n${csv(holdings as Record<string, unknown>[])}\n` +
    `# TRANSACTIONS\n${csv(transactions as Record<string, unknown>[])}\n` +
    `# PORTFOLIO SNAPSHOTS\n${csv(snapshots as Record<string, unknown>[])}\n` +
    `# JOURNAL\n${csv(journal as Record<string, unknown>[])}\n` +
    `# PRICE HISTORY\n${csv(prices as Record<string, unknown>[])}`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="portfolio-export.csv"`,
    },
  });
}
