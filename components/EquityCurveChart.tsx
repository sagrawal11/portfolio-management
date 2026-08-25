'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface ChartPoint {
  date: string;
  portfolio: number;
  benchmark: number | null;
}

export default function EquityCurveChart({
  data,
  benchmarkLabel,
}: {
  data: ChartPoint[];
  benchmarkLabel: string;
}) {
  if (!data.length) {
    return (
      <div className="flex h-80 items-center justify-center text-sm text-zinc-400">
        No data yet — run a refresh after the first market close.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#a1a1aa' }} minTickGap={44} />
        <YAxis
          domain={['auto', 'auto']}
          tick={{ fontSize: 11, fill: '#a1a1aa' }}
          width={44}
          tickFormatter={(v: number) => v.toFixed(0)}
        />
        <Tooltip
          formatter={(value) => (typeof value === 'number' ? value.toFixed(2) : '—')}
          labelStyle={{ fontSize: 12, color: '#3f3f46' }}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e4e4e7' }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="portfolio"
          name="Portfolio"
          stroke="#2563eb"
          dot={false}
          strokeWidth={2}
        />
        <Line
          type="monotone"
          dataKey="benchmark"
          name={benchmarkLabel}
          stroke="#71717a"
          dot={false}
          strokeWidth={1.5}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
