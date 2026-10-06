import {
  addMonths,
  cents,
  cashflowWindow,
  lastDayOfMonth,
  isCalendarRange,
  quickReportPeriod,
  todayInVienna,
  type Period,
} from '@budget/domain';
import {
  Button,
  ChartSvg,
  DimensionChain,
  Graticule,
  AxisLine,
  Line,
  XTicks,
  useAmountPrivacy,
} from '@budget/ui';
import { queryOptions, useQuery } from '@tanstack/react-query';
import type { WholePicture } from '@budget/db';
import { scaleLinear } from 'd3-scale';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import type { WithValuationNotes } from '../ledger/valuation-hint';
import { eur, longDay } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import { Term } from './term';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { useZeitraum } from '../wealth/zeitraum';
import { useElementWidth } from '../charts/use-element-width';
import { chartPercent } from '../charts/tooltip-data';
import { PeriodQuickSelect } from './period-quick-select';
import { monthLong, monthNameOnly } from './overview-format';
import './whole-picture-report.css';

type Data = WholePicture & WithValuationNotes;
type Row = WholePicture['totals'];
const columns: ReadonlyArray<{ key: keyof Row; label: string; report?: string; signed?: boolean }> =
  [
    { key: 'incomeCents', label: 'Einnahmen (Haushalt)', report: 'einnahmen' },
    { key: 'capitalCents', label: 'Kapitalerträge', report: 'psteuern' },
    { key: 'needCents', label: 'Ausgaben Bedarf', report: 'ausgaben' },
    { key: 'wantCents', label: 'Ausgaben Wunsch', report: 'ausgaben' },
    { key: 'savedCents', label: 'Sparbetrag', report: 'cashflow', signed: true },
    { key: 'savingsRateBp', label: 'Sparquote', report: 'sparquote' },
    {
      key: 'investmentsInCents',
      label: 'In Investments eingezahlt',
      signed: true,
    },
    { key: 'marketCents', label: 'Markteffekt', report: 'peinzahlungen', signed: true },
    { key: 'principalCents', label: 'Schuldentilgung' },
    { key: 'otherCents', label: 'Sonstiges', signed: true },
    { key: 'endCents', label: 'Nettovermögen Ende', report: 'vermoegen-schulden' },
    { key: 'deltaCents', label: 'Veränderung zum Vormonat', report: 'vermoegen', signed: true },
  ];
const verdict = (value: number) => (value > 0 ? 'für uns' : value < 0 ? 'gegen uns' : 'neutral');
const tone = (value: number) => (value > 0 ? 'is-up' : value < 0 ? 'is-down' : '');
const cellText = (row: Row, c: (typeof columns)[number], estimated: boolean) => {
  const value = row[c.key];
  if (value === null) return '–';
  if (c.key === 'savingsRateBp') return chartPercent(Number(value));
  return `${estimated && ['marketCents', 'otherCents', 'endCents', 'deltaCents'].includes(c.key) ? '≈' : ''}${eur(Number(value), { sign: c.signed === true })}${c.key === 'marketCents' ? ` · ${verdict(Number(value))}` : ''}`;
};

export function WholePictureVerdict({ row, estimated = false }: { row: Row; estimated?: boolean }) {
  useAmountPrivacy();
  return (
    <p className="whole-verdict" data-testid="whole-verdict">
      {monthNameOnly(row.month)}: {eur(row.savedCents)} gespart, Markt{' '}
      <span className={tone(row.marketCents)}>
        {estimated ? '≈' : ''}
        {eur(row.marketCents, { sign: true })} {verdict(row.marketCents)}
      </span>
      , Nettovermögen {estimated ? '≈' : ''}
      {eur(row.deltaCents, { sign: true })}.
    </p>
  );
}

