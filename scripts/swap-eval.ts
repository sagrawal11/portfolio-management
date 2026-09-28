// Swap evaluator: for a 1-for-1 reallocation, backtest the RESULTING portfolio
// against your current live book across an out-of-sample year, the recent year,
// the live competition window, and a 10k-semester bootstrap — the same
// methodology used to pick the starting portfolio. Reads the current holdings
// (and the never-held blocklist) straight from the DB so it never goes stale.
//
//   npm run swap-eval                          # every holding vs a default candidate basket
//   npm run swap-eval -- --out=GLD             # only consider swapping GLD out
//   npm run swap-eval -- --out=GLD --in=COST,WMT,V   # specific candidates
//
// Weights are the current dollar bags (allocation) normalized to 100%. Candidates
// that you've ever held are auto-excluded (competition rule: swap-in must be new).
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import YahooFinance from 'yahoo-finance2';
import { db } from '../lib/db';
import { fetchDailyBars, tickerCandidates, sleep, type DailyBar } from '../lib/yahoo';
import { PriceBook } from '../lib/portfolio';
import {
  weeklyRiskFree, weeklyAnchors, portfolioWeeklyReturns, sampleStdev,
  alignedWeeklyReturns, beta as calcBeta, type DateValue,
} from '../lib/metrics';

const yf = new YahooFinance();

// Default candidate basket (never-held names spanning distinct theses). Anything
// you already hold or have ever held is filtered out below.
const DEFAULT_CANDIDATES = ['BRK-B', 'COST', 'WMT', 'V', 'JPM', 'GOOGL', 'AVGO', 'ANET', 'TLT', 'META', 'JNJ'];

const FETCH_START = new Date('2024-01-01T00:00:00Z');
const SEM = 17, BLOCK = 4, SIMS = 10000;

const pct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? 'n/a' : `${(x * 100).toFixed(d)}%`);
const nn = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(d));
const ymd = (v: unknown): string => {
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  return String(v).slice(0, 10);
};
const minusYears = (iso: string, y: number): string => {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - y);
  return d.toISOString().slice(0, 10);
};

function argVal(flag: string): string | undefined {
  const a = process.argv.slice(2).find((x) => x.startsWith(`${flag}=`));
  return a ? a.slice(flag.length + 1) : undefined;
}

async function fetchAll(tickers: Set<string>) {
  const rows: { ticker: string; date: string; adjClose: number }[] = [];
  const missing: string[] = [];
  for (const t of tickers) {
    let bars: DailyBar[] = [];
    for (const c of tickerCandidates(t)) {
      try { bars = await fetchDailyBars(c, FETCH_START, new Date(Date.now() + 864e5)); if (bars.length) break; } catch { /* next */ }
    }
    if (!bars.length) { missing.push(t); continue; }
    for (const b of bars) rows.push({ ticker: t, date: b.date, adjClose: b.adjClose });
    await sleep(150);
  }
  return { book: new PriceBook(rows), missing };
}

