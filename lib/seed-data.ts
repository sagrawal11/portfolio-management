// The user's starting portfolio — "P2", chosen 2026-08-25 after backtest +
// robustness analysis to compete for BOTH prizes (return + Sharpe): gold +
// miners + mega-cap tech + healthcare + power + energy + one crypto sleeve.
// Pre-fills the setup form and drives `npm run seed`. Weights sum to 100%
// across 9 holdings; exactly one crypto (BTC-USD).
export const SEED_HOLDINGS: { ticker: string; weight: number }[] = [
  { ticker: 'GLD', weight: 0.15 },
  { ticker: 'GDX', weight: 0.1 },
  { ticker: 'NVDA', weight: 0.12 },
  { ticker: 'MSFT', weight: 0.12 },
  { ticker: 'LLY', weight: 0.14 },
  { ticker: 'GEV', weight: 0.12 },
  { ticker: 'BTC-USD', weight: 0.08 },
  { ticker: 'CAT', weight: 0.09 },
  { ticker: 'XOM', weight: 0.08 },
];

export const DEFAULT_NOTIONAL = 100_000;
export const DEFAULT_START_DATE = '2026-08-25';
export const DEFAULT_BENCHMARK = '^SP500TR';
export const DEFAULT_RISK_FREE_ANNUAL = 0.02;
