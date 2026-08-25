// The user's starting portfolio (from the class assignment). Pre-fills the setup
// form and drives `npm run seed`. Weights sum to exactly 100% across 10 holdings
// (the assignment cap). display tickers are what the user typed; BRK.B is
// canonicalized to BRK-B by resolveSymbol at seed time.
export const SEED_HOLDINGS: { ticker: string; weight: number }[] = [
  { ticker: 'USMV', weight: 0.2 },
  { ticker: 'GLD', weight: 0.15 },
  { ticker: 'JNJ', weight: 0.12 },
  { ticker: 'PG', weight: 0.12 },
  { ticker: 'KO', weight: 0.08 },
  { ticker: 'NEE', weight: 0.08 },
  { ticker: 'VZ', weight: 0.08 },
  { ticker: 'BRK.B', weight: 0.08 },
  { ticker: 'AGG', weight: 0.05 },
  { ticker: 'SPY', weight: 0.04 },
];

export const DEFAULT_NOTIONAL = 100_000;
export const DEFAULT_START_DATE = '2026-08-25';
export const DEFAULT_BENCHMARK = '^SP500TR';
export const DEFAULT_RISK_FREE_ANNUAL = 0.02;
