import { ReportPeriodControl } from '../reports/period-quick-select';
import { isReportPeriod, cents, type Period } from '@budget/domain';
import { Button, DimensionChain } from '@budget/ui';
import { queryOptions, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import React from 'react';
import { request } from '../api/http';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { eur, longDay } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import { AppLink } from '../shell/app-link';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from './placeholder-page';
import './payee-analysis-report.css';

type ReportPeriod = Period;
interface PayeeReportRow {
  payeeId: string | null;
  name: string;
  amountCents: number;
  bookingCount: number;
  averageSpendCents: number;
  sharePercent: number | null;
  previousAmountCents: number | null;
  changeCents: number | null;
  categories: { id: string; name: string; amountCents: number }[];
}
interface PayeeReport {
  period: ReportPeriod;
  from: string | null;
  to: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  availableMonths: number;
  previousFrom: string | null;
  previousTo: string | null;
  previousAvailable: boolean;
  includedStatuses: string[];
  observedStatuses: string[];
  basis: string;
  totalSpendCents: number;
  topFiveCents: number;
  remainingCents: number;
  topFiveSharePercent: number | null;
  bookingCount: number;
  averageSpendCents: number | null;
  excludedUnclassifiedOutflowCents: number;
  rows: PayeeReportRow[];
}
interface DetailItem {
  booking: { id: string; date: string; payeeName: string | null; status: string };
  spendCents: number;
  categories: { id: string; name: string; spendCents: number }[];
}
interface DetailPage {
  items: DetailItem[];
  nextCursor: string | null;
  total: number;
}

const PERIODS: readonly ReportPeriod[] = ['1M', '3M', 'YTD', '1J', '3J', 'Alles'];
const reportQuery = (period: ReportPeriod) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'payee-analysis', period],
    retry: false,
    queryFn: () => request<PayeeReport>('GET', `/api/reports/payees?period=${period}`),
  });

function reportPeriod(value: unknown): ReportPeriod {
  return isReportPeriod(value) ? (value as ReportPeriod) : '1J';
}

function useReportPeriod(): [ReportPeriod, (value: ReportPeriod) => void] {
  const search = useSearch({ strict: false }) as { zeitraum?: unknown };
  const navigate = useNavigate();
  const period = reportPeriod(search.zeitraum);
  return [
    period,
    (value) =>
      void navigate({
        to: '.',
        search: ((previous: Record<string, unknown>) => ({
          ...previous,
          zeitraum: value as Period,
        })) as never,
        replace: true,
      }),
  ];
}

