import { inboxWarns, DEFAULT_INBOX_WARN_AGE_DAYS, DEFAULT_INBOX_WARN_COUNT } from '@budget/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { eur } from '../ledger/format';
import { inboxCountQuery, syncInboxCount, useInboxQueueTotal } from '../inbox/api';

/**
 * Unknown/loading/error never masquerades as an empty inbox. Shared query deduplicates headers.
 * While the Prüfen parts are mounted the header shows their total, so it can never disagree with
 * them (not after a write, not when re-reading fails); otherwise the cheap count query answers.
 */
export function useInboxCount() {
  syncInboxCount(useQueryClient());
  const query = useQuery(inboxCountQuery());
  const queueTotal = useInboxQueueTotal();
  const count = queueTotal ?? query.data?.count;
  const data = query.data;
  const thresholds = data?.thresholds ?? {
    ageDays: DEFAULT_INBOX_WARN_AGE_DAYS,
    count: DEFAULT_INBOX_WARN_COUNT,
  };
  const overAgeCount = data?.overAgeCount ?? 0;
  const openCents = data?.openUncategorizedCents ?? 0;
  const warning =
    count !== undefined && inboxWarns({ count, overAgeCount }, thresholds)
      ? [
          overAgeCount > 0
            ? `${overAgeCount} ${overAgeCount === 1 ? 'Buchung' : 'Buchungen'} älter als ${thresholds.ageDays} Tage`
            : `${count} offen, mehr als ${thresholds.count}`,
          ...(openCents !== 0 ? [`${eur(openCents, { sign: true })} ohne Kategorie`] : []),
        ].join(' · ')
      : null;
  return {
    count,
    /** Calm warning text when a threshold is passed, otherwise null (neutral). */
    warning,
    /** Open uncategorised amount in cents (0 when none or unknown). */
    openUncategorizedCents: openCents,
    label: count === undefined ? 'Prüfen, Anzahl noch nicht verfügbar' : `Prüfen, ${count} offen`,
  };
}
