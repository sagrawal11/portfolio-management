// Throwaway probe: confirm yahoo-finance2 v4 runtime behavior against real
// tickers before wiring up lib/yahoo.ts. Run: `npx tsx scripts/probe-yahoo.ts`
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance();

async function probe(symbol: string) {
  try {
    const r = await yf.chart(symbol, {
      period1: '2026-08-10',
      period2: '2026-08-22',
      interval: '1d',
    });
    const q = r.quotes.at(-1);
    console.log(`\n=== ${symbol} ===`);
    console.log(
      `meta: symbol=${r.meta.symbol} currency=${r.meta.currency} type=${r.meta.instrumentType}`,
    );
    console.log(`quotes.length=${r.quotes.length}`);
    console.log('last quote:', q && { date: q.date, close: q.close, adjclose: q.adjclose });
  } catch (e) {
    console.log(`\n=== ${symbol} === ERROR: ${(e as Error).message}`);
  }
}

async function main() {
  for (const s of ['BRK-B', 'BRK.B', '^SP500TR', '^GSPC', 'GLD', 'BTC-USD', 'AGG', 'USMV']) {
    await probe(s);
    await new Promise((r) => setTimeout(r, 300));
  }
}

main();