function share(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '–';
  const sign = value < 0 ? '−' : value > 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(Math.abs(value))} %`;
}

const statusName: Record<string, string> = {
  pending: 'vorgemerkt',
  confirmed: 'bestätigt',
  reconciled: 'geprüft',
};
const bookingDetailId = 'payee-booking-detail';

export function PayeeAnalysisReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  const [period, setPeriod] = useReportPeriod();
  const query = useQuery(reportQuery(period));
  const [selected, setSelected] = React.useState<string | null>(null);
  const data = !query.isFetching && query.isSuccess ? query.data : undefined;
  const range =
    data?.from && data.to
      ? `${longDay(data.from)} bis ${longDay(data.to)}`
      : 'keine geschlossenen Monate';

  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={query.isError ? 'nicht verfügbar' : data ? range : 'wird geladen'}
      reportStand={{
        label: 'Stichtag',
        value: data
          ? data.to
            ? `${longDay(data.to)} · Monatsende`
            : 'keine geschlossenen Monate'
          : query.isError
            ? 'nicht verfügbar'
            : 'wird geladen',
      }}
      extraFields={[
        {
          label: 'Zeitraum',
          value: (
            <ReportPeriodControl
              trend={false}
              label="Zeitraum"
              options={PERIODS.map((value) => ({ value, label: value }))}
              value={period}
              onChange={(value) => {
                setSelected(null);
                setPeriod(value as ReportPeriod);
              }}
              className="seg-period"
            />
          ),
        },
      ]}
    >
      <div className="kview vview payee-analysis-report">
        {query.isFetching && !query.isError && <LoadingNote what="Empfänger-Analyse" />}
        {query.isError && (
          <ErrorNote
            what="Empfänger-Analyse"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {data && !query.isFetching && !query.isError && (
          <ReportBody data={data} selected={selected} onSelect={setSelected} />
        )}
      </div>
    </PageFrame>
  );
}

function ReportBody({
  data,
  selected,
  onSelect,
}: {
  data: PayeeReport;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const maximum = Math.max(1, ...data.rows.slice(0, 14).map((row) => Math.abs(row.amountCents)));
  const detail = useInfiniteQuery({
    queryKey: [...LEDGER_KEY, 'payee-analysis-detail', selected, data.from, data.to],
    enabled: selected !== null && Boolean(data.from && data.to),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const selector = selected === 'none' ? 'ohne-empfaenger' : encodeURIComponent(selected ?? '');
      const search = new URLSearchParams({ from: data.from ?? '', to: data.to ?? '' });
      if (pageParam) search.set('cursor', pageParam);
      return request<DetailPage>(
        'GET',
        `/api/reports/payees/${selector}/bookings?${search.toString()}`,
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: false,
  });
  const selectedRow =
    selected === null
      ? null
      : (data.rows.find((row) => (row.payeeId ?? 'none') === selected) ?? null);
  const avg = data.averageSpendCents === null ? '–' : eur(data.averageSpendCents);

  return (
    <>
      <section className="payee-lead" aria-labelledby="payee-report-title">
        <div className="payee-section-head">
          <h2 id="payee-report-title">
            {data.rows.length} Empfänger · {data.period}
          </h2>
          <span className="payee-state">
            {data.bookingCount} Buchungen · Ø netto {avg}
          </span>
        </div>
        {data.from && data.to && (
          <p className="payee-period">
            {longDay(data.from)} bis {longDay(data.to)}
          </p>
        )}
        <div className="payee-total">
          <span>Nettoausgaben · Bedarf und Wunsch</span>
          <strong data-testid="payee-total">{eur(data.totalSpendCents)}</strong>
        </div>
        <DimensionChain
          label="Maßkette Empfängeranalyse · Nettoausgaben"
          precision="cent"
          terms={[
            { label: 'Top 5 Empfänger', value: cents(data.topFiveCents) },
            {
              label: `Übrige ${Math.max(0, data.rows.length - 5)}`,
              op: '+',
              value: cents(data.remainingCents),
            },
            { label: 'Nettoausgaben', op: '=', value: cents(data.totalSpendCents), result: true },
          ]}
        />
        <p className="payee-chain-note">
          Nettoanteil der Top 5: {share(data.topFiveSharePercent)}
          {data.totalSpendCents <= 0 && ' · bei nicht positiver Gesamtsumme nicht berechenbar'}
        </p>
        <h3 className="payee-chart-title">Empfänger nach Nettoausgaben</h3>
        {data.rows.length === 0 ? (
          <p role="status">
            In diesem Zeitraum gibt es keine Buchungen in den geeigneten Budgetkategorien.
          </p>
        ) : (
          <ol className="payee-bars" aria-label="Empfänger, nach Nettoausgaben sortiert">
            {data.rows.slice(0, 14).map((row) => (
              <li key={row.payeeId ?? 'none'}>
                <button
                  type="button"
                  className="payee-bar-name"
                  aria-expanded={(row.payeeId ?? 'none') === selected}
                  aria-controls={bookingDetailId}
                  onClick={() =>
                    onSelect((row.payeeId ?? 'none') === selected ? null : (row.payeeId ?? 'none'))
                  }
                >
                  {row.name}
                </button>
                <span className="payee-bar-track" aria-hidden="true">
                  <i
                    className={row.amountCents < 0 ? 'is-refund' : ''}
                    style={
                      {
                        '--bar-width': `${(Math.abs(row.amountCents) / maximum) * 50}%`,
                      } as React.CSSProperties
                    }
                  />
                </span>
                <strong>{eur(row.amountCents)}</strong>
              </li>
            ))}
          </ol>
        )}
        <p className="payee-legend">
          Balken nach rechts zeigen Nettoausgaben, Balken nach links Nettoerstattungen.
        </p>
      </section>

      <section className="payee-frequent" aria-labelledby="payee-frequent-title">
        <div className="payee-section-head">
          <h2 id="payee-frequent-title">Häufige Empfänger</h2>
        </div>
        <table className="payee-compact-table">
          <thead>
            <tr>
              <th scope="col">Empfänger</th>
              <th scope="col">Buchungen</th>
              <th scope="col">Ø netto</th>
            </tr>
          </thead>
          <tbody>
            {[...data.rows]
              .sort((a, b) => b.bookingCount - a.bookingCount || b.amountCents - a.amountCents)
              .slice(0, 8)
              .map((row) => (
                <tr key={row.payeeId ?? 'none'}>
                  <th scope="row">{row.name}</th>
                  <td>{row.bookingCount}</td>
                  <td>{eur(row.averageSpendCents)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <p className="payee-note">
          Erstattungen mindern die Aktivitäten des Empfängers, bei dem sie gebucht wurden. Es wird
          keine ursprüngliche Ausgabe zugeordnet.
        </p>
      </section>

      <section className="payee-detail" aria-labelledby="payee-detail-title">
        <div className="payee-section-head">
          <h2 id="payee-detail-title">Alle Empfänger</h2>
          <span>{data.rows.length} Empfänger</span>
        </div>
        <div
          className="payee-scroll"
          role="region"
          aria-label="Empfängerübersicht, seitlich scrollbar"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the complete recipient table.
          tabIndex={0}
        >
          <table className="payee-table">
            <caption className="sr-only">
              Nettoausgaben, Buchungen und Vergleich je Empfänger
            </caption>
            <thead>
              <tr>
                <th scope="col">Empfänger</th>
                <th scope="col">Kategorien</th>
                <th scope="col">Buchungen</th>
                <th scope="col">Ø netto</th>
                <th scope="col">Summe netto</th>
                <th scope="col">Nettoanteil</th>
                <th scope="col">Änderung zur Vorperiode</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr
                  key={row.payeeId ?? 'none'}
                  className={(row.payeeId ?? 'none') === selected ? 'is-selected' : ''}
                >
                  <th scope="row">
                    <button
                      type="button"
                      className="payee-row-button"
                      aria-expanded={(row.payeeId ?? 'none') === selected}
                      aria-controls={bookingDetailId}
                      onClick={() =>
                        onSelect(
                          (row.payeeId ?? 'none') === selected ? null : (row.payeeId ?? 'none'),
                        )
                      }
                    >
                      {row.name}
                    </button>
                  </th>
                  <td>{row.categories.map((category) => category.name).join(', ') || '–'}</td>
                  <td className="numeric">{row.bookingCount}</td>
                  <td className="numeric">{eur(row.averageSpendCents)}</td>
                  <td className="numeric">
                    <strong>{eur(row.amountCents)}</strong>
                  </td>
                  <td className="numeric">{share(row.sharePercent)}</td>
                  <td className="numeric">
                    {row.previousAmountCents === null ? '–' : eur(row.changeCents ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.previousAvailable ? (
          <p className="payee-note">
            Veränderung zur gleich langen Vorperiode (
            {data.previousFrom && data.previousTo
              ? `${longDay(data.previousFrom)} bis ${longDay(data.previousTo)}`
              : ''}
            ). Positive oder negative Werte zeigen den gebuchten Netto-Unterschied.
          </p>
        ) : (
          <p className="payee-note">
            Für die gleich lange Vorperiode liegen nicht genügend geschlossene Quelldaten vor.
          </p>
        )}
        <div
          className="payee-drilldown"
          id={bookingDetailId}
          aria-labelledby={`${bookingDetailId}-heading`}
          aria-live="polite"
          hidden={!selectedRow}
        >
          <div className="payee-section-head">
            <h3 id={`${bookingDetailId}-heading`}>
              {selectedRow ? `Buchungen · ${selectedRow.name}` : 'Buchungen'}
            </h3>
            <button type="button" className="payee-close" onClick={() => onSelect(null)}>
              Schließen
            </button>
          </div>
          {selectedRow && (
            <>
              {detail.isFetching && !detail.isError && <LoadingNote what="Buchungen" />}
              {detail.isError && (
                <ErrorNote
                  what="Buchungen"
                  error={detail.error}
                  onRetry={() =>
                    void (detail.isFetchNextPageError ? detail.fetchNextPage() : detail.refetch())
                  }
                />
              )}
              {detail.data && !detail.isFetching && !detail.isError && (
                <>
                  <p className="payee-note">
                    {detail.data.pages[0]?.total ?? 0} passende Buchungen · seitlich scrollbar
                  </p>
                  <div
                    className="payee-scroll"
                    role="region"
                    aria-label="Buchungen dieses Empfängers, seitlich scrollbar"
                    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the complete booking table.
                    tabIndex={0}
                  >
                    <table className="payee-table payee-bookings">
                      <thead>
                        <tr>
                          <th scope="col">Datum</th>
                          <th scope="col">Buchung</th>
                          <th scope="col">Kategorien</th>
                          <th scope="col">Status</th>
                          <th scope="col">Netto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.data.pages
                          .flatMap((page) => page.items)
                          .map((item) => (
                            <tr key={item.booking.id}>
                              <td>{longDay(item.booking.date)}</td>
                              <th scope="row">
                                <AppLink
                                  to="/konten/buchungen"
                                  search={{ buchung: item.booking.id }}
                                >
                                  {item.booking.payeeName ?? 'Ohne Empfänger'}
                                </AppLink>
                              </th>
                              <td>
                                {item.categories
                                  .map((category) => `${category.name} ${eur(category.spendCents)}`)
                                  .join(' · ') || '–'}
                              </td>
                              <td>{statusName[item.booking.status] ?? item.booking.status}</td>
                              <td className="numeric">
                                <strong>{eur(item.spendCents)}</strong>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {detail.hasNextPage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void detail.fetchNextPage()}
                      disabled={detail.isFetchingNextPage}
                    >
                      Weitere Buchungen laden
                    </Button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </section>

      <p className="payee-scope">
        Berücksichtigt sind Bedarf- und Wunschkategorien auf Budgetkonten; Zukunft, interne
        Umbuchungen, Einnahmen- und Kartenzahlungskategorien sowie Auslagen-Durchlaufkategorien
        gehören nicht zu dieser Summe. Unzugeordnete Auszahlungen im Zeitraum:{' '}
        <strong>{eur(data.excludedUnclassifiedOutflowCents)}</strong>. Vorgemerkte, bestätigte und
        geprüfte Buchungen sind enthalten (
        {data.observedStatuses.map((status) => statusName[status] ?? status).join(', ') || 'keine'}
        ). Nettoerstattungen bleiben dem gebuchten Empfänger zugeordnet. Buchungen ohne Namen stehen
        als „Ohne Empfänger“ in der Übersicht.
      </p>
    </>
  );
}
