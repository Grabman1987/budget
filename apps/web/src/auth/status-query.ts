import { QueryClient, queryOptions } from '@tanstack/react-query';
import { onApiWrite, shouldRetry } from '../api/http';
import { fetchAuthStatus } from './api';

// A page that was read a moment ago is not read again on every remount, route change or window
// focus: the server derives some answers in seconds, and the Node process answers one request at a
// time, so a refetch storm makes every page wait. Writes invalidate the affected keys explicitly.
export const DEFAULT_STALE_MS = 20_000;
/** One query client for the whole app (also used by the router guards). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      staleTime: DEFAULT_STALE_MS,
      // Coming back to the window still reads again (the pages show a loading state then); the
      // stale time only spares remounts and route changes.
      refetchOnWindowFocus: 'always',
    },
  },
});
// Every successful write makes everything read so far stale (without refetching what is on screen:
// the writer refetches what it knows it changed). The next visit of any page reads again, as it
// did before the stale time existed.
onApiWrite(() => void queryClient.invalidateQueries({ refetchType: 'none' }));

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
