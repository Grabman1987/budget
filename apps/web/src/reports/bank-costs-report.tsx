import {
  AxisLine,
  ChartSvg,
  DimensionChain,
  Graticule,
  Line,
  LineLegend,
  XTicks,
  useAmountPrivacy,
} from '@budget/ui';
import { cents } from '@budget/domain';
import type { BankCostsReport } from '@budget/db';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { request } from '../api/http';
import { chartPoints } from '../charts/tooltip-data';
import { eur, longDay } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { bpText, monthShort, ReportQuery, ScrollRegion } from './spending-shared';
const costsQuery = queryOptions({
  queryKey: [...LEDGER_KEY, 'bank-costs-report'],
  retry: false,
  queryFn: () => request<BankCostsReport>('GET', '/api/reports/spending/costs'),
});
const COLORS = ['var(--line)', 'var(--want)', 'var(--future)', 'var(--ink-3)', 'var(--line-2)'];
export function BankCostsReportPage({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  const query = useQuery(costsQuery);
  const data = !query.isFetching ? query.data : undefined;
  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        data?.months.length
          ? `${monthShort(data.months[0]!)} bis ${monthShort(data.months.at(-1)!)}`
          : 'keine geschlossenen Monate'
      }
      reportStand={{ label: 'Stichtag', value: data?.to ? longDay(data.to) : 'Monatsende' }}
    >
      <div className="kview sr" data-testid="bank-costs-report">
        <ReportQuery query={query} what="Bank- und Zinskosten">
          {(d) => <Body data={d} />}
        </ReportQuery>
      </div>
    </PageFrame>
  );
}
function Body({ data }: { data: BankCostsReport }) {
  useAmountPrivacy();
  const biggest = data.sources[0];
  if (!data.months.length) return <p role="status">Noch keine geschlossenen Monate mit Daten.</p>;
  return (
    <>
      <section className="sr-card sr-wide" aria-labelledby="bc-main">
        <div className="sr-head">
          <h2 id="bc-main">Was kostet uns das Geld selbst?</h2>
          <span
            className={`sr-state ${data.changeCents !== null && data.changeCents <= 0 ? 'is-good' : ''}`}
          >
            {data.changeCents === null
              ? 'Noch keine zwölf Monate davor zum Vergleich'
              : `${eur(data.changeCents, { sign: true })} gegenüber zwölf Monaten davor`}
          </span>
        </div>
        <div className="sr-fig">
          <span>Kosten · letzte {data.months.length} Monate</span>
          <strong data-testid="bc-total">{eur(data.totalCents)}</strong>
        </div>
        <p className="sr-note">
          Ø {eur(Math.round(data.totalCents / data.months.length))} je Monat ·{' '}
          {biggest
            ? `Größte Kostenquelle: ${biggest.name} · ${eur(biggest.cents)}${biggest.derived ? ' (teilweise aus Kreditkonditionen geschätzt)' : ''}`
            : 'Keine erfassten Kosten im Zeitraum.'}
        </p>
        <DimensionChain
          label="Maßkette Bank- und Zinskosten"
          precision="cent"
          terms={[
            { label: 'Haben- und Dividenden-Erträge', value: cents(data.earningsCents) },
            { label: 'Kosten', op: '-', value: cents(data.totalCents) },
            { label: 'Erträge − Kosten', op: '=', value: cents(data.netCents), result: true },
          ]}
        />
        <CostChart data={data} />
        <ul className="sr-leg">
          {data.rows.map((r, i) => (
            <li key={r.key}>
              <i
                className="sw"
                style={{ background: COLORS[i % COLORS.length] }}
                aria-hidden="true"
              />
              {r.name}
            </li>
          ))}
        </ul>
        <LineLegend
          items={[
            { kind: 'actual', label: 'Haben- und Dividenden-Erträge (kein Haushaltseinkommen)' },
          ]}
        />
        <p className="sr-note">
          Kreditkosten der Bankgebühren-Gruppe gelten als gebuchter Zinsanteil; ohne separate
          Buchung schätzen gespeicherte Konditionen die monatlichen Zinsen, mit Zinsänderungen.
          Tilgung bleibt draußen. Bankgebühren, Trade- und Fremdwährungsgebühren verwenden
          gespeicherte Quellen; Sollzinsen/Dispo entsprechend benannte Kategorien. Erträge bleiben
          separat. Spreads und TER sind nicht gebucht.
          {data.skippedForeignTrades
            ? ` ${data.skippedForeignTrades} Trades ohne Wechselkurs fehlen.`
            : ''}
        </p>
      </section>
      <section className="sr-card sr-wide" aria-labelledby="bc-kinds">
        <div className="sr-head">
          <h2 id="bc-kinds">Kosten nach Art</h2>
        </div>
        <ScrollRegion label="Kosten nach Art">
          <table className="sr-table" data-testid="cost-kinds">
            <thead>
              <tr>
                <th scope="col">Posten</th>
                <th scope="col">12 Monate</th>
                <th scope="col">12 Monate davor</th>
                <th scope="col">Veränderung</th>
                <th scope="col">Anteil</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.name}</th>
                  <td>{eur(r.cents)}</td>
                  <td>{r.previousCents === null ? '–' : eur(r.previousCents)}</td>
                  <td>{bpText(r.changeBp, { sign: true })}</td>
                  <td>{bpText(r.shareBp)}</td>
                </tr>
              ))}
              <tr className="is-total">
                <th scope="row">Kosten</th>
                <td>{eur(data.totalCents)}</td>
                <td>{data.previousTotalCents === null ? '–' : eur(data.previousTotalCents)}</td>
                <td colSpan={2} />
              </tr>
              <tr>
                <th scope="row">Haben- und Dividenden-Erträge</th>
                <td>{eur(data.earningsCents)}</td>
                <td>
                  {data.previousEarningsCents === null ? '–' : eur(data.previousEarningsCents)}
                </td>
                <td colSpan={2}>Kein Haushaltseinkommen</td>
              </tr>
            </tbody>
          </table>
        </ScrollRegion>
      </section>
      <section className="sr-card sr-wide" aria-labelledby="bc-sources">
        <div className="sr-head">
          <h2 id="bc-sources">Je Kostenquelle · 12 Monate</h2>
        </div>
        <ScrollRegion label="Kosten je Quelle">
          <table className="sr-table" data-testid="cost-sources">
            <thead>
              <tr>
                <th scope="col">Quelle</th>
                <th scope="col">Art</th>
                <th scope="col">Kosten</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((s) => (
                <tr key={s.id}>
                  <th scope="row">
                    {s.name}
                    {s.derived && <small>aus Kreditkonditionen geschätzt</small>}
                  </th>
                  <td>{data.partLabels[s.kind]}</td>
                  <td>{eur(s.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <p className="sr-note">
          <AppLink to="/einstellungen/konten">Kreditkonditionen pflegen</AppLink> ·{' '}
          <AppLink to="/vermoegen/schulden">Schuldenrechner öffnen</AppLink>
        </p>
      </section>
      <section className="sr-card sr-wide" aria-labelledby="bc-years">
        <div className="sr-head">
          <h2 id="bc-years">Je Kalenderjahr</h2>
        </div>
        <ScrollRegion label="Jährliche Kosten und Erträge">
          <table className="sr-table">
            <thead>
              <tr>
                <th scope="col">Jahr</th>
                {data.rows.map((r) => (
                  <th key={r.key} scope="col">
                    {r.name}
                  </th>
                ))}
                <th scope="col">Kosten</th>
                <th scope="col">Erträge separat</th>
              </tr>
            </thead>
            <tbody>
              {data.years.map((y) => (
                <tr key={y.year}>
                  <th scope="row">
                    {y.year}
                    {y.partial && (
                      <small>
                        {monthShort(y.from)} bis {monthShort(y.to)}
                      </small>
                    )}
                  </th>
                  {y.partCents.map((v, i) => (
                    <td key={data.rows[i]?.key}>{v ? eur(v) : '·'}</td>
                  ))}
                  <td>{eur(y.totalCents)}</td>
                  <td>{eur(y.earningsCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </section>
    </>
  );
}
function CostChart({ data }: { data: BankCostsReport }) {
  const points = data.monthly;
  const hi = Math.max(
    100,
    ...points.map((p) =>
      Math.max(
        p.earningsCents,
        Object.values(p.parts)
          .filter((v) => v > 0)
          .reduce((a, v) => a + v, 0),
      ),
    ),
  );
  const lo = Math.min(
    0,
    ...points.map((p) =>
      Object.values(p.parts)
        .filter((v) => v < 0)
        .reduce((a, v) => a + v, 0),
    ),
  );
  const x = (i: number) => 68 + ((i + 0.5) * 660) / Math.max(1, points.length);
  const y = (v: number) => 226 - ((v - lo) / (hi - lo)) * 200;
  const width = (660 / Math.max(1, points.length)) * 0.6;
  return (
    <ChartSvg
      width={760}
      height={270}
      label="Monatliche Kosten gestapelt nach Art; Erträge als eigene Linie"
      testId="bank-costs-chart"
      points={chartPoints(
        points.map((p) => p.month),
        x,
        [
          ...data.rows.map((r, i) => ({
            name: r.name,
            color: COLORS[i % COLORS.length]!,
            values: points.map((p) => p.parts[r.key] ?? 0),
          })),
          {
            name: 'Haben- und Dividenden-Erträge',
            values: points.map((p) => p.earningsCents),
            color: 'var(--ink)',
          },
        ],
      )}
    >
      <Graticule
        x1={68}
        x2={730}
        lines={[lo, hi / 2, hi].map((v) => ({
          y: y(v),
          label: eur(Math.round(v), { cents: false }),
        }))}
      />
      <AxisLine x1={68} x2={730} y={y(0)} />
      {points.map((p, i) => {
        let positive = 0;
        let negative = 0;
        return (
          <g key={p.month} data-chart-point={i}>
            {data.rows.map((r, j) => {
              const value = p.parts[r.key] ?? 0;
              const start = value >= 0 ? positive : negative;
              if (value >= 0) positive += value;
              else negative += value;
              return (
                <rect
                  key={r.key}
                  x={x(i) - width / 2}
                  width={width}
                  y={Math.min(y(start), y(start + value))}
                  height={Math.abs(y(start) - y(start + value))}
                  fill={COLORS[j % COLORS.length]}
                />
              );
            })}
          </g>
        );
      })}
      <Line kind="actual" points={points.map((p, i) => [x(i), y(p.earningsCents)])} />
      <XTicks y={256} ticks={points.map((p, i) => ({ x: x(i), label: monthShort(p.month) }))} />
    </ChartSvg>
  );
}
