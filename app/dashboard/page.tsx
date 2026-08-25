import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import EquityCurveChart from '@/components/EquityCurveChart';
import RefreshButton from '@/components/RefreshButton';
import { getDashboardData } from '@/lib/dashboard';
import { getFredSeries } from '@/lib/fred';
import { fmtMoney, fmtNum, fmtPct, fmtSignedMoney, fmtSignedPct } from '@/lib/format';

export const dynamic = 'force-dynamic';

function Metric({
  label,
  value,
  positive,
  note,
}: {
  label: string;
  value: string;
  positive?: boolean | null;
  note: string;
}) {
  const color = positive == null ? 'text-zinc-900' : positive ? 'text-emerald-600' : 'text-red-600';
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="mt-1 text-xs leading-4 text-zinc-400">{note}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  if (!data) redirect('/setup');
  const fred = await getFredSeries();

  const lowSharpe = data.weeks < 4;
  const lowBeta = data.beta.n < 8;
  const sharpeNote =
    data.sharpe.weekly == null
      ? 'Risk-adjusted return (weekly, 2% rf). Need ≥2 weeks.'
      : `Weekly; annualized ${fmtNum(data.sharpe.annualized, 2)}. n=${data.weeks} wks${lowSharpe ? ' · low n' : ''}. Prize #2.`;
  const betaNote =
    data.beta.beta == null
      ? 'Sensitivity to the S&P 500. Need ≥2 weeks.'
      : `1.0 = moves with the market. corr ${fmtNum(data.beta.correlation, 2)}. n=${data.beta.n} wks${lowBeta ? ' · low n' : ''}.`;

  const active = data.holdings.filter((h) => h.status === 'active');
  const closed = data.holdings.filter((h) => h.status === 'closed');
  const staleError = data.lastSync?.status === 'error';

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              {data.asOf ? `Prices as of ${data.asOf}` : 'No prices yet'} · start {data.startDate} ·{' '}
              {fmtMoney(data.currentValue, 0)} of {fmtMoney(data.notional, 0)}
              {staleError && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">sync error</span>}
            </p>
          </div>
          <RefreshButton />
        </div>

        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric
            label="Absolute Return"
            value={fmtSignedPct(data.absoluteReturnPct)}
            positive={data.absoluteReturnPct == null ? null : data.absoluteReturnPct >= 0}
            note="Total gain/loss vs. your start. Prize #1."
          />
          <Metric
            label={`${data.benchmarkSymbol} Return`}
            value={fmtSignedPct(data.benchmarkReturnPct)}
            positive={data.benchmarkReturnPct == null ? null : data.benchmarkReturnPct >= 0}
            note="S&P 500 total return, same period."
          />
          <Metric
            label="Sharpe (weekly)"
            value={data.sharpe.weekly == null ? 'N/A' : fmtNum(data.sharpe.weekly, 2)}
            note={sharpeNote}
          />
          <Metric
            label="Beta"
            value={data.beta.beta == null ? 'N/A' : fmtNum(data.beta.beta, 2)}
            note={betaNote}
          />
          <Metric
            label="Volatility"
            value={data.annualVolPct == null ? 'N/A' : fmtPct(data.annualVolPct)}
            note="Annualized std dev of weekly returns."
          />
        </section>

        {fred.length > 0 && (
          <section className="mt-4 flex flex-wrap gap-2">
            {fred.map((f) => (
              <div
                key={f.id}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600"
                title={f.date ? `as of ${f.date}` : undefined}
              >
                <span className="font-medium text-zinc-500">{f.label}</span>{' '}
                <span className="tabular-nums text-zinc-900">
                  {f.value == null ? '—' : `${fmtNum(f.value, 2)}${f.units}`}
                </span>
              </div>
            ))}
          </section>
        )}

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium text-zinc-700">
            Portfolio vs. {data.benchmarkSymbol} (indexed to 100 at start)
          </h2>
          <EquityCurveChart data={data.chart} benchmarkLabel={data.benchmarkSymbol} />
        </section>

        <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-medium text-zinc-700">
            Holdings
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Ticker</th>
                  <th className="px-4 py-2 text-right font-medium">Weight</th>
                  <th className="px-4 py-2 text-right font-medium">Shares</th>
                  <th className="px-4 py-2 text-right font-medium">Entry</th>
                  <th className="px-4 py-2 text-right font-medium">Current</th>
                  <th className="px-4 py-2 text-right font-medium">Value</th>
                  <th className="px-4 py-2 text-right font-medium">Gain $</th>
                  <th className="px-4 py-2 text-right font-medium">Gain %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {active.map((h) => (
                  <tr key={h.ticker}>
                    <td className="px-4 py-2 font-mono">
                      {h.displayTicker}
                      {h.isCrypto && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700">crypto</span>}
                      {h.isOption && <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] text-violet-700">option</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtPct(h.weightPct == null ? null : h.weightPct / 100, 1)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtNum(h.shares, 2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtNum(h.entryPrice, 2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtNum(h.currentPrice, 2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(h.value, 0)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${h.gainDollar != null && h.gainDollar < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {fmtSignedMoney(h.gainDollar, 0)}
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${h.gainPct != null && h.gainPct < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {fmtSignedPct(h.gainPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {data.attributionWindow && data.attribution.length > 0 && (
          <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-medium text-zinc-700">
              What moved the portfolio ({data.attributionWindow.from} → {data.attributionWindow.to})
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Each holding&apos;s share of the portfolio&apos;s move — the raw material for your weekly &quot;why.&quot;
            </p>
            <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {data.attribution.map((a) => (
                <div key={a.ticker} className="flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-zinc-50">
                  <span className="font-mono text-zinc-700">{a.ticker}</span>
                  <span className="flex gap-3 tabular-nums">
                    <span className="text-zinc-400">own {fmtSignedPct(a.changePct, 1)}</span>
                    <span className={`w-20 text-right font-medium ${a.contributionPct != null && a.contributionPct < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {fmtSignedPct(a.contributionPct, 2)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {closed.length > 0 && (
          <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-medium text-zinc-700">
              Closed positions
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Ticker</th>
                    <th className="px-4 py-2 font-medium">Entry</th>
                    <th className="px-4 py-2 font-medium">Exit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {closed.map((h) => (
                    <tr key={`${h.ticker}-${h.entryDate}`}>
                      <td className="px-4 py-2 font-mono">{h.displayTicker}</td>
                      <td className="px-4 py-2 tabular-nums text-zinc-500">{h.entryDate}</td>
                      <td className="px-4 py-2 tabular-nums text-zinc-500">{h.exitDate ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
