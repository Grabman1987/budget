import { Button, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { LEDGER_KEY } from '../ledger/queries';
import { request } from '../api/http';
import { BookingPanel } from '../ledger/booking-panel';
import { eur, longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { ListedBooking } from '../ledger/types';
import type { BudgetActivityPage } from './budget-api';

const sourceLabel = (source: BudgetActivityPage['activityBreakdown']['items'][number]['source']) =>
  source?.payeeName?.trim() || source?.memo?.trim() || 'Buchung ohne Zahlungspartner';

const statusLabel = (item: BudgetActivityPage['activityBreakdown']['items'][number]) =>
  item.kind === 'unfunded-card'
    ? 'Abgeleitet'
    : item.status === null
      ? '—'
      : item.status === 'pending'
        ? 'Vorgemerkt'
        : item.status === 'reconciled'
          ? 'Abgeglichen'
          : 'Bestätigt';

/** Every row is an actual accumulator term. Opening an origin performs only the existing GET. */
export function ActivityContributions({
  month,
  pages,
  categories,
  error,
  hasMore,
  loadingMore,
  onMore,
  onReload,
}: {
  month: string;
  pages: Array<Pick<BudgetActivityPage, 'activityBreakdown'>>;
  categories: { id: string; name: string }[];
  error: Error | null;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  onReload: () => void;
}) {
  useAmountPrivacy();
  const [sourceOpen, setSourceOpen] = useState<{ id: string; generation: number } | null>(null);
  const generation = useRef(0);
  const sourceId = sourceOpen?.id ?? null;
  const source = useQuery({
    queryKey: [...LEDGER_KEY, 'activity-source', sourceId, sourceOpen?.generation],
    gcTime: 0,
    enabled: sourceId !== null,
    queryFn: () =>
      request<{ booking: ListedBooking }>('GET', `/api/bookings/${encodeURIComponent(sourceId!)}`),
  });
  const first = pages[0]?.activityBreakdown;
  const items = pages.flatMap((page) => page.activityBreakdown.items);
  return (
    <section aria-labelledby="activity-title">
      <h3 id="activity-title">Aktivität im Detail</h3>
      {first && (
        <p>
          Aktivität gesamt: <strong>{eur(first.totalCents)}</strong> · {first.count}{' '}
          {first.count === 1 ? 'Eintrag' : 'Einträge'}
        </p>
      )}
      {first?.count === 0 && <p role="status">Keine Aktivität in diesem Monat.</p>}
      <table className="activity-table activity-terms">
        <caption className="sr-only">Kategoriebeiträge · {month}</caption>
        <thead>
          <tr>
            <th scope="col" className="activity-date">
              Datum
            </th>
            <th scope="col">Buchung / Empfänger</th>
            <th scope="col" className="activity-account">
              Konto
            </th>
            <th scope="col" className="activity-status">
              Status
            </th>
            <th scope="col" className="activity-amount">
              Anteil dieser Kategorie
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr className="activity-term" key={item.key}>
              <td className="activity-date">
                {item.date ? <time dateTime={item.date}>{longDay(item.date)}</time> : month}
              </td>
              <td className="activity-description">
                {item.bookingId && (
                  <Button
                    variant="ghost"
                    className="activity-source-button"
                    aria-label={`Ursprungsbuchung öffnen · ${sourceLabel(item.source)} · ${item.date} · ${eur(item.contributionCents)}`}
                    onClick={() =>
                      setSourceOpen({ id: item.bookingId!, generation: ++generation.current })
                    }
                  >
                    {sourceLabel(item.source)}
                  </Button>
                )}
                {item.kind === 'unfunded-card' && <span>Ungedeckte Kartenausgaben · {month}</span>}
                {item.source?.payeeName?.trim() && item.source.memo?.trim() && (
                  <span className="activity-note" title={item.source.memo}>
                    {item.source.memo}
                  </span>
                )}
                <span className="activity-mobile-meta">
                  <span className="activity-mobile-date">
                    <span className="sr-only">{item.date ? 'Datum: ' : 'Monat: '}</span>
                    {item.date ? <time dateTime={item.date}>{longDay(item.date)}</time> : month}
                  </span>
                  {' · '}
                  {statusLabel(item)}
                  <span className="activity-mobile-account">
                    <span className="sr-only">Konto: </span>
                    {item.source?.accountName ?? '—'}
                  </span>
                </span>
                {item.source && item.source.bookingAmountCents !== item.sourceAmountCents && (
                  <small className="activity-detail">
                    Buchung gesamt: {eur(item.source.bookingAmountCents)}
                  </small>
                )}
                {item.kind === 'card-reserve' && (
                  <small className="activity-detail">Kartenzahlungsreserve</small>
                )}
                {item.kind === 'unfunded-card' && (
                  <small className="activity-detail">
                    Monatlicher Abzug: Dieser Teil der Kartenausgaben war in den Kategorien nicht
                    gedeckt. Keine zusätzliche Buchung.
                  </small>
                )}
                {item.kind === 'card-reserve' && item.sourceAmountCents !== null && (
                  <small className="activity-detail">
                    Ursprünglicher Buchungsanteil: {eur(item.sourceAmountCents)}
                    {item.cardBalanceCoveredCents !== 0 &&
                      ` · davon aus positivem Kartenguthaben: ${eur(item.cardBalanceCoveredCents)}`}
                  </small>
                )}
                {item.kind === 'unfunded-card' &&
                  item.relatedCategories.map((category) => (
                    <small className="activity-detail" key={category.categoryId}>
                      {categories.find((c) => c.id === category.categoryId)?.name ?? 'Kategorie'}:{' '}
                      {eur(category.cents, { sign: true })}
                    </small>
                  ))}
              </td>
              <td className="activity-account">{item.source?.accountName ?? '—'}</td>
              <td className="activity-status">{statusLabel(item)}</td>
              <td className="activity-amount">
                <strong>{eur(item.contributionCents, { sign: true })}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <ErrorNote what="Aktivität" error={error} onRetry={onReload} />}
      {hasMore && (
        <Button variant="ghost" disabled={loadingMore} onClick={onMore}>
          {loadingMore ? 'Wird geladen …' : 'Weitere Beiträge laden'}
        </Button>
      )}
      {sourceId && source.isPending && <LoadingNote what="Ursprungsbuchung" />}
      {sourceId && source.isError && (
        <ErrorNote
          what="Ursprungsbuchung"
          error={source.error}
          onRetry={() => void source.refetch()}
        />
      )}
      <BookingPanel
        state={sourceId && source.data ? { mode: 'edit', booking: source.data.booking } : null}
        onClose={() => setSourceOpen(null)}
      />
    </section>
  );
}