export function WholePictureReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const [period, setPeriod] = useZeitraum('1J');
  const query = useQuery(
    queryOptions({
      queryKey: [...LEDGER_KEY, 'whole-picture', period],
      retry: false,
      queryFn: () =>
        request<Data>('GET', `/api/overview/whole-picture?period=${encodeURIComponent(period)}`),
    }),
  );
  const data = query.isSuccess ? query.data : undefined;
  const selectionPeriod =
    period === '1J' ? quickReportPeriod('12', data?.today ?? todayInVienna()) : period;
  const navigationMonths = data
    ? cashflowWindow(
        period,
        data.today,
        isCalendarRange(selectionPeriod)
          ? selectionPeriod.split('..')[0]!
          : (data.rows[0]?.month ?? data.today.slice(0, 7)),
      )
    : [];
  const shift = (direction: number) => {
    if (!navigationMonths.length) return;
    const first = addMonths(navigationMonths[0]!, direction * navigationMonths.length);
    const last = addMonths(navigationMonths.at(-1)!, direction * navigationMonths.length);
    setPeriod(`${first}..${last}` as Period);
  };
  const canNext = Boolean(
    navigationMonths.length &&
    addMonths(navigationMonths.at(-1)!, navigationMonths.length) <=
      (data?.today ?? todayInVienna()).slice(0, 7),
  );
  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      standDay={data?.asOf}
      reportDataBasis={
        data?.rows.length
          ? `${monthLong(data.rows[0]!.month)} bis ${monthLong(data.rows.at(-1)!.month)}`
          : 'Keine Monatsdaten'
      }
      extraFields={[
        {
          label: 'Zeitraum',
          value: (
            <div className="report-period-control">
              <Button
                variant="ghost"
                onClick={() => shift(-1)}
                disabled={!navigationMonths.length}
                aria-label="Voriger Zeitraum"
              >
                ‹
              </Button>
              <PeriodQuickSelect period={selectionPeriod} onChange={setPeriod} trend={false} />
              <Button
                variant="ghost"
                onClick={() => shift(1)}
                disabled={!canNext}
                aria-label="Nächster Zeitraum"
              >
                ›
              </Button>
            </div>
          ),
        },
      ]}
    >
      <div className="whole-picture" data-testid="whole-picture">
        {query.isPending && <LoadingNote what="Gesamtübersicht" />}
        {query.isError && (
          <ErrorNote
            what="Gesamtübersicht"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {data && !data.rows.length && <EmptyNote>Noch keine Monate in diesem Zeitraum.</EmptyNote>}
        {data && data.rows.length > 0 && <Body data={data} />}
      </div>
    </PageFrame>
  );
}

