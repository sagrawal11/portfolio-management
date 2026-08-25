import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { createPortfolio } from '../lib/setup';
import {
  SEED_HOLDINGS,
  DEFAULT_NOTIONAL,
  DEFAULT_START_DATE,
  DEFAULT_BENCHMARK,
} from '../lib/seed-data';

// Seed the DB with the starting portfolio. Override via env:
//   SEED_START_DATE=2026-08-25 SEED_NOTIONAL=100000 npm run seed
async function main() {
  const res = await createPortfolio({
    startDate: process.env.SEED_START_DATE || DEFAULT_START_DATE,
    notional: Number(process.env.SEED_NOTIONAL || DEFAULT_NOTIONAL),
    benchmarkSymbol: DEFAULT_BENCHMARK,
    holdings: SEED_HOLDINGS.map((h) => ({ ticker: h.ticker, weight: h.weight })),
  });
  if (!res.ok) {
    console.error('Seed failed:', res.error);
    process.exit(1);
  }
  console.log('Seeded portfolio successfully.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
