import { BenchmarkChoices } from './portfolio-benchmark-settings';
import { PerformanceChart } from './performance-chart';
import type { PortfolioBenchmarkSeries } from '@budget/db';
import { ReportPeriodControl } from '../reports/period-quick-select';
import { useAmountPrivacy } from '@budget/ui';
import type { DepotColumn, DepotComparison } from '@budget/db';
import { queryOptions, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { request } from '../api/http';
import { LoadingNote } from '../ledger/states';
import { type WithValuationNotes } from '../ledger/valuation-hint';
import { eur, longDay } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import { periodText } from '../wealth/networth-model';
import { useZeitraum, ZEITRAUM_VALUES } from '../wealth/zeitraum';
import type { Period } from '@budget/domain';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from './placeholder-page';
import {
  DecisionLink,
  ReportUnavailable,
  SignedMoney,
  bpText,
  percentText,
} from './portfolio-report-shared';
import './portfolio-depots-report.css';

interface DepotsResponse extends WithValuationNotes {
  depots: DepotComparison;
}

const depotsQuery = (period: Period) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'portfolio-depots-report', period],
    retry: false,
    queryFn: () => request<DepotsResponse>('GET', `/api/portfolio/depots?period=${period}`),
  });

/** Below this volatility (0,5 % p. a., e.g. a manually valued P2P depot) a Sharpe ratio says nothing. */
const MIN_VOLATILITY_FOR_SHARPE = 0.005;

const PERIOD_OPTIONS = ZEITRAUM_VALUES.map((value) => ({ value, label: value }));

export function PortfolioDepotsReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const [period, setPeriod] = useZeitraum();
  const query = useQuery(depotsQuery(period));
  const data = query.data?.depots;
  return (
    <PageFrame
      verdict={
        data && !query.isFetching && !query.isError
          ? {
              reportId: report.id,
              period: `${data.window?.from}..${data.window?.to}`,
              estimated: Boolean(query.data?.incomplete?.length),
              metric: {
                label: 'Anlagewert am Ende',
                value: data.total?.valueCents ?? null,
                unit: 'money',
              },
            }
          : undefined
      }
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        query.isError
          ? 'nicht verfügbar'
          : data?.window
            ? `${longDay(data.window.from)} bis ${longDay(data.window.to)}`
            : data
              ? 'keine Wertpapierhistorie'
              : 'wird geladen'
      }
      extraFields={[
        {
          label: 'Zeitraum',
          value: (
            <ReportPeriodControl
              label="Zeitraum"
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              className="seg-period"
            />
          ),
        },
      ]}
    >
      <div className="prep portfolio-depots-report">
        {query.isPending && <LoadingNote what="Depots" />}
        {query.isError && (
          <ReportUnavailable
            what="Der Depotvergleich"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {data && !query.isError && data.total === null && (
          <p className="prep-empty" role="status">
            Für die Wertpapiere liegt noch keine bewertbare Historie vor. Es wird kein Anfangswert
            oder Nullertrag angenommen.
          </p>
        )}
        {data && !query.isError && data.total && <DepotsBody data={data} period={period} />}
      </div>
    </PageFrame>
  );
}

function DepotsBody({ data, period }: { data: DepotComparison; period: Period }) {
  useAmountPrivacy();
  const total = data.total as DepotColumn;
  const columns = [...data.depots, total];
  const window = data.window as { from: string; to: string };

  return (
    <>
      <section className="prep-card" aria-labelledby="depots-title">
        <div className="tbd-head">
          <h2 id="depots-title">Depots · {periodText(period, window.from)}</h2>
          <DecisionLink />
        </div>
        <BenchmarkChoices />
        <ul className="depots" aria-label="Depots">
          {columns.map((depot, index) => (
            <DepotCard
              key={depot.accountId ?? 'total'}
              depot={depot}
              position={depot.accountId === null ? 'Σ' : String(index + 1)}
              benchmarks={data.benchmarks}
            />
          ))}
        </ul>
        <p className="vnote">
          Vergleich: EUR-Kurse von Index-ETF, Start = 100. Fehlende Abschlüsse bleiben Lücken.
        </p>
      </section>
      <section className="prep-card" aria-labelledby="depots-kpi-title">
        <div className="tbd-head">
          <h2 id="depots-kpi-title">Kennzahlen nebeneinander</h2>
        </div>
        <KpiTable columns={columns} />
        <p className="vnote">
          TTWROR blendet Ein- und Auszahlungen aus und ist mit dem Vergleichswert vergleichbar; die
          geldgewichtete Rendite (Modified Dietz) zeigt, was das Geld mit den Einzahlungszeitpunkten
          verdient hat
          {total.performance && total.performance.days > 365 ? ' (pro Jahr)' : ''}. Sharpe mit 2,5 %
          sicherem Zins (bei Volatilität unter 0,5 % nicht aussagekräftig und daher ausgelassen).
          Broker und Krypto zeigen Wertpapiere ohne Depotkassa; weitere Anlagekonten ihre
          gespeicherten Werte und externen Flüsse; Gewinn ist Wert am Ende minus Wert am Anfang
          minus Nettoflüsse.
        </p>
      </section>
    </>
  );
}

