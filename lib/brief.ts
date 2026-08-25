// Autonomous daily brief: "what happened to the portfolio today, and likely why."
// Facts are computed deterministically from our own tables; the "why" is an AI
// narrative grounded ONLY in those facts + real headlines (no invented news).
// Saved as an `auto` journal entry, one per date. Reused by the cron and the
// manual "Generate brief" action.
import { db } from './db';
import { PriceBook, valueOfHolding, holdingActiveOn, type Holding } from './portfolio';
import { weeklyAnchors, type DateValue } from './metrics';
import { getFredSeries, type FredSeries } from './fred';
import { fetchTickerNews, type NewsItem } from './news';
import { writeNarrative, narrativeEnabled } from './anthropic';
import { sleep } from './yahoo';

function isoDate(v: unknown): string {
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export interface Mover {
  ticker: string;
  display: string;
  dayPct: number | null;
  contribPp: number | null;
}
export interface BriefFacts {
  date: string;
  prevDate: string;
  value: number;
  notional: number;
  dayReturnPct: number;
  benchmarkSymbol: string;
  benchDayReturnPct: number | null;
  sinceStartPct: number;
  wtdPct: number | null;
  movers: Mover[];
  macro: FredSeries[];
}

export async function computeBriefFacts(): Promise<BriefFacts | null> {
  const sql = db();
  const cfgRows = await sql`SELECT start_date::text AS start_date, notional, benchmark_symbol FROM portfolio_config WHERE id = 1`;
  if (!cfgRows.length) return null;
  const cfg = cfgRows[0] as { start_date: string; notional: string; benchmark_symbol: string };

  const snapRows = await sql`SELECT date::text AS date, total_value FROM portfolio_snapshots ORDER BY date`;
  if (snapRows.length < 2) return null; // need a prior day to compare
  const snaps: DateValue[] = (snapRows as { date: string; total_value: string }[]).map((r) => ({
    date: isoDate(r.date),
    value: Number(r.total_value),
  }));
  const last = snaps[snaps.length - 1];
  const prev = snaps[snaps.length - 2];
  const notional = Number(cfg.notional);

  const priceRows = await sql`SELECT ticker, date::text AS date, adj_close FROM price_history WHERE ticker IN (SELECT DISTINCT ticker FROM holdings)`;
  const book = new PriceBook(
    (priceRows as { ticker: string; date: string; adj_close: string }[]).map((r) => ({
      ticker: r.ticker,
      date: isoDate(r.date),
      adjClose: Number(r.adj_close),
    })),
  );
  const benchRows = await sql`SELECT date::text AS date, adj_close FROM benchmark_prices WHERE symbol = ${cfg.benchmark_symbol} ORDER BY date`;
  const benchBook = new PriceBook(
    (benchRows as { date: string; adj_close: string }[]).map((r) => ({
      ticker: cfg.benchmark_symbol,
      date: isoDate(r.date),
      adjClose: Number(r.adj_close),
    })),
  );

  const holdingRows = await sql`SELECT id, ticker, display_ticker, allocation, entry_date::text AS entry_date, exit_date::text AS exit_date, status, is_option FROM holdings`;
  const holdings: Holding[] = (holdingRows as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as number,
    ticker: r.ticker as string,
    allocation: Number(r.allocation),
    entryDate: isoDate(r.entry_date),
    exitDate: r.exit_date ? isoDate(r.exit_date) : null,
    status: r.status as 'active' | 'closed',
    isOption: Boolean(r.is_option),
  }));
  const displayOf = new Map(
    (holdingRows as Array<Record<string, unknown>>).map((r) => [r.ticker as string, r.display_ticker as string]),
  );

  const dayReturnPct = prev.value !== 0 ? last.value / prev.value - 1 : 0;
  const bLast = benchBook.onOrBefore(cfg.benchmark_symbol, last.date);
  const bPrev = benchBook.onOrBefore(cfg.benchmark_symbol, prev.date);
  const benchDayReturnPct = bLast != null && bPrev != null && bPrev !== 0 ? bLast / bPrev - 1 : null;
  const sinceStartPct = notional !== 0 ? last.value / notional - 1 : 0;

  const anchors = weeklyAnchors(snaps);
  let wtdPct: number | null = null;
  if (anchors.length >= 2) {
    const priorAnchor = anchors[anchors.length - 2];
    wtdPct = priorAnchor.value !== 0 ? last.value / priorAnchor.value - 1 : null;
  }

  const movers: Mover[] = holdings
    .filter((h) => holdingActiveOn(h, last.date))
    .map((h) => {
      const vLast = valueOfHolding(h, last.date, book);
      const vPrev = valueOfHolding(h, prev.date, book);
      return {
        ticker: h.ticker,
        display: displayOf.get(h.ticker) ?? h.ticker,
        dayPct: vLast != null && vPrev != null && vPrev !== 0 ? vLast / vPrev - 1 : null,
        contribPp: vLast != null && vPrev != null && prev.value !== 0 ? (vLast - vPrev) / prev.value : null,
      };
    })
    .sort((a, b) => Math.abs(b.contribPp ?? 0) - Math.abs(a.contribPp ?? 0));

  return {
    date: last.date,
    prevDate: prev.date,
    value: last.value,
    notional,
    dayReturnPct,
    benchmarkSymbol: cfg.benchmark_symbol,
    benchDayReturnPct,
    sinceStartPct,
    wtdPct,
    movers,
    macro: await getFredSeries(),
  };
}

