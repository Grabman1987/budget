import { Button, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { ApiError } from '../api/http';
import { longDay, nativeCurrency } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import type { BudgetUncategorizedPage } from './budget-api';

/** Read-only origins; editing continues through the existing ledger route and guarded editor. */
export function PlanUncategorizedRows({
  month,
  pages,
  pending,
  error,
  hasMore,
  loadingMore,
  onMore,
  onReload,
}: {
  month: string;
  pages: BudgetUncategorizedPage[];
  pending: boolean;
  error: Error | null;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  onReload: () => void;
}) {
  useAmountPrivacy();
  const stale = error instanceof ApiError && error.status === 409;
  const items = stale ? [] : pages.flatMap((page) => page.items);
  return (
    <section className="plan-uncategorized" aria-label="Buchungen ohne Kategorie">
      {pending && <LoadingNote what="Buchungen ohne Kategorie" />}
      {stale && <p role="status">Der Plan hat sich geändert. Bitte die Buchungen neu laden.</p>}
      {error && <ErrorNote what="Buchungen ohne Kategorie" error={error} onRetry={onReload} />}
      {!error && pages[0]?.total === 0 && <p>Keine Buchung ohne Kategorie in diesem Monat.</p>}
      {items.length > 0 && (
        <table>
          <caption className="sr-only">Buchungen ohne Kategorie · gesamter Zahlungsbetrag</caption>
          <thead>
            <tr>
              <th scope="col">Datum · Buchung</th>
              <th scope="col">Zahlungsbetrag</th>
            </tr>
          </thead>
          <tbody>
            {items.map((booking) => (
              <tr key={booking.id}>
                <td>
                  <AppLink
                    to="/konten/buchungen"
                    search={{ buchung: booking.id, monat: month }}
                  >
                    {maskMoneyText(
                      booking.payeeName?.trim() || booking.memo?.trim() || 'Buchung ohne Zahlungspartner',
                    )}
                  </AppLink>
                  <small>{longDay(booking.date)} · {maskMoneyText(booking.accountName)}</small>
                </td>
                <td>{nativeCurrency(booking.amountCents, booking.currency, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hasMore && (
        <Button variant="ghost" disabled={loadingMore || Boolean(error)} onClick={onMore}>
          {loadingMore ? 'Wird geladen …' : 'Weitere Buchungen'}
        </Button>
      )}
    </section>
  );
}
