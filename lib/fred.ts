// Optional live macro context from FRED (St. Louis Fed). Degrades to [] when no
// FRED_API_KEY is set — the dashboard just hides the chips. Cached ~1h.
export interface FredSeries {
  id: string;
  label: string;
  value: number | null;
  date: string | null;
  units: string;
}

const SERIES: { id: string; label: string; units: string }[] = [
  { id: 'DGS3MO', label: '3-Mo T-Bill', units: '%' },
  { id: 'DGS10', label: '10-Yr Treasury', units: '%' },
  { id: 'VIXCLS', label: 'VIX', units: '' },
  { id: 'FEDFUNDS', label: 'Fed Funds', units: '%' },
];

export async function getFredSeries(): Promise<FredSeries[]> {
  const key = process.env.FRED_API_KEY;
  if (!key) return [];
  return Promise.all(
    SERIES.map(async (s) => {
      try {
        const url =
          `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}` +
          `&api_key=${key}&file_type=json&sort_order=desc&limit=1`;
        const res = await fetch(url, { next: { revalidate: 3600 } });
        if (!res.ok) return { ...s, value: null, date: null };
        const json = (await res.json()) as { observations?: { value: string; date: string }[] };
        const obs = json.observations?.[0];
        const num = obs && obs.value !== '.' ? Number(obs.value) : NaN;
        return { ...s, value: Number.isFinite(num) ? num : null, date: obs?.date ?? null };
      } catch {
        return { ...s, value: null, date: null };
      }
    }),
  );
}