function DepotCard({
  depot,
  position,
  benchmarks,
}: {
  depot: DepotColumn;
  position: string;
  benchmarks: PortfolioBenchmarkSeries[];
}) {
  useAmountPrivacy();
  const perf = depot.performance;
  const isTotal = depot.accountId === null;
  return (
    <li
      className={`depot${isTotal ? ' is-all' : ''}`}
      data-testid={isTotal ? 'depot-total' : 'depot'}
    >
      <div className="depot-head">
        <span className="depot-pos" aria-hidden="true">
          {position}
        </span>
        <div>
          <h3>{depot.name}</h3>
          {depot.platforms.length > 0 && <small>{depot.platforms.join(', ')}</small>}
        </div>
      </div>
      <p className="depot-fig" data-testid="depot-value">
        {eur(depot.valueCents)}
      </p>
      {perf ? (
        <>
          <table className="depot-calc" aria-label={`Rechnung ${depot.name}`}>
            <tbody>
              <tr>
                <td>Anfang</td>
                <td className="n">{eur(perf.startValueCents)}</td>
              </tr>
              <tr>
                <td>+ Einzahlungen</td>
                <td className="n">{eur(perf.contributionsCents, { sign: true })}</td>
              </tr>
              <tr>
                <td>{perf.gainCents >= 0 ? '+' : '−'} Gewinn</td>
                <td className="n">
                  <SignedMoney cents={perf.gainCents} />
                </td>
              </tr>
              <tr className="is-total">
                <td>= Wert</td>
                <td className="n">{eur(perf.endValueCents)}</td>
              </tr>
            </tbody>
          </table>
          <div className="depot-perf">
            <div>
              <span className="tech">TTWROR</span>
              <strong>{percentText(perf.ttwror, { sign: true })}</strong>
            </div>
            {benchmarks.map((b) => (
              <div key={b.id}>
                <span className="tech">{b.name}</span>
                <strong className="prep-muted">
                  {percentText(b.benchmarkReturn, { sign: true })}
                </strong>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="vnote" role="status">
          Im Zeitraum war dieses Depot nicht bewertet; es wird keine Rendite angenommen.
        </p>
      )}
      <DepotChart depot={depot} benchmarks={benchmarks} />
    </li>
  );
}

function DepotChart({
  depot,
  benchmarks,
}: {
  depot: DepotColumn;
  benchmarks: PortfolioBenchmarkSeries[];
}) {
  return (
    <PerformanceChart
      testId="depot-chart"
      label={`${depot.name}, indexiert auf 100`}
      rows={depot.index}
      lines={[
        { name: depot.name, values: depot.index.map((p) => p.level) },
        ...benchmarks.map((b) => ({
          name: b.name,
          values: depot.index.map((p) => b.index.find((q) => q.date === p.date)?.benchmark ?? null),
          benchmark: true,
        })),
      ]}
    />
  );
}

function KpiTable({ columns }: { columns: DepotColumn[] }) {
  useAmountPrivacy();
  const rows: Array<[string, (depot: DepotColumn) => ReactNode]> = [
    ['Wert', (d) => eur(d.valueCents)],
    ['Anteil', (d) => bpText(d.shareBp)],
    [
      'Einzahlungen',
      (d) => (d.performance ? eur(d.performance.contributionsCents, { sign: true }) : '–'),
    ],
    ['Gewinn', (d) => (d.performance ? <SignedMoney cents={d.performance.gainCents} /> : '–')],
    ['TTWROR', (d) => percentText(d.performance?.ttwror, { sign: true })],
    ['Geldgewichtet', (d) => percentText(d.performance?.moneyWeighted, { sign: true })],
    ['Volatilität p. a.', (d) => percentText(d.performance?.volatility)],
    ['Max. Rückgang', (d) => percentText(d.performance?.maxDrawdown)],
    [
      'Sharpe-Quote',
      (d) =>
        d.performance && d.performance.volatility >= MIN_VOLATILITY_FOR_SHARPE
          ? new Intl.NumberFormat('de-AT', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(d.performance.sharpe)
          : '–',
    ],
  ];
  return (
    <div
      className="prep-scroll depots-kpi"
      role="region"
      aria-label="Kennzahlen, bei Bedarf horizontal verschiebbar"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the wide table.
      tabIndex={0}
    >
      <table className="prep-table">
        <thead>
          <tr>
            <th className="tech depots-first">Kennzahl</th>
            {columns.map((depot) => (
              <th key={depot.accountId ?? 'total'} className="tech n">
                {depot.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, cell]) => (
            <tr key={label}>
              <th scope="row" className="depots-first">
                {label}
              </th>
              {columns.map((depot) => (
                <td
                  key={depot.accountId ?? 'total'}
                  className={`n${depot.accountId === null ? ' depots-sum' : ''}`}
                >
                  {cell(depot)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
