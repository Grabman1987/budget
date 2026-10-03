import { ReportPeriodControl } from '../reports/period-quick-select';
import { useAmountPrivacy, ChartSvg, Graticule, Line, LineLegend, type Point } from '@budget/ui';
import { returnGap } from '@budget/domain';
import type { DepotColumn, DepotComparison } from '@budget/db';
import { queryOptions, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useElementWidth } from '../charts/use-element-width';
import { request } from '../api/http';
import { LoadingNote } from '../ledger/states';
import { ValuationHint, type WithValuationNotes } from '../ledger/valuation-hint';
import { eur, longDay, shortDay } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import { periodText, yTicks } from '../wealth/networth-model';
import { useZeitraum, ZEITRAUM_VALUES } from '../wealth/zeitraum';
import type { Period } from '@budget/domain';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from './placeholder-page';
import {
  DecisionLink,
  ProductLink,
  ReportUnavailable,
  SignedMoney,
  SignedText,
  bpText,
  percentText,
  ppText,
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
        <ValuationHint incomplete={query.data?.incomplete} />
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
  const benchmarkName = data.benchmark?.name ?? null;
  return (
    <>
      <section className="prep-card" aria-labelledby="depots-title">
        <div className="tbd-head">
          <h2 id="depots-title">Depots · {periodText(period, window.from)}</h2>
          <DecisionLink />
        </div>
        <ul className="depots" aria-label="Depots">
          {columns.map((depot, index) => (
            <DepotCard
              key={depot.accountId ?? 'total'}
              depot={depot}
              position={depot.accountId === null ? 'Σ' : String(index + 1)}
              benchmark={data.benchmarkIndex}
              benchmarkName={benchmarkName}
              benchmarkReturn={depot.performance?.benchmarkTtwror ?? null}
            />
          ))}
        </ul>
        <LineLegend
          items={[
            { kind: 'actual', label: 'Depot, zeitgewichtet' },
            ...(data.benchmarkIndex
              ? [{ kind: 'previous' as const, label: `Vergleich: ${benchmarkName ?? ''}` }]
              : []),
          ]}
        />
        {benchmarkName && (
          <p className="vnote">
            Vergleichswert ist die Kursentwicklung der größten Position ({benchmarkName}), solange
            kein eigener Index hinterlegt ist. Er wird nicht um Ausschüttungen bereinigt.
          </p>
        )}
      </section>
      <section className="prep-card" aria-labelledby="depots-kpi-title">
        <div className="tbd-head">
          <h2 id="depots-kpi-title">Kennzahlen nebeneinander</h2>
        </div>
        <KpiTable columns={columns} benchmarkName={benchmarkName} />
        <p className="vnote">
          TTWROR blendet Ein- und Auszahlungen aus und ist mit dem Vergleichswert vergleichbar; die
          geldgewichtete Rendite (Modified Dietz) zeigt, was das Geld mit den Einzahlungszeitpunkten
          verdient hat
          {total.performance && total.performance.days > 365 ? ' (pro Jahr)' : ''}. Sharpe mit 2,5 %
          sicherem Zins (bei Volatilität unter 0,5 % nicht aussagekräftig und daher ausgelassen).
          Einzahlungen sind die Nettoflüsse der Wertpapieransicht ohne Depotkassa; Gewinn ist Wert
          am Ende minus Wert am Anfang minus Nettoflüsse.
        </p>
      </section>
    </>
  );
}

function DepotCard({
  depot,
  position,
  benchmark,
  benchmarkName,
  benchmarkReturn,
}: {
  depot: DepotColumn;
  position: string;
  benchmark: DepotComparison['benchmarkIndex'];
  benchmarkName: string | null;
  benchmarkReturn: number | null;
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
            <div>
              <span className="tech">Vergleich</span>
              <strong className="prep-muted">
                {benchmarkReturn === null ? '–' : percentText(benchmarkReturn, { sign: true })}
              </strong>
            </div>
          </div>
        </>
      ) : (
        <p className="vnote" role="status">
          Im Zeitraum war dieses Depot nicht bewertet; es wird keine Rendite angenommen.
        </p>
      )}
      <DepotChart depot={depot} benchmark={benchmark} benchmarkName={benchmarkName} />
      <ul className="depot-prods" aria-label={`Produkte in ${depot.name}`}>
        {depot.products.map((product) => (
          <li key={product.securityId}>
            <ProductLink id={product.securityId}>{product.name}</ProductLink>
            <span>{eur(product.valueCents)}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

/** Depot level against the comparison security, both indexed to 100 at the window start. */
function DepotChart({
  depot,
  benchmark,
  benchmarkName,
}: {
  depot: DepotColumn;
  benchmark: DepotComparison['benchmarkIndex'];
  benchmarkName: string | null;
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const line = depot.index;
  const first = line[0];
  const last = line[line.length - 1];
  if (!first || !last || line.length < 2) return <div className="depot-chart" ref={ref} />;
  const t0 = Date.parse(`${first.date}T00:00:00Z`);
  const span = Math.max(1, Date.parse(`${last.date}T00:00:00Z`) - t0);
  const levels = [...line.map((p) => p.level), ...(benchmark ?? []).map((p) => p.level)];
  const lo = Math.min(...levels);
  const hi = Math.max(...levels);
  const pad = (hi - lo) * 0.1 || 1;
  const height = 120;
  const left = 34;
  const right = Math.max(left + 1, width - 8);
  const top = 8;
  const bottom = height - 18;
  const x = (day: string) => left + ((Date.parse(`${day}T00:00:00Z`) - t0) / span) * (right - left);
  const y = (level: number) =>
    bottom - ((level - (lo - pad)) / (hi - lo + pad * 2)) * (bottom - top);
  const points = (items: ReadonlyArray<{ date: string; level: number }>): Point[] =>
    items.map((p) => [x(p.date), y(p.level)]);
  const label = `${depot.name}: Verlauf indexiert auf 100, Ende bei ${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(last.level)}${
    benchmark && benchmarkName
      ? `; Vergleich ${benchmarkName} bei ${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(benchmark[benchmark.length - 1]?.level ?? 100)}`
      : ''
  }.`;
  return (
    <div className="depot-chart" ref={ref}>
      {width > 0 && (
        <ChartSvg width={width} height={height} label={label} testId="depot-chart">
          <Graticule
            x1={left}
            x2={right}
            lines={yTicks(lo - pad, hi + pad, 3).map((v) => ({
              y: y(v),
              label: new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 }).format(v),
            }))}
          />
          {benchmark && benchmark.length > 1 && <Line points={points(benchmark)} kind="previous" />}
          <Line points={points(line)} kind="actual" />
          <text x={left} y={height - 4} className="svg-label">
            {shortDay(first.date)}
          </text>
          <text x={right} y={height - 4} textAnchor="end" className="svg-label">
            {shortDay(last.date)}
          </text>
        </ChartSvg>
      )}
    </div>
  );
}

function KpiTable({
  columns,
  benchmarkName,
}: {
  columns: DepotColumn[];
  benchmarkName: string | null;
}) {
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
    [
      benchmarkName ? `gegen ${benchmarkName}` : 'gegen Vergleichswert',
      (d) => {
        const gap = d.performance
          ? returnGap(d.performance.ttwror, d.performance.benchmarkTtwror)
          : null;
        return <SignedText value={gap}>{ppText(gap)}</SignedText>;
      },
    ],
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
