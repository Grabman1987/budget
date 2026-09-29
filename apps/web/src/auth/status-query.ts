import { QueryClient, queryOptions } from '@tanstack/react-query';
import { fetchAuthStatus } from './api';

/** One query client for the whole app (also used by the router guards). */
export const queryClient = new QueryClient();

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
