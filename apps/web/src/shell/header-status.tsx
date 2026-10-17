import { overspentEnvelopes, todayInVienna } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { budgetQuery } from '../budget/budget-api';
import { planRows } from '../budget/plan-model';
import { InboxHeaderLink } from '../inbox/navigation';
import { useBookingQueue } from '../pwa/queue-ui';
import { AppLink } from './app-link';
import { useInboxCount } from './inbox';

/** Counts only: amounts and cover actions stay in Heute and Plan. */
export function MobileStatusLine() {
  const inbox = useInboxCount();
  const month = todayInVienna().slice(0, 7);
  const budget = useQuery(budgetQuery(month));
  const overspent =
    !budget.isError && budget.data
      ? overspentEnvelopes({ envelopes: planRows(budget.data) }).length
      : 0;
  const review = inbox.count === undefined || inbox.count > 0;
  const plan = overspent > 0 || budget.isError;
  if (!review && !plan) return null;
  return (
    <nav className="m-status" aria-label="Offene Aufgaben">
      {review && (
        <InboxHeaderLink>
          {inbox.count === undefined
            ? 'Prüfen: Anzahl nicht verfügbar'
            : `${inbox.count} zu prüfen`}
        </InboxHeaderLink>
      )}
      {review && plan && <span aria-hidden="true">·</span>}
      {plan && (
        <AppLink to="/plan/monat" search={{ monat: month, ansicht: 'triage' }}>
          {budget.isError ? 'Budgetstatus nicht verfügbar – Plan prüfen' : `${overspent} überzogen`}
        </AppLink>
      )}
    </nav>
  );
}

/** A separate neutral status, never part of the review count or navigation badges. */
export function OfflineStatus() {
  const { items } = useBookingQueue();
  return items.length ? (
    <div className="shell-status" role="status">
      <span className="offline-chip">{items.length} offline gespeichert</span>
    </div>
  ) : null;
}
