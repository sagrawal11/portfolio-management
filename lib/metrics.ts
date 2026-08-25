// Pure, unit-tested performance math. NO database, NO network — every function
// takes plain numbers/series so the competition-critical math (absolute return,
// Sharpe) can be verified against hand-computed fixtures. See lib/__tests__.

export interface DateValue {
  date: string; // 'YYYY-MM-DD'
  value: number;
}

/**
 * Weekly-equivalent of an annual risk-free rate. Simple `rf/52` to match the
 * typical course / pandas convention; geometric `(1+rf)^(1/52)-1` differs by
 * ~0.04 bps/week and never changes Sharpe ranking.
 */
export function weeklyRiskFree(annual: number): number {
  return annual / 52;
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (ddof=1, matches pandas default). null if n < 2. */
export function sampleStdev(xs: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const m = mean(xs);
  const ss = xs.reduce((a, x) => a + (x - m) ** 2, 0);
  return Math.sqrt(ss / (n - 1));
}

/** Sample covariance (ddof=1). Requires equal-length arrays of length >= 2. */
export function sampleCovariance(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let s = 0;
  for (let i = 0; i < n; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / (n - 1);
}

/** Consecutive simple returns: v[i]/v[i-1] - 1. */
export function periodReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    out.push(prev === 0 ? 0 : values[i] / prev - 1);
  }
  return out;
}

/** ISO-8601 week key 'YYYY-Www' for a 'YYYY-MM-DD' date (weeks Mon–Sun). */
export function isoWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNr = (dt.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  dt.setUTCDate(dt.getUTCDate() - dayNr + 3); // Thursday decides the ISO year
  const isoYear = dt.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4)); // Jan 4 is always in week 1
  const jan4DayNr = (jan4.getUTCDay() + 6) % 7;
  jan4.setUTCDate(jan4.getUTCDate() - jan4DayNr + 3); // Thursday of week 1
  const week = 1 + Math.round((dt.getTime() - jan4.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/**
 * Resample a daily series to one anchor per ISO week = the LAST available
 * trading day's value in each week (matches pandas `resample('W').last()`).
 */
export function weeklyAnchors(daily: DateValue[]): DateValue[] {
  const byWeek = new Map<string, DateValue>();
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  for (const dv of sorted) {
    const wk = isoWeekKey(dv.date);
    const cur = byWeek.get(wk);
    if (!cur || dv.date > cur.date) byWeek.set(wk, dv);
  }
  return [...byWeek.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function portfolioWeeklyReturns(dailyValues: DateValue[]): number[] {
  return periodReturns(weeklyAnchors(dailyValues).map((a) => a.value));
}

function sampleOnOrBefore(sorted: DateValue[], date: string): number | null {
  let ans: number | null = null;
  for (const dv of sorted) {
    if (dv.date <= date) ans = dv.value;
    else break;
  }
  return ans;
}

export interface AlignedWeekly {
  rp: number[]; // portfolio weekly returns
  rm: number[]; // benchmark weekly returns, sampled at the SAME anchor dates
  n: number;
  weeks: string[];
}

/**
 * Portfolio drives the weekly anchor dates; the benchmark is sampled at those
 * same dates (last close on/before each anchor). Pairs are dropped where the
 * benchmark is missing — giving index-matched rp/rm for a valid beta.
 */
export function alignedWeeklyReturns(
  portfolioDaily: DateValue[],
  benchmarkDaily: DateValue[],
): AlignedWeekly {
  const anchors = weeklyAnchors(portfolioDaily);
  const bench = [...benchmarkDaily].sort((a, b) => a.date.localeCompare(b.date));
  const benchAt = anchors.map((a) => sampleOnOrBefore(bench, a.date));
  const rp: number[] = [];
  const rm: number[] = [];
  const weeks: string[] = [];
  for (let i = 1; i < anchors.length; i++) {
    const p0 = anchors[i - 1].value;
    const p1 = anchors[i].value;
    const m0 = benchAt[i - 1];
    const m1 = benchAt[i];
    if (m0 == null || m1 == null || p0 === 0 || m0 === 0) continue;
    rp.push(p1 / p0 - 1);
    rm.push(m1 / m0 - 1);
    weeks.push(anchors[i].date);
  }
  return { rp, rm, n: rp.length, weeks };
}

export interface SharpeResult {
  weekly: number | null;
  annualized: number | null;
  n: number;
}

/** Sharpe on weekly returns: (mean - weeklyRf) / sampleStdev. */
export function sharpe(weeklyReturns: number[], weeklyRf: number): SharpeResult {
  const n = weeklyReturns.length;
  const sd = sampleStdev(weeklyReturns);
  if (sd == null || sd === 0) return { weekly: null, annualized: null, n };
  const weekly = (mean(weeklyReturns) - weeklyRf) / sd;
  return { weekly, annualized: weekly * Math.sqrt(52), n };
}

export function annualizedVolatility(weeklyReturns: number[]): number | null {
  const sd = sampleStdev(weeklyReturns);
  return sd == null ? null : sd * Math.sqrt(52);
}

export interface BetaResult {
  beta: number | null;
  correlation: number | null;
  n: number;
}

/** Beta = Cov(rp,rm)/Var(rm) (OLS slope); correlation = Cov/(σp·σm). */
export function beta(rp: number[], rm: number[]): BetaResult {
  const n = rp.length;
  const cov = sampleCovariance(rp, rm);
  const sdM = sampleStdev(rm);
  const sdP = sampleStdev(rp);
  if (cov == null || sdM == null || sdM === 0) return { beta: null, correlation: null, n };
  const b = cov / (sdM * sdM);
  const corr = sdP != null && sdP !== 0 ? cov / (sdP * sdM) : null;
  return { beta: b, correlation: corr, n };
}

/** Simple absolute (== time-weighted, since no external cash flows) return. */
export function absoluteReturn(current: number, initial: number): number {
  return initial === 0 ? 0 : current / initial - 1;
}

/** Rebase a series to 100 at `base` (the start-date value) for the chart. */
export function indexTo100(series: DateValue[], base: number): DateValue[] {
  if (base === 0) return series.map((s) => ({ date: s.date, value: 0 }));
  return series.map((s) => ({ date: s.date, value: (s.value / base) * 100 }));
}