const sp = (x: number | null | undefined) =>
  x == null || !Number.isFinite(x) ? 'n/a' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}%`;
const money = (x: number | null | undefined) =>
  x == null || !Number.isFinite(x)
    ? 'n/a'
    : x.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function buildPrompt(facts: BriefFacts, news: Record<string, NewsItem[]>): { system: string; user: string } {
  const system =
    'You are a portfolio analyst writing a short daily brief for a student in a portfolio-management class. ' +
    'Explain what happened to the portfolio today and the LIKELY reasons, using ONLY the data and headlines provided. ' +
    'Do NOT invent news, prices, or numbers. If a mover has no headline, attribute it to the sector/market/macro moves shown, or say the driver is unclear. ' +
    'Be concise (120–180 words), plain-English, and end with a one-line "What to watch." Educational, not financial advice.';
  const lines: string[] = [];
  lines.push(`Date: ${facts.date} (vs prior close ${facts.prevDate})`);
  lines.push(
    `Portfolio ${money(facts.value)} | day ${sp(facts.dayReturnPct)} | ${facts.benchmarkSymbol} day ${sp(facts.benchDayReturnPct)} | since start ${sp(facts.sinceStartPct)}${facts.wtdPct != null ? ` | WTD ${sp(facts.wtdPct)}` : ''}`,
  );
  lines.push('Per-holding contribution to today’s move:');
  for (const m of facts.movers.slice(0, 6)) lines.push(`  ${m.display}: day ${sp(m.dayPct)}, contribution ${sp(m.contribPp)}`);
  if (facts.macro.length) {
    lines.push(`Macro: ${facts.macro.map((f) => `${f.label} ${f.value ?? 'n/a'}${f.units}`).join(', ')}`);
  }
  const heads = Object.entries(news).flatMap(([t, items]) => items.map((n) => `  [${t}] ${n.title} (${n.publisher})`));
  if (heads.length) {
    lines.push('Recent headlines:');
    lines.push(...heads);
  }
  return { system, user: lines.join('\n') };
}

export function renderBrief(facts: BriefFacts, news: Record<string, NewsItem[]>, narrative: string | null): string {
  const out: string[] = [];
  out.push(`AUTO BRIEF — ${facts.date}`);
  out.push(
    `Portfolio ${money(facts.value)} · day ${sp(facts.dayReturnPct)} vs ${facts.benchmarkSymbol} ${sp(facts.benchDayReturnPct)} · since start ${sp(facts.sinceStartPct)}${facts.wtdPct != null ? ` · WTD ${sp(facts.wtdPct)}` : ''}`,
  );
  out.push('');
  out.push('Movers today:');
  for (const m of facts.movers.slice(0, 5)) out.push(`  • ${m.display}  ${sp(m.dayPct)}  (contribution ${sp(m.contribPp)})`);
  out.push('');
  out.push('Analysis:');
  out.push(
    narrative ??
      (narrativeEnabled()
        ? '(AI narrative returned nothing this run.)'
        : '(Set ANTHROPIC_API_KEY in the environment to enable the AI "why". The facts and headlines here are the deterministic brief.)'),
  );
  const heads = Object.entries(news).flatMap(([t, items]) => items.slice(0, 2).map((n) => `  • [${t}] ${n.title} — ${n.publisher}`));
  if (heads.length) {
    out.push('');
    out.push('Headlines:');
    out.push(...heads);
  }
  return out.join('\n');
}

export interface BriefResult {
  ok: boolean;
  saved: boolean;
  date?: string;
  reason?: string;
}

export async function generateDailyBrief(_trigger: 'cron' | 'manual'): Promise<BriefResult> {
  const facts = await computeBriefFacts();
  if (!facts) return { ok: true, saved: false, reason: 'Need at least 2 days of price snapshots first.' };

  const news: Record<string, NewsItem[]> = {};
  for (const m of facts.movers.slice(0, 4)) {
    if (m.contribPp == null) continue;
    news[m.display] = await fetchTickerNews(m.ticker, 3);
    await sleep(150);
  }

  const { system, user } = buildPrompt(facts, news);
  const narrative = await writeNarrative(system, user);
  const note = renderBrief(facts, news, narrative);

  const sql = db();
  await sql`DELETE FROM journal_entries WHERE date = ${facts.date} AND source = 'auto'`;
  await sql`INSERT INTO journal_entries (date, note, source) VALUES (${facts.date}, ${note}, 'auto')`;
  return { ok: true, saved: true, date: facts.date };
}