async function main() {
  const sql = db();
  const cfg = (await sql`SELECT * FROM portfolio_config WHERE id = 1`)[0] as Record<string, unknown>;
  if (!cfg) throw new Error('No portfolio_config — is the portfolio set up?');
  const holdRows = (await sql`SELECT ticker, allocation FROM holdings WHERE status = 'active'`) as { ticker: string; allocation: string }[];
  const everRows = (await sql`SELECT DISTINCT ticker FROM holdings`) as { ticker: string }[];
  const everHeld = new Set(everRows.map((r) => r.ticker.toUpperCase()));

  const BENCH = String(cfg.benchmark_symbol);
  const RF = Number(cfg.risk_free_annual);
  const startDate = ymd(cfg.start_date);

  // Current book as weights (dollar bags normalized to 100%).
  const totalAlloc = holdRows.reduce((a, h) => a + Number(h.allocation), 0) || 1;
  const BOOK: [string, number][] = holdRows.map((h) => [h.ticker.toUpperCase(), Number(h.allocation) / totalAlloc]);
  const held = new Set(BOOK.map(([t]) => t));

  const OUTS = (argVal('--out')?.split(',').map((s) => s.trim().toUpperCase()) ?? [...held]).filter((t) => held.has(t));
  const rawCands = argVal('--in')?.split(',').map((s) => s.trim().toUpperCase()) ?? DEFAULT_CANDIDATES;
  const CANDIDATES = rawCands.filter((c) => !everHeld.has(c));
  const blocked = rawCands.filter((c) => everHeld.has(c));
  if (blocked.length) console.log(`(excluded — already/ever held: ${blocked.join(', ')})`);
  if (!OUTS.length) throw new Error('No valid --out tickers (must be currently held).');
  if (!CANDIDATES.length) throw new Error('No valid candidates after filtering ever-held.');

  const tickers = new Set<string>([BENCH]);
  for (const [t] of BOOK) tickers.add(t);
  for (const c of CANDIDATES) tickers.add(c);
  const { book, missing } = await fetchAll(tickers);
  if (missing.length) console.log('MISSING (no Yahoo data, dropped):', missing.join(', '));

  const allDates = book.tradingDates([BENCH]);
  const lastDate = allDates[allDates.length - 1];
  const Y1: [string, string] = [minusYears(lastDate, 2), minusYears(lastDate, 1)];
  const FULL: [string, string] = [minusYears(lastDate, 2), lastDate];
  const LIVE: [string, string] = [startDate, lastDate];
  const inWin = (a: string, b: string) => allDates.filter((d) => d >= a && d <= b);

  function series(holds: [string, number][], win: [string, string]): DateValue[] {
    const out: DateValue[] = [];
    for (const d of inWin(win[0], win[1])) {
      let v = 0, ok = true;
      for (const [t, w] of holds) {
        const p1 = book.onOrBefore(t, d), p0 = book.onOrBefore(t, win[0]);
        if (p1 == null || p0 == null || p0 === 0) { ok = false; break; }
        v += w * (p1 / p0);
      }
      if (ok) out.push({ date: d, value: v * 100 });
    }
    return out;
  }
  const benchSeries = (win: [string, string]): DateValue[] => inWin(win[0], win[1]).map((d) => ({ date: d, value: book.onOrBefore(BENCH, d)! }));
  const ret = (s: DateValue[]): number | null => (s.length < 2 ? null : s[s.length - 1].value / s[0].value - 1);

  function metrics(s: DateValue[], bench: DateValue[]) {
    if (s.length < 2) return { Return: 'n/a', Sharpe: 'n/a', Vol: 'n/a', Beta: 'n/a', MaxDD: 'n/a' };
    const wk = portfolioWeeklyReturns(s);
    const sd = sampleStdev(wk);
    const mean = wk.reduce((a, b) => a + b, 0) / (wk.length || 1);
    const sharpe = sd && sd !== 0 ? ((mean - weeklyRiskFree(RF)) / sd) * Math.sqrt(52) : null;
    const al = alignedWeeklyReturns(s, bench);
    const b = calcBeta(al.rp, al.rm);
    let peak = s[0].value, mdd = 0;
    for (const x of s) { if (x.value > peak) peak = x.value; mdd = Math.max(mdd, (peak - x.value) / peak); }
    return { Return: pct(ret(s)), Sharpe: nn(sharpe), Vol: pct(sd ? sd * Math.sqrt(52) : null), Beta: nn(b.beta), MaxDD: pct(mdd) };
  }

  // Bootstrap machinery — one shared set of index-samples so every portfolio is
  // scored on the SAME synthetic semesters (paired, low-variance comparison).
  const anchors = weeklyAnchors(benchSeries(FULL)).map((a) => a.date);
  const weeklyRet = (holds: [string, number][]): number[] => {
    const r: number[] = [];
    for (let i = 1; i < anchors.length; i++) {
      let v = 0;
      for (const [t, w] of holds) {
        const p1 = book.onOrBefore(t, anchors[i]), p0 = book.onOrBefore(t, anchors[i - 1]);
        if (p1 != null && p0 != null && p0 !== 0) v += w * (p1 / p0 - 1);
      }
      r.push(v);
    }
    return r;
  };
  const benchWk = (() => { const r: number[] = []; for (let i = 1; i < anchors.length; i++) { const a = book.onOrBefore(BENCH, anchors[i])!, b = book.onOrBefore(BENCH, anchors[i - 1])!; r.push(a / b - 1); } return r; })();
  const W = benchWk.length, rfw = weeklyRiskFree(RF);
  const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * s.length)]; };
  const samples: number[][] = [];
  for (let s = 0; s < SIMS; s++) {
    const idx: number[] = [];
    while (idx.length < SEM) { const st = Math.floor(Math.random() * (W - BLOCK + 1)); for (let b = 0; b < BLOCK && idx.length < SEM; b++) idx.push(st + b); }
    samples.push(idx);
  }
  function boot(wk: number[], baseWk?: number[]) {
    const rets: number[] = [], sharpes: number[] = []; let beat = 0;
    for (const idx of samples) {
      let cum = 1, mean = 0; const arr = idx.map((i) => wk[i]);
      for (const x of arr) { cum *= 1 + x; mean += x; }
      mean /= SEM; let ss = 0; for (const x of arr) ss += (x - mean) ** 2; const sd = Math.sqrt(ss / (SEM - 1));
      rets.push(cum - 1); sharpes.push(sd > 0 ? ((mean - rfw) / sd) * Math.sqrt(52) : 0);
      if (baseWk) { let bc = 1; for (const i of idx) bc *= 1 + baseWk[i]; if (cum - 1 > bc - 1) beat++; }
    }
    return { MedRet: pct(q(rets, 0.5)), 'P(>0)': pct(rets.filter((x) => x > 0).length / SIMS, 0), MedSharpe: nn(q(sharpes, 0.5)), beatFrac: baseWk ? beat / SIMS : null };
  }
  function corr(a: number[], b: number[]): number | null {
    const n = Math.min(a.length, b.length); if (n < 2) return null;
    const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let cov = 0, va = 0, vb = 0;
    for (let i = 0; i < n; i++) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
    return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : null;
  }

  const bookWk = weeklyRet(BOOK);
  console.log(`\nCurrent book (${startDate} start, ${BENCH}, rf=${pct(RF, 0)}): ${BOOK.map(([t, w]) => `${t} ${pct(w, 0)}`).join(' / ')}`);
  console.log(`Windows: Live=${LIVE[0]}→${LIVE[1]} · Y1oos=${Y1[0]}→${Y1[1]} · 2y=${FULL[0]}→${FULL[1]}`);

  // Candidate standalone stats + correlation to the current book + valuation overlay.
  console.log('\n########## CANDIDATE STANDALONE ##########');
  const standalone: Record<string, unknown>[] = [];
  for (const c of CANDIDATES) {
    if (missing.includes(c)) continue;
    const m = metrics(series([[c, 1]], FULL), benchSeries(FULL));
    let fpe: number | undefined, rec: number | undefined, up = 'n/a';
    try {
      const qs = await yf.quoteSummary(c, { modules: ['summaryDetail', 'financialData', 'defaultKeyStatistics'] });
      fpe = (qs.summaryDetail?.forwardPE ?? qs.defaultKeyStatistics?.forwardPE) as number | undefined;
      rec = qs.financialData?.recommendationMean as number | undefined;
      const cur = qs.financialData?.currentPrice as number | undefined, tgt = qs.financialData?.targetMeanPrice as number | undefined;
      if (cur && tgt) up = pct(tgt / cur - 1);
    } catch { /* skip */ }
    await sleep(150);
    standalone.push({ Ticker: c, Ret2y: m.Return, Sharpe: m.Sharpe, Vol: m.Vol, Beta: m.Beta, MaxDD: m.MaxDD, 'Corr→book': nn(corr(weeklyRet([[c, 1]]), bookWk)), FwdPE: nn(fpe, 1), 'Analyst(1-5)': nn(rec, 2), Upside: up });
  }
  console.table(standalone);

  // Per-OUT: resulting portfolio if you swap that holding for each candidate.
  for (const out of OUTS) {
    const outW = BOOK.find(([t]) => t === out)![1];
    console.log(`\n########## SWAP OUT ${out} (${pct(outW, 0)}) → IN <candidate>  ::  resulting portfolio ##########`);
    const rows: Record<string, unknown>[] = [];
    const mkRow = (label: string, holds: [string, number][] | null) => {
      const sFull = holds ? series(holds, FULL) : benchSeries(FULL);
      const bench = benchSeries(FULL);
      const mF = metrics(sFull, bench);
      const mL = holds ? metrics(series(holds, LIVE), benchSeries(LIVE)) : metrics(benchSeries(LIVE), benchSeries(LIVE));
      const m1 = holds ? metrics(series(holds, Y1), benchSeries(Y1)) : metrics(benchSeries(Y1), benchSeries(Y1));
      const bt = holds ? boot(weeklyRet(holds), bookWk) : boot(benchWk);
      rows.push({ Portfolio: label, RetLive: mL.Return, RetY1oos: m1.Return, Ret2y: mF.Return, Sharpe2y: mF.Sharpe, Vol2y: mF.Vol, Beta: mF.Beta, MaxDD: mF.MaxDD, BootMedRet: bt.MedRet, BootSharpe: bt.MedSharpe, 'P(beat now)': bt.beatFrac == null ? '—' : pct(bt.beatFrac, 0) });
    };
    mkRow('CURRENT (no swap)', BOOK);
    mkRow(BENCH, null);
    for (const c of CANDIDATES) {
      if (missing.includes(c) || c === out) continue;
      mkRow(`${out}→${c}`, BOOK.map(([t, w]) => (t === out ? [c, w] as [string, number] : [t, w])));
    }
    console.table(rows);
  }
  console.log('\nSharpe/Vol annualized from weekly returns. Bootstrap: 10k synthetic 17-wk semesters (block=4wk) on 2y history;');
  console.log("'P(beat now)' = share of semesters the swapped book beats your CURRENT book on return. Higher Sharpe with P(beat)<50% = trading raw-return torque for risk-adjusted quality.");
}
main().catch((e) => { console.error(e); process.exit(1); });
