'use server';

import { requireAuth } from '@/lib/session';
import { createPortfolio, type CreatePortfolioResult } from '@/lib/setup';

export interface SeedFormInput {
  startDate: string;
  notional: number;
  benchmarkSymbol?: string;
  holdings: { ticker: string; weight: number; isOption: boolean }[];
}

export async function seedPortfolio(input: SeedFormInput): Promise<CreatePortfolioResult> {
  await requireAuth();
  return createPortfolio({
    startDate: input.startDate,
    notional: input.notional,
    benchmarkSymbol: input.benchmarkSymbol,
    holdings: input.holdings,
  });
}
