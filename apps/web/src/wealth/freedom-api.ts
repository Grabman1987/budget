import type { FreedomView } from '@budget/db';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
export type { FreedomView } from '@budget/db';
export const FREEDOM_KEY = [...LEDGER_KEY, 'freedom'] as const;
export const freedomQuery = () =>
  queryOptions({
    queryKey: FREEDOM_KEY,
    retry: false,
    queryFn: () => request<FreedomView>('GET', '/api/wealth/freedom'),
  });
