import { QueryClient, queryOptions, useQuery } from '@tanstack/react-query';
import { onApiWrite, shouldRetry } from '../api/http';
import { invalidationPredicate } from '../api/invalidation';
import { fetchAuthStatus } from './api';

// A page that was read a moment ago is not read again on every remount, route change or window
// focus: the server derives some answers in seconds, and the Node process answers one request at a
// time, so a refetch storm makes every page wait. Writes invalidate the affected keys explicitly.
export const DEFAULT_STALE_MS = 20_000;
export { HEAVY_READ_STALE_MS } from '../api/stale-times';
/** One query client for the whole app (also used by the router guards). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      staleTime: DEFAULT_STALE_MS,
      // Coming back to the window still reads again (the pages show a loading state then); the
      // stale time only spares remounts and route changes. The heavy read models opt out with their
      // own HEAVY_READ_STALE_MS (refetchOnWindowFocus: true = only when stale).
      refetchOnWindowFocus: 'always',
    },
  },
});
// A successful write makes the affected query families stale (without refetching what is on
// screen: the writer refetches what it knows it changed). Unknown paths invalidate everything.
onApiWrite((path) => {
  const predicate = invalidationPredicate(path);
  void queryClient.invalidateQueries({ refetchType: 'none', ...(predicate ? { predicate } : {}) });
});

export const AUTH_STATUS_KEY = ['auth', 'status'] as const;
export const PASSKEYS_KEY = ['auth', 'passkeys'] as const;

/**
 * Session status. The router guards read it on every navigation, so it stays fresh for a few
 * seconds only; login, logout and registration invalidate it explicitly.
 */
export const authStatusQuery = queryOptions({
  queryKey: AUTH_STATUS_KEY,
  queryFn: fetchAuthStatus,
  staleTime: 15_000,
});

/** Marks the cached status as outdated and refetches it (after login, logout, registration). */
export const refreshAuthStatus = () => queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY });

/** Owner-visible method of the authenticated session, shared by profile labels. */
export function useAuthMethodLabel(): string {
  const session = useQuery(authStatusQuery);
  if (session.isError || !session.data?.authenticated) return 'Anmeldemethode unbekannt';
  return session.data.viaRecovery ? 'Wiederherstellungscode' : 'Passkey';
}
