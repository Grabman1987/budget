import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  return {
    count,
    label: count === undefined ? 'Prüfen, Anzahl noch nicht verfügbar' : `Prüfen, ${count} offen`,
  };
}
