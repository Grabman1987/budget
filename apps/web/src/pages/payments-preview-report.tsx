import { ChartSvg } from '@budget/ui';
import { chartPoints } from '../charts/tooltip-data';
import {
  useAmountPrivacy,
  privateAmount,
  ClassSwatch,
  DimensionChain,
  type SwatchKind,
} from '@budget/ui';
import {
  cents,
  formatDecimal,
  type PaymentsPreview,
  type PreviewAmount,
  type PreviewCurrency,
} from '@budget/domain';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { longDay, monthName } from '../ledger/format';
import { useElementWidth } from '../charts/use-element-width';
import { AppLink } from '../shell/app-link';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from './placeholder-page';
import './payments-preview-report.css';

/** Expected edits/versions/undo use useBudgetWrite, invalidating EXPECTED_KEY and LEDGER_KEY.
 * Booking, account and market writes/undo also invalidate LEDGER_KEY. */
export const paymentsPreviewQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'payments-year-preview'],
    retry: false,
    queryFn: () => request<PaymentsPreview>('GET', '/api/expected/year-preview'),
  });
const money = (value: number, currency: string) =>
  `${privateAmount(formatDecimal(cents(value)))} ${currency === 'EUR' ? '€' : currency}`;
const amount = (value: PreviewAmount | null, currency: string | null) => {
  if (!value || !currency) return 'nicht verfügbar';
  const base = money(value.baseCents, currency);
  return value.upperCents === value.baseCents
    ? base
    : `${base} bis ${money(value.upperCents, currency)}`;
};
const calendarAmount = (value: PreviewAmount | null) => {
  if (!value) return 'nicht verfügbar';
  const number = (c: number) => privateAmount(formatDecimal(cents(c)));
  return value.baseCents === value.upperCents
    ? number(value.baseCents)
    : `${number(value.baseCents)} bis ${number(value.upperCents)}`;
};
const month = (key: string) => `${monthName(`${key}-01`)} ${key.slice(0, 4)}`;
const shortMonth = (key: string) => `${monthName(`${key}-01`).slice(0, 3)} ${key.slice(2, 4)}`;
const CLASSES: Record<string, string> = { need: 'Bedarf', want: 'Wunsch', future: 'Zukunft' };
const STATUS = {
  expected: 'Erwartet',
  received: 'Verknüpft',
  deviating: 'Abweichend',
  missed: 'Ausgefallen',
};

