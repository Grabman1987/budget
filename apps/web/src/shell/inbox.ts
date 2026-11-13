import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { inboxCountQuery, syncInboxCount, useInboxRefreshing } from '../inbox/api';

/**
 * Unknown/loading/error never masquerades as an empty inbox. Shared query deduplicates headers.
 * While a write is being re-read the previous number is withheld (same marker as "loading"), so the
 * header never disagrees with the parts of Prüfen, which arrive with the queue.
 */
export function useInboxCount() {
  const client = useQueryClient();
  useEffect(() => syncInboxCount(client), [client]);
  const query = useQuery(inboxCountQuery());
  const refreshing = useInboxRefreshing();
  const count = refreshing ? undefined : query.data?.count;
  return {
    count,
    refreshing,
    label:
      query.data?.count !== undefined && refreshing
        ? 'Prüfen, wird aktualisiert'
        : count === undefined
          ? 'Prüfen, Anzahl noch nicht verfügbar'
          : `Prüfen, ${count} offen`,
  };
}
