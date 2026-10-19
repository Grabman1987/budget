import type { FreedomView as CurrentFreedomView, FreedomInvestedHistory } from '@budget/db';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import type { FreedomGoalChange, FreedomGoalState, FreedomGoalWrite } from '@budget/domain';
export type FreedomView = CurrentFreedomView & { investedHistory?: FreedomInvestedHistory };
export const FREEDOM_KEY = [...LEDGER_KEY, 'freedom'] as const;
export const freedomQuery = () =>
  queryOptions({
    queryKey: FREEDOM_KEY,
    retry: false,
    queryFn: () => request<FreedomView>('GET', '/api/wealth/freedom'),
  });

export const FREEDOM_GOAL_KEY = [...LEDGER_KEY, 'freedom-goal'] as const;
export const freedomGoalQuery = () =>
  queryOptions({
    queryKey: FREEDOM_GOAL_KEY,
    retry: false,
    queryFn: () => request<FreedomGoalState>('GET', '/api/wealth/freedom/goal'),
  });
export const changeFreedomGoal = (revision: string, change: FreedomGoalChange) =>
  request<FreedomGoalWrite>('POST', '/api/wealth/freedom/goal', { revision, ...change });
