import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { INBOX_KEY, inboxQuery } from '../inbox/inbox-api';

const synced = new WeakSet<QueryClient>();

/**
 * Any write of the app can change the inbox (a booking gets a category, an overspend is covered):
 * every successful mutation refreshes it once, whichever page it came from.
 */
function refreshOnWrites(client: QueryClient) {
  if (synced.has(client)) return;
  synced.add(client);
  client.getMutationCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'success')
      void client.invalidateQueries({ queryKey: INBOX_KEY });
  });
}

/** Open items of the Posteingang for the counters (top bar, phone header, Konten register). */
export function useInboxCount(): number | undefined {
  const client = useQueryClient();
  useEffect(() => refreshOnWrites(client), [client]);
  return useQuery({ ...inboxQuery(), select: (data) => data.count }).data;
}
