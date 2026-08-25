import { describe, it, expect } from 'vitest';
import {
  weeklyRiskFree,
  sampleStdev,
  sampleCovariance,
  periodReturns,
  isoWeekKey,
  weeklyAnchors,
  portfolioWeeklyReturns,
  alignedWeeklyReturns,
  sharpe,
  annualizedVolatility,
  beta,
  absoluteReturn,
  indexTo100,
} from '../metrics';

describe('weeklyRiskFree', () => {
  it('de-annualizes 2% simply (rf/52)', () => {
    expect(weeklyRiskFree(0.02)).toBeCloseTo(0.02 / 52, 12);
  });
});

describe('sampleStdev', () => {
  it('uses n-1: stdev([1..5]) = 1.5811388', () => {
    expect(sampleStdev([1, 2, 3, 4, 5])!).toBeCloseTo(1.5811388300841898, 10);
  });
  it('is null for fewer than 2 points', () => {
    expect(sampleStdev([])).toBeNull();
    expect(sampleStdev([5])).toBeNull();
  });
  it('is 0 for a constant series', () => {
    expect(sampleStdev([10, 10, 10])).toBe(0);
  });
});

describe('sampleCovariance', () => {
  it('matches hand calc and requires equal length', () => {
    expect(sampleCovariance([1, 2, 3], [2, 4, 6])!).toBeCloseTo(2, 10); // cov = 2
    expect(sampleCovariance([1, 2, 3], [1, 2])).toBeNull();
  });
});

describe('periodReturns', () => {
  it('computes consecutive simple returns', () => {
    const r = periodReturns([100, 110, 121]);
    expect(r).toHaveLength(2);
    expect(r[0]).toBeCloseTo(0.1, 10);
    expect(r[1]).toBeCloseTo(0.1, 10);
  });
});

describe('isoWeekKey', () => {
  it('handles canonical ISO cases incl. year boundaries', () => {
    expect(isoWeekKey('2021-01-04')).toBe('2021-W01'); // Monday of W01
    expect(isoWeekKey('2021-01-01')).toBe('2020-W53'); // belongs to prior ISO year
    expect(isoWeekKey('2019-12-30')).toBe('2020-W01'); // Monday, Thursday falls in 2020
    expect(isoWeekKey('2020-01-01')).toBe('2020-W01');
  });
});

describe('weeklyAnchors', () => {
  it('takes the last trading day per ISO week', () => {
    const anchors = weeklyAnchors([
      { date: '2021-01-04', value: 100 }, // Mon W01
      { date: '2021-01-08', value: 108 }, // Fri W01
      { date: '2021-01-11', value: 110 }, // Mon W02
      { date: '2021-01-15', value: 120 }, // Fri W02
    ]);
    expect(anchors.map((a) => a.date)).toEqual(['2021-01-08', '2021-01-15']);
    expect(anchors.map((a) => a.value)).toEqual([108, 120]);
  });
});

describe('portfolioWeeklyReturns', () => {
  it('returns week-over-week returns from Friday anchors', () => {
    const r = portfolioWeeklyReturns([
      { date: '2021-01-08', value: 100 },
      { date: '2021-01-15', value: 110 },
      { date: '2021-01-22', value: 121 },
    ]);
    expect(r).toHaveLength(2);
    expect(r[0]).toBeCloseTo(0.1, 10);
    expect(r[1]).toBeCloseTo(0.1, 10);
  });
});

describe('alignedWeeklyReturns', () => {
  it('pairs portfolio and benchmark at the same anchor dates', () => {
    const { rp, rm, n } = alignedWeeklyReturns(
      [
        { date: '2021-01-08', value: 100 },
        { date: '2021-01-15', value: 110 },
        { date: '2021-01-22', value: 121 },
      ],
      [
        { date: '2021-01-08', value: 200 },
        { date: '2021-01-15', value: 210 },
        { date: '2021-01-22', value: 220.5 },
      ],
    );
    expect(n).toBe(2);
    expect(rp[0]).toBeCloseTo(0.1, 10);
    expect(rm[0]).toBeCloseTo(0.05, 10);
    expect(rm[1]).toBeCloseTo(0.05, 10);
  });

  it('forward-fills the benchmark to the last close on/before the anchor', () => {
    const a = alignedWeeklyReturns(
      [
        { date: '2021-01-08', value: 100 },
        { date: '2021-01-15', value: 110 },
      ],
      [
        { date: '2021-01-07', value: 200 },
        { date: '2021-01-14', value: 210 },
      ],
    );
    expect(a.n).toBe(1);
    expect(a.rm[0]).toBeCloseTo(0.05, 10);
    expect(a.rp[0]).toBeCloseTo(0.1, 10);
  });
});

describe('sharpe', () => {
  it('computes weekly and annualized from a known series', () => {
    const s = sharpe([0.05, 0.15, 0.1], 0); // mean 0.1, stdev 0.05
    expect(s.n).toBe(3);
    expect(s.weekly!).toBeCloseTo(2.0, 10);
    expect(s.annualized!).toBeCloseTo(2 * Math.sqrt(52), 8);
  });
  it('is null when uncomputable (n<2 or stdev 0)', () => {
    expect(sharpe([0.1], 0).weekly).toBeNull();
    expect(sharpe([0.1, 0.1], 0).weekly).toBeNull();
  });
});

describe('annualizedVolatility', () => {
  it('scales weekly stdev by sqrt(52)', () => {
    expect(annualizedVolatility([0.05, 0.15, 0.1])!).toBeCloseTo(0.05 * Math.sqrt(52), 8);
    expect(annualizedVolatility([0.1])).toBeNull();
  });
});

describe('beta', () => {
  it('recovers slope 2 and correlation 1 when rp = 2*rm', () => {
    const b = beta([0.02, 0.04, 0.06, 0.08], [0.01, 0.02, 0.03, 0.04]);
    expect(b.beta!).toBeCloseTo(2.0, 10);
    expect(b.correlation!).toBeCloseTo(1.0, 10);
  });
  it('is null when the benchmark has zero variance', () => {
    expect(beta([0.01, 0.02], [0.03, 0.03]).beta).toBeNull();
  });
});

describe('absoluteReturn & indexTo100', () => {
  it('absolute return', () => {
    expect(absoluteReturn(110000, 100000)).toBeCloseTo(0.1, 10);
  });
  it('rebases a series to 100 at base', () => {
    const idx = indexTo100(
      [
        { date: 'd1', value: 100000 },
        { date: 'd2', value: 110000 },
      ],
      100000,
    );
    expect(idx[0].value).toBeCloseTo(100, 10);
    expect(idx[1].value).toBeCloseTo(110, 10);
  });
});
