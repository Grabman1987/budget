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
      <ol className="activity-terms">
        {items.map((item) => (
          <li className="activity-term" key={item.key}>
            <div>
              {item.bookingId && (
                <Button
                  variant="ghost"
                  aria-label={`Ursprungsbuchung öffnen · ${sourceLabel(item.source)} · ${item.date} · ${eur(item.contributionCents)}`}
                  onClick={() =>
                    setSourceOpen({ id: item.bookingId!, generation: ++generation.current })
                  }
                >
                  {sourceLabel(item.source)}
                </Button>
              )}
              <p>
                {item.kind === 'unfunded-card'
                  ? `Ungedeckte Kartenausgaben · ${month}`
                  : `${item.date ? longDay(item.date) : month} · ${item.source?.accountName ?? ''}`}
              </p>
              {item.source?.payeeName?.trim() && item.source.memo?.trim() && (
                <p>{item.source.memo}</p>
              )}
              {item.source && item.source.bookingAmountCents !== item.sourceAmountCents && (
                <p>
                  Buchung gesamt: {eur(item.source.bookingAmountCents)} · hier nur der zugehörige
                  Anteil
                </p>
              )}
              {item.kind === 'card-reserve' && <p>Kartenzahlungsreserve</p>}
              {item.kind === 'unfunded-card' && (
                <p>
                  Monatlicher Abzug: Dieser Teil der Kartenausgaben war in den Kategorien nicht
                  gedeckt. Keine zusätzliche Buchung.
                </p>
              )}
              {item.kind === 'card-reserve' && item.sourceAmountCents !== null && (
                <p>
                  Ursprünglicher Buchungsanteil: {eur(item.sourceAmountCents)}
                  {item.cardBalanceCoveredCents !== 0 &&
                    ` · davon aus positivem Kartenguthaben: ${eur(item.cardBalanceCoveredCents)}`}
                </p>
              )}
              {item.kind === 'unfunded-card' &&
                item.relatedCategories.map((category) => (
                  <p key={category.categoryId}>
                    {categories.find((c) => c.id === category.categoryId)?.name ?? 'Kategorie'}:{' '}
                    {eur(category.cents, { sign: true })}
                  </p>
                ))}
              {item.status && (
                <p>
                  {item.status === 'pending'
                    ? 'Vorgemerkt'
                    : item.status === 'reconciled'
                      ? 'Abgeglichen'
                      : 'Bestätigt'}
                </p>
              )}
            </div>
            <strong>{eur(item.contributionCents, { sign: true })}</strong>
          </li>
        ))}
      </ol>
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
