// Curated research sources (from the user's list), grouped by category on the
// Research page to support weekly "what happened & why" journaling and swap
// decisions. Static config — no DB.
export interface Source {
  name: string;
  url: string;
  categories: string[];
}

export const CATEGORIES = [
  'Stock Data',
  'Fundamental Analysis',
  'Macroeconomics',
  'News',
  'Technical Analysis',
] as const;

export const RESEARCH_SOURCES: Source[] = [
  { name: 'Yahoo Finance', url: 'https://finance.yahoo.com', categories: ['Stock Data', 'Fundamental Analysis', 'News'] },
  { name: 'Morningstar', url: 'https://www.morningstar.com', categories: ['Stock Data', 'Fundamental Analysis'] },
  { name: 'Bloomberg', url: 'https://www.bloomberg.com', categories: ['Stock Data', 'Macroeconomics', 'News'] },
  { name: 'Seeking Alpha', url: 'https://seekingalpha.com', categories: ['Fundamental Analysis', 'News'] },
  { name: 'Investing.com', url: 'https://www.investing.com', categories: ['Stock Data', 'Macroeconomics', 'News', 'Technical Analysis'] },
  { name: 'Stocktwits', url: 'https://stocktwits.com', categories: ['Stock Data', 'News'] },
  { name: 'TradingView', url: 'https://www.tradingview.com', categories: ['Stock Data', 'Technical Analysis'] },
  { name: 'Koyfin', url: 'https://www.koyfin.com', categories: ['Stock Data', 'Fundamental Analysis', 'Macroeconomics'] },
  { name: 'MarketWatch', url: 'https://www.marketwatch.com', categories: ['Stock Data', 'News'] },
  { name: 'FINVIZ', url: 'https://finviz.com', categories: ['Stock Data', 'Fundamental Analysis', 'Technical Analysis'] },
  { name: 'Zacks', url: 'https://www.zacks.com', categories: ['Fundamental Analysis'] },
  { name: 'Simply Wall St', url: 'https://simplywall.st', categories: ['Stock Data', 'Fundamental Analysis'] },
  { name: 'Stock Analysis', url: 'https://stockanalysis.com', categories: ['Stock Data', 'Fundamental Analysis'] },
  { name: 'CompaniesMarketCap', url: 'https://companiesmarketcap.com', categories: ['Stock Data'] },
  { name: 'Macrotrends', url: 'https://www.macrotrends.net', categories: ['Stock Data', 'Fundamental Analysis', 'Macroeconomics'] },
  { name: 'Barchart', url: 'https://www.barchart.com', categories: ['Stock Data', 'Technical Analysis'] },
  { name: 'Google Finance', url: 'https://www.google.com/finance', categories: ['Stock Data', 'News'] },
  { name: 'Nasdaq', url: 'https://www.nasdaq.com', categories: ['Stock Data', 'Fundamental Analysis', 'News'] },
  { name: 'CNBC Markets', url: 'https://www.cnbc.com/markets', categories: ['Stock Data', 'Macroeconomics', 'News'] },
  { name: 'Reuters Markets', url: 'https://www.reuters.com/markets', categories: ['Macroeconomics', 'News'] },
  { name: 'FRED', url: 'https://fred.stlouisfed.org', categories: ['Macroeconomics'] },
  { name: 'SEC EDGAR', url: 'https://www.sec.gov/edgar', categories: ['Fundamental Analysis'] },
  { name: 'World Bank Data', url: 'https://data.worldbank.org', categories: ['Macroeconomics'] },
];
