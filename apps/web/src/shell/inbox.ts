import { useQuery } from '@tanstack/react-query';
import { inboxCountQuery } from '../inbox/api';

/** Unknown/loading/error never masquerades as an empty inbox. Shared query deduplicates headers. */
export function useInboxCount() {
  const query = useQuery(inboxCountQuery());
  const count = query.data?.count;
  return {
    count,
    label:
      count === undefined
        ? 'Posteingang, Anzahl noch nicht verfügbar'
        : `Posteingang, ${count} offen`,
  };
}