function Body({ data }: { data: Data }) {
  useAmountPrivacy();
  const t = data.totals;
  const estimated = (row: Row) =>
    data.incomplete?.some(
      (n) =>
        n.from <= (row.month === 'Summe' ? data.to : lastDayOfMonth(row.month)) &&
        n.to >= (row.month === 'Summe' ? data.from : `${row.month}-01`),
    ) ?? false;
  const rows = [...data.rows].reverse();
  const displayRows = [...rows, t];
  const download = () => {
    const quote = (text: string) => `"${text.replaceAll('"', '""')}"`;
    const csv = [
      ['Monat', ...columns.map((c) => c.label)],
      ...displayRows.map((r) => [
        r.month === 'Summe' ? 'Summe' : monthLong(r.month),
        ...columns.map((c) => cellText(r, c, estimated(r))),
      ]),
    ]
      .map((r) => r.map(quote).join(';'))
      .join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `gesamtuebersicht-${data.rows[0]!.month}-${data.rows.at(-1)!.month}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  };
  return (
    <>
      <section className="card whole-section" aria-label="Maßkette im Zeitraum">
        <h2>Vom Anfang zum Ende {estimated(t) ? '≈' : ''}</h2>
        <DimensionChain
          label="Maßkette Nettovermögen"
          precision="cent"
          terms={[
            { label: 'Nettovermögen Anfang', value: cents(t.startCents) },
            { op: '+', label: 'Einnahmen', value: cents(t.incomeCents) },
            { op: '-', label: 'Ausgaben', value: cents(t.needCents + t.wantCents) },
            { op: '+', label: 'Markt', value: cents(t.marketCents), signed: true },
            { op: '+', label: 'Sonstiges', value: cents(t.otherCents), signed: true },
            { op: '=', label: 'Nettovermögen Ende', value: cents(t.endCents), result: true },
          ]}
        />
        <p>
          Sparbetrag: <strong>{eur(t.savedCents)}</strong>
        </p>
        <p>
          Kapitalerträge separat: <strong>{eur(t.capitalCents)}</strong>
        </p>
        <p className="text-muted">
          Kapitalerträge sind keine Haushaltseinnahmen. Sie stecken im Investment-Ergebnis oder in
          Sonstiges und werden nicht nochmals addiert. Sonstiges enthält die übrigen
          Vermögensbewegungen, etwa Bewertungen, Erstattungen und Rundung.
        </p>
        {data.latestFullMonth && (
          <WholePictureVerdict
            row={data.latestFullMonth}
            estimated={estimated(data.latestFullMonth)}
          />
        )}
      </section>
      <section className="card whole-section" aria-label="Monatsverlauf">
        <h2>Sparen, Markt und Nettovermögen</h2>
        <WholeChart data={data} />
        <ul className="whole-legend">
          <li>
            <i />
            Sparbetrag
          </li>
          <li>
            <i className="whole-market" />
            Markteffekt
          </li>
          <li>─ Nettovermögen (eigenes Band)</li>
        </ul>
        <p className="text-muted">
          Markteffekt = Investmentwert inklusive Anlage-Cash am Ende − am Anfang − externe
          Nettoflüsse. „In Investments eingezahlt“ zeigt nur Netto-Umbuchungen aus Budgetkonten;
          interne Investment-Umbuchungen sind neutral.
        </p>
      </section>
      <section className="card whole-section">
        <div className="whole-table-head">
          <h2>Je Monat</h2>
          <Button variant="ghost" onClick={download}>
            CSV exportieren
          </Button>
        </div>
        <p className="text-muted">
          Stand {longDay(data.asOf)} · Summenzeile: Veränderung im Zeitraum; Nettovermögen als
          Endstand.
        </p>
        <div
          className="whole-scroll"
          role="region"
          aria-label="Monatstabelle"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to scroll the monthly table.
          tabIndex={0}
        >
          <table data-testid="whole-table">
            <thead>
              <tr>
                <th scope="col">Monat</th>
                {columns.map((c) => (
                  <th key={c.key} scope="col">
                    <Term>{c.label}</Term>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r) => (
                <tr key={r.month} className={r.month === 'Summe' ? 'whole-total' : ''}>
                  <th scope="row">{r.month === 'Summe' ? 'Summe' : monthLong(r.month)}</th>
                  {columns.map((c) => (
                    <td key={c.key} className={c.signed ? tone(Number(r[c.key])) : ''}>
                      {r.month !== 'Summe' ? (
                        <AppLink
                          to={c.report ? `/reports/${c.report}` : '/konten/buchungen'}
                          search={{
                            monat: r.month,
                            zeitraum: `${r.month}..${r.month}`,
                            ...(!c.report
                              ? { von: `${r.month}-01`, bis: lastDayOfMonth(r.month) }
                              : {}),
                          }}
                        >
                          {cellText(r, c, estimated(r))}
                        </AppLink>
                      ) : (
                        cellText(r, c, estimated(r))
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function WholeChart({ data }: { data: Data }) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const rows = data.rows;
  const left = 56,
    right = Math.max(left + 1, width - 12),
    slot = (right - left) / rows.length;
  const x = (i: number) => left + (i + 0.5) * slot;
  const upper = scaleLinear()
    .domain([
      Math.min(...rows.map((r) => r.endCents)),
      Math.max(...rows.map((r) => r.endCents)) + 1,
    ])
    .nice(3)
    .range([115, 18]);
  const y = scaleLinear()
    .domain([
      Math.min(0, ...rows.map((r) => Math.min(0, r.savedCents) + Math.min(0, r.marketCents))),
      Math.max(1, ...rows.map((r) => Math.max(0, r.savedCents) + Math.max(0, r.marketCents))),
    ])
    .nice(4)
    .range([310, 160]);
  return (
    <div ref={ref}>
      {width > 0 && (
        <ChartSvg
          width={width}
          height={340}
          label="Monatlicher Sparbetrag und Markteffekt mit Nettovermögen"
          testId="whole-chart"
          points={rows.map((row, i) => ({
            date: row.month,
            x: x(i),
            series: columns.map((c) => ({
              name: c.label,
              value: cellText(
                row,
                c,
                data.incomplete?.some(
                  (n) => n.from <= lastDayOfMonth(row.month) && n.to >= `${row.month}-01`,
                ) ?? false,
              ),
              color:
                c.key === 'marketCents'
                  ? row.marketCents < 0
                    ? 'var(--bad-ink)'
                    : 'var(--future)'
                  : 'var(--line)',
            })),
          }))}
        >
          <Graticule
            x1={left}
            x2={right}
            lines={upper
              .ticks(3)
              .map((value) => ({ y: upper(value), label: eur(value, { cents: false }) }))}
          />
          <text x={left} y={140} className="svg-label">
            Nettovermögen Ende · €
          </text>
          <Line points={rows.map((r, i) => [x(i), upper(r.endCents)])} kind="actual" />
          <Graticule
            x1={left}
            x2={right}
            lines={y
              .ticks(4)
              .map((value) => ({ y: y(value), label: (value / 100).toLocaleString('de-AT') }))}
          />
          <AxisLine x1={left} x2={right} y={y(0)} />
          {rows.map((r, i) => {
            let positive = 0,
              negative = 0;
            return (
              <g key={r.month}>
                {(['savedCents', 'marketCents'] as const).map((key) => {
                  const value = r[key],
                    start = value >= 0 ? positive : negative,
                    end = start + value;
                  if (value >= 0) positive = end;
                  else negative = end;
                  return (
                    <rect
                      key={key}
                      x={x(i) - Math.min(36, slot * 0.65) / 2}
                      y={Math.min(y(start), y(end))}
                      width={Math.min(36, slot * 0.65)}
                      height={Math.abs(y(start) - y(end))}
                      fill={
                        key === 'marketCents'
                          ? value < 0
                            ? 'var(--bad-ink)'
                            : 'var(--future)'
                          : value < 0
                            ? 'var(--red)'
                            : 'var(--line)'
                      }
                    />
                  );
                })}
              </g>
            );
          })}
          <XTicks
            y={330}
            ticks={rows
              .filter((_, i) => slot > 36 || i % Math.ceil(36 / slot) === 0)
              .map((r) => ({ x: x(rows.indexOf(r)), label: r.month.slice(2) }))}
          />
        </ChartSvg>
      )}
    </div>
  );
}