export function PaymentsPreviewReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const query = useQuery(paymentsPreviewQuery());
  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      standDay={query.data?.asOf}
      reportDataBasis="Gespeicherte erwartete Zahlungen"
      extraFields={[{ label: 'Horizont', value: '12 volle Folgemonate' }]}
    >
      <div className="kview vview payments-preview-report">
        {query.isPending && <LoadingNote what="Erwartete Zahlungen" />}
        {query.isError && (
          <ErrorNote
            what="Erwartete Zahlungen"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {query.data && !query.isError && <PreviewBody data={query.data} />}
      </div>
    </PageFrame>
  );
}
function PreviewBody({ data }: { data: PaymentsPreview }) {
  useAmountPrivacy();
  const eur = data.currencies.find((g) => g.currency === 'EUR')!;
  return (
    <>
      <section aria-labelledby="preview-title">
        <div className="preview-head">
          <h2 id="preview-title">
            {month(data.months[0]!)} bis {month(data.months[11]!)}
          </h2>
          {eur.highestMonth && (
            <span>
              Teuerster Monat{data.eurComplete ? '' : ' im EUR-Anteil'}: {month(eur.highestMonth)} ·
              Basisbetrag
            </span>
          )}
        </div>
        <div className="preview-lead">
          <span>
            {data.eurComplete
              ? 'Vertragsprojektion · 12 Monate'
              : 'Bekannter EUR-Teilbetrag · 12 Monate'}
          </span>
          <strong data-testid="preview-total">{amount(eur.total, 'EUR')}</strong>
        </div>
        <DimensionChain
          label="Maßkette Jahresvorschau · EUR-Basisbeträge"
          precision="cent"
          terms={[
            {
              label: 'Fix und Zukunft',
              value: cents(eur.total.baseCents - eur.periodicTotal.baseCents),
            },
            { label: 'Periodisch', op: '+', value: cents(eur.periodicTotal.baseCents) },
            {
              label: data.eurComplete ? '12 Monate · Basis' : 'EUR-Anteil · Basis',
              op: '=',
              value: cents(eur.total.baseCents),
              result: true,
            },
          ]}
        />
        <p className="preview-average">
          Ø je Monat: {amount(eur.average, 'EUR')}
          {!data.eurComplete && ' · EUR-Anteil'}
        </p>
        <p className="vnote">
          Vorschau aus gespeicherten erwarteten Auszahlungen mit ihren gültigen Betragsversionen.
          Eigenständige Sparpläne, weitere künftige Umbuchungen und Kategorieziele sind hier noch
          nicht enthalten.
        </p>
        {!data.eurComplete && (
          <p className="preview-incomplete" role="status">
            Gesamtsumme in EUR nicht verfügbar. Fremdwährungen bleiben getrennt; es wird kein
            zukünftiger Wechselkurs angenommen.
            {data.unavailableCount > 0 &&
              ` ${data.unavailableCount} Termine ohne gültig zuordenbaren Vertragsbetrag.`}
          </p>
        )}
        {data.rows.length === 0 ? (
          <p role="status">Keine gespeicherten erwarteten Auszahlungen in diesen zwölf Monaten.</p>
        ) : (
          <PreviewChart data={data} group={eur} />
        )}
        <p className="preview-legend">
          <span className="preview-swatch" />
          Fix und Zukunft <span className="preview-swatch periodic" />
          Periodisch <span className="preview-dash" />Ø Basisbetrag · Kontur bis zum Oberbetrag
        </p>
      </section>
      <section aria-labelledby="preview-calendar">
        <h2 id="preview-calendar">Zahlungskalender</h2>
        <p className="vnote" id="preview-scroll-note">
          Zwölf volle Folgemonate · Beträge in der Währung der Zeile. Bereiche zeigen Basis- bis
          Oberbetrag. Die Tabelle lässt sich seitlich scrollen.
        </p>
        <div
          className="preview-scroll"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll all twelve months.
          tabIndex={0}
          role="region"
          aria-label="Zahlungskalender, seitlich scrollbar"
          aria-describedby="preview-scroll-note"
        >
          <table className="preview-table">
            <caption className="sr-only">
              Versionierte Vertragsprojektion je Zahlung und Monat
            </caption>
            <thead>
              <tr>
                <th scope="col">Zahlung</th>
                {data.months.map((m) => (
                  <th scope="col" key={m}>
                    <abbr title={month(m)}>{shortMonth(m)}</abbr>
                  </th>
                ))}
                <th scope="col">Summe</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr
                  key={`${row.paymentId}:${row.currency}`}
                  className={row.periodic ? 'is-periodic' : ''}
                >
                  <th scope="row">
                    {row.categoryClass && <ClassSwatch kind={row.categoryClass as SwatchKind} />}{' '}
                    {row.name}
                    <small>
                      {CLASSES[row.categoryClass ?? ''] ?? 'Unzugeordnet'} ·{' '}
                      {row.categoryName ?? 'ohne Kategorie'}
                      {row.periodic ? ' · Periodisch' : ''} ·{' '}
                      {row.currency ?? 'Betrag nicht zuordenbar'}
                    </small>
                  </th>
                  {row.months.map((a, i) => (
                    <td key={i}>{a && a.upperCents === 0 ? '·' : calendarAmount(a)}</td>
                  ))}
                  <td>
                    <strong>{calendarAmount(row.total)}</strong>
                  </td>
                </tr>
              ))}
              {data.currencies.map((g) => (
                <tr className="preview-sum" key={g.currency}>
                  <th scope="row">
                    {data.eurComplete ? 'Summe' : 'Teilbetrag'} {g.currency}
                  </th>
                  {g.months.map((a, i) => (
                    <td key={i}>{calendarAmount(a)}</td>
                  ))}
                  <td>
                    <strong>{calendarAmount(g.total)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="preview-dates">
        <h2 id="preview-dates">Fälligkeiten und Verknüpfungen</h2>
        <p className="vnote">
          Die Kalenderbeträge sind Vertragsprojektionen. Verknüpfte Buchungen stehen getrennt und
          zählen nicht zusätzlich. Gespeicherte Erwartungen haben keine eigene Währungsangabe; ihr
          früherer Betrag ist deshalb nicht sicher zuordenbar.
        </p>
        <div className="preview-events">
          {data.rows.map((row) => (
            <details key={`${row.paymentId}:${row.currency}`}>
              <summary>
                {row.name} · {row.currency ?? 'nicht verfügbar'} · {row.events.length} Termine
              </summary>
              <table>
                <caption className="sr-only">Fälligkeiten für {row.name}</caption>
                <thead>
                  <tr>
                    <th scope="col">Fällig</th>
                    <th scope="col">Vertrag</th>
                    <th scope="col">Status / Buchung</th>
                  </tr>
                </thead>
                <tbody>
                  {row.events.map((e) => (
                    <tr key={e.dueDate}>
                      <th scope="row">{longDay(e.dueDate)}</th>
                      <td>{amount(e.contract, e.currency)}</td>
                      <td>
                        {e.stored ? STATUS[e.stored.status] : 'Erwartet · projiziert'}
                        {e.stored?.bookingId && (
                          <span>
                            {' '}
                            ·{' '}
                            {e.stored.bookedAmountCents !== null && e.stored.bookedCurrency
                              ? money(e.stored.bookedAmountCents, e.stored.bookedCurrency)
                              : 'Buchungsbetrag nicht verfügbar'}
                          </span>
                        )}
                        {e.stored && (
                          <small>
                            Gespeicherter Erwartungsbetrag: Währung nicht sicher zuordenbar
                          </small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
        </div>
      </section>
      <p>
        <AppLink to="/plan/erwartet">Erwartete Zahlungen öffnen</AppLink>
      </p>
    </>
  );
}
function PreviewChart({ data, group }: { data: PaymentsPreview; group: PreviewCurrency }) {
  useAmountPrivacy();
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const width = measured || 1000;
  const small = width < 600;
  const left = small ? 52 : 75;
  const right = width - 12;
  const step = (right - left) / 12;
  const barWidth = step * 0.56;
  const max = Math.max(1, ...group.months.map((m) => m.upperCents));
  const y = (c: number) => 232 - (c / max) * 175;
  return (
    <div ref={ref}>
      <ChartSvg
        className="preview-chart"
        width={width}
        height={280}
        label={`Erwartete Zahlungen je Monat · EUR${!data.eurComplete ? '-Anteil' : ''}`}
        points={chartPoints(data.months, (i) => left + step * (i + 0.5), [
          {
            name: 'Laufend',
            values: group.months.map((m, i) => m.baseCents - group.periodicMonths[i]!.baseCents),
          },
          {
            name: 'Periodisch',
            values: group.periodicMonths.map((m) => m.baseCents),
            color: 'var(--line-2)',
          },
          {
            name: 'Oberbetrag',
            values: group.months.map((m) => m.upperCents),
            color: 'var(--line-2)',
          },
          {
            name: 'Durchschnitt',
            values: group.months.map(() => group.average.baseCents),
            color: 'var(--line-2)',
          },
        ])}
      >
        <title id="preview-chart-title">
          Erwartete Zahlungen je Monat · EUR{!data.eurComplete && '-Anteil'}
        </title>
        <desc id="preview-chart-desc">
          Basisbeträge gestapelt, Periodisch mit gebundenem Geld schraffiert. Gestrichelte Kontur
          bis zum Oberbetrag. Genaue Werte stehen im Zahlungskalender.
        </desc>
        <defs>
          <pattern id="preview-bound" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M-1 1L1 -1M0 6L6 0M5 7L7 5" stroke="var(--line-2)" strokeWidth="1" />
          </pattern>
        </defs>
        {[0, 0.5, 1].map((part) => (
          <g key={part}>
            <line
              x1={left}
              x2={right}
              y1={y(max * part)}
              y2={y(max * part)}
              className="preview-grid"
            />
            <text x={left - 8} y={y(max * part) + 4} textAnchor="end">
              {privateAmount(String(Math.round((max * part) / 100)))} €
            </text>
          </g>
        ))}
        <line
          x1={left}
          x2={right}
          y1={y(group.average.baseCents)}
          y2={y(group.average.baseCents)}
          className="preview-plan"
        />
        {group.months.map((a, i) => {
          const x = left + step * (i + 0.5);
          const per = group.periodicMonths[i]!.baseCents;
          return (
            <g key={data.months[i]}>
              <title>
                {month(data.months[i]!)}: {amount(a, 'EUR')}, davon periodisch{' '}
                {amount(group.periodicMonths[i]!, 'EUR')}
              </title>
              <rect
                x={x - barWidth / 2}
                y={y(a.baseCents - per)}
                width={barWidth}
                height={y(0) - y(a.baseCents - per)}
                className="preview-bar"
              />
              {per > 0 && (
                <rect
                  x={x - barWidth / 2}
                  y={y(a.baseCents)}
                  width={barWidth}
                  height={y(a.baseCents - per) - y(a.baseCents)}
                  fill="url(#preview-bound)"
                  stroke="var(--line-2)"
                />
              )}
              {a.upperCents > a.baseCents && (
                <rect
                  x={x - barWidth / 2}
                  y={y(a.upperCents)}
                  width={barWidth}
                  height={y(a.baseCents) - y(a.upperCents)}
                  className="preview-plan preview-range"
                />
              )}
              {(!small || data.months[i] === group.highestMonth) && (
                <text x={x} y={y(a.upperCents) - 9} textAnchor="middle">
                  {Math.round(a.baseCents / 100)}
                </text>
              )}
              {(!small || i % 2 === 0) && (
                <text x={x} y="259" textAnchor="middle">
                  {small
                    ? monthName(`${data.months[i]}-01`).slice(0, 3)
                    : shortMonth(data.months[i]!)}
                </text>
              )}
            </g>
          );
        })}
      </ChartSvg>
    </div>
  );
}
