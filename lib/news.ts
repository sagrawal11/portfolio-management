import YahooFinance from 'yahoo-finance2';

// Free news source via yahoo-finance2 search. Used to ground the daily brief's
// "why" in real headlines (no separate API key).
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export interface NewsItem {
  title: string;
  publisher: string;
  date: string | null; // 'YYYY-MM-DD'
  link?: string;
}

export async function fetchTickerNews(ticker: string, count = 3): Promise<NewsItem[]> {
  try {
    // Over-fetch, then keep only items whose relatedTickers include this ticker.
    // Yahoo's search matches common-word tickers loosely (e.g. "CAT" returns
    // pet-industry news), so this filter is what keeps the brief's "why" honest.
    const r = await yf.search(ticker, { newsCount: Math.max(count, 8), quotesCount: 0 });
    const t = ticker.toUpperCase();
    return (r.news ?? [])
      .filter((n) =>
        ((n as { relatedTickers?: string[] }).relatedTickers ?? []).map((x) => String(x).toUpperCase()).includes(t),
      )
      .slice(0, count)
      .map((n) => ({
        title: String(n.title ?? '').trim(),
        publisher: String(n.publisher ?? '').trim(),
        date: n.providerPublishTime ? new Date(n.providerPublishTime).toISOString().slice(0, 10) : null,
        link: (n.link as string | undefined) ?? undefined,
      }))
      .filter((n) => n.title);
  } catch {
    return [];
  }
}
