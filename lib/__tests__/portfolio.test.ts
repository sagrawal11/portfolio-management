import { describe, it, expect } from 'vitest';
import {
  PriceBook,
  holdingActiveOn,
  valueOfHolding,
  totalValueOn,
  buildDailyValueSeries,
  swapProceeds,
  attribution,
  validateSetup,
  validateSwap,
  isCryptoTicker,
  type Holding,
  type SetupHoldingInput,
} from '../portfolio';

function h(
  p: Partial<Holding> & Pick<Holding, 'ticker' | 'allocation' | 'entryDate'>,
): Holding {
  return { id: 1, exitDate: null, status: 'active', isOption: false, ...p };
}

describe('holdingActiveOn', () => {
  it('is [entry, exit) — inclusive of entry, exclusive of exit', () => {
    const hh = h({ ticker: 'X', allocation: 1000, entryDate: '2026-08-25', exitDate: '2026-08-28' });
    expect(holdingActiveOn(hh, '2026-08-24')).toBe(false);
    expect(holdingActiveOn(hh, '2026-08-25')).toBe(true);
    expect(holdingActiveOn(hh, '2026-08-27')).toBe(true);
    expect(holdingActiveOn(hh, '2026-08-28')).toBe(false);
  });
});

describe('valueOfHolding', () => {
  it('values by adjClose ratio; equals allocation at entry', () => {
    const book = new PriceBook([
      { ticker: 'X', date: '2026-08-25', adjClose: 100 },
      { ticker: 'X', date: '2026-08-26', adjClose: 110 },
    ]);
    const hx = h({ ticker: 'X', allocation: 1000, entryDate: '2026-08-25' });
    expect(valueOfHolding(hx, '2026-08-25', book)!).toBeCloseTo(1000, 6);
    expect(valueOfHolding(hx, '2026-08-26', book)!).toBeCloseTo(1100, 6);
  });

  it('is split-invariant (uniform rescale of the adj series cancels)', () => {
    const pre = new PriceBook([
      { ticker: 'S', date: '2026-08-25', adjClose: 100 },
      { ticker: 'S', date: '2026-08-26', adjClose: 120 },
    ]);
    const postSplit = new PriceBook([
      { ticker: 'S', date: '2026-08-25', adjClose: 50 },
      { ticker: 'S', date: '2026-08-26', adjClose: 60 },
    ]);
    const hs = h({ ticker: 'S', allocation: 1000, entryDate: '2026-08-25' });
    expect(valueOfHolding(hs, '2026-08-26', pre)!).toBeCloseTo(1200, 6);
    expect(valueOfHolding(hs, '2026-08-26', postSplit)!).toBeCloseTo(1200, 6);
  });
});

describe('totalValueOn', () => {
  it('equals notional at the start date', () => {
    const book = new PriceBook([
      { ticker: 'X', date: '2026-08-25', adjClose: 50 },
      { ticker: 'Y', date: '2026-08-25', adjClose: 200 },
    ]);
    const hs = [
      h({ ticker: 'X', allocation: 600, entryDate: '2026-08-25' }),
      h({ ticker: 'Y', allocation: 400, entryDate: '2026-08-25' }),
    ];
    expect(totalValueOn(hs, '2026-08-25', book)!).toBeCloseTo(1000, 6);
  });
});

describe('swap mechanics', () => {
  const book = new PriceBook([
    { ticker: 'A', date: '2026-08-25', adjClose: 100 },
    { ticker: 'A', date: '2026-08-27', adjClose: 120 },
    { ticker: 'B', date: '2026-08-27', adjClose: 60 },
    { ticker: 'B', date: '2026-08-28', adjClose: 66 },
  ]);

  it('is value-continuous across the swap with no cash injected', () => {
    const aPre = h({ ticker: 'A', allocation: 1000, entryDate: '2026-08-25' });
    const proceeds = swapProceeds(aPre, '2026-08-27', book)!;
    expect(proceeds).toBeCloseTo(1200, 6); // A rose 100 -> 120

    const aClosed = h({
      ticker: 'A',
      allocation: 1000,
      entryDate: '2026-08-25',
      exitDate: '2026-08-27',
      status: 'closed',
    });
    const bNew = h({ id: 2, ticker: 'B', allocation: proceeds, entryDate: '2026-08-27' });
    const post = [aClosed, bNew];

    // On the swap date the new holding carries exactly the old holding's value.
    expect(totalValueOn(post, '2026-08-27', book)!).toBeCloseTo(1200, 6);
    // And it compounds from there (B rose 60 -> 66 = +10%).
    expect(totalValueOn(post, '2026-08-28', book)!).toBeCloseTo(1320, 6);
  });
});

describe('buildDailyValueSeries', () => {
  it('produces one point per trading date from the start', () => {
    const book = new PriceBook([
      { ticker: 'X', date: '2026-08-25', adjClose: 100 },
      { ticker: 'X', date: '2026-08-26', adjClose: 110 },
    ]);
    const series = buildDailyValueSeries(
      [h({ ticker: 'X', allocation: 1000, entryDate: '2026-08-25' })],
      book,
    );
    expect(series).toHaveLength(2);
    expect(series[0].value).toBeCloseTo(1000, 6);
    expect(series[1].value).toBeCloseTo(1100, 6);
  });
});

describe('attribution', () => {
  it('per-holding contributions sum to the portfolio return', () => {
    const book = new PriceBook([
      { ticker: 'X', date: '2026-08-25', adjClose: 100 },
      { ticker: 'X', date: '2026-08-26', adjClose: 110 },
      { ticker: 'Y', date: '2026-08-25', adjClose: 200 },
      { ticker: 'Y', date: '2026-08-26', adjClose: 200 },
    ]);
    const hs = [
      h({ ticker: 'X', allocation: 600, entryDate: '2026-08-25' }),
      h({ ticker: 'Y', allocation: 400, entryDate: '2026-08-25' }),
    ];
    const c = attribution(hs, '2026-08-25', '2026-08-26', book);
    const x = c.find((r) => r.ticker === 'X')!;
    const y = c.find((r) => r.ticker === 'Y')!;
    expect(x.contributionPct!).toBeCloseTo(0.06, 10); // 60/1000
    expect(y.contributionPct!).toBeCloseTo(0.0, 10);
    const sum = (x.contributionPct ?? 0) + (y.contributionPct ?? 0);
    expect(sum).toBeCloseTo(0.06, 10); // portfolio rose 1000 -> 1060
  });
});

describe('validateSetup', () => {
  const ok5: SetupHoldingInput[] = ['A', 'B', 'C', 'D', 'E'].map((t) => ({
    ticker: t,
    weight: 0.2,
    isCrypto: false,
    isOption: false,
  }));

  it('accepts a valid 5–10 holding portfolio summing to 100%', () => {
    expect(validateSetup(ok5).ok).toBe(true);
  });
  it('rejects fewer than 5', () => {
    expect(validateSetup(ok5.slice(0, 4)).ok).toBe(false);
  });
  it('rejects more than 10', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({
      ticker: `T${i}`,
      weight: 1 / 11,
      isCrypto: false,
      isOption: false,
    }));
    expect(validateSetup(eleven).ok).toBe(false);
  });
  it('rejects weights that do not sum to ~100%', () => {
    const bad = ok5.map((x) => ({ ...x, weight: 0.18 })); // sums to 0.9
    expect(validateSetup(bad).ok).toBe(false);
  });
  it('rejects more than one crypto', () => {
    const twoCrypto: SetupHoldingInput[] = [
      { ticker: 'BTC-USD', weight: 0.2, isCrypto: true, isOption: false },
      { ticker: 'ETH-USD', weight: 0.2, isCrypto: true, isOption: false },
      { ticker: 'AAPL', weight: 0.2, isCrypto: false, isOption: false },
      { ticker: 'MSFT', weight: 0.2, isCrypto: false, isOption: false },
      { ticker: 'GLD', weight: 0.2, isCrypto: false, isOption: false },
    ];
    expect(validateSetup(twoCrypto).ok).toBe(false);
  });
});

describe('validateSwap', () => {
  const base = {
    activeHoldings: [
      { ticker: 'AAPL', isOption: false },
      { ticker: 'MSFT', isOption: false },
    ],
    everHeldTickers: ['AAPL', 'MSFT', 'TSLA'], // TSLA previously held then closed
    tickerInIsCrypto: false,
    tickerInIsOption: false,
  };

  it('accepts swapping an active holding into a never-held ticker', () => {
    expect(validateSwap({ ...base, tickerOut: 'AAPL', tickerIn: 'NVDA' }).ok).toBe(true);
  });
  it('rejects swapping into a currently held ticker', () => {
    expect(validateSwap({ ...base, tickerOut: 'AAPL', tickerIn: 'MSFT' }).ok).toBe(false);
  });
  it('rejects re-entering a previously held (closed) ticker', () => {
    expect(validateSwap({ ...base, tickerOut: 'AAPL', tickerIn: 'TSLA' }).ok).toBe(false);
  });
  it('rejects swapping out a ticker you do not actively hold', () => {
    expect(validateSwap({ ...base, tickerOut: 'XYZ', tickerIn: 'NVDA' }).ok).toBe(false);
  });
  it('rejects introducing a second crypto', () => {
    const withCrypto = {
      ...base,
      activeHoldings: [
        { ticker: 'BTC-USD', isOption: false },
        { ticker: 'AAPL', isOption: false },
      ],
      everHeldTickers: ['BTC-USD', 'AAPL'],
      tickerInIsCrypto: true,
    };
    expect(validateSwap({ ...withCrypto, tickerOut: 'AAPL', tickerIn: 'ETH-USD' }).ok).toBe(false);
  });
});

describe('isCryptoTicker', () => {
  it('detects -USD suffix but not share-class hyphens', () => {
    expect(isCryptoTicker('BTC-USD')).toBe(true);
    expect(isCryptoTicker('BRK-B')).toBe(false);
  });
});
