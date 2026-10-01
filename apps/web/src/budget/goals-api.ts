import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import type { WriteResult } from '../ledger/types';
import { GOALS_KEY } from './use-category-writes';

/** Shapes and calls of the savings goals API (`/api/goals`); amounts are integer cents. */

export type GoalStatus = 'reached' | 'on_track' | 'behind';

export interface GoalView {
  id: string;
  name: string;
  targetCents: number;
  /** `YYYY-MM-DD` */
  targetDate: string | null;
  categoryId: string | null;
  accountId: string | null;
  note: string | null;
  /** Saved at the end of the viewed month. */
  savedCents: number;
  remainingCents: number;
  monthsLeft: number | null;
  neededMonthlyCents: number | null;
  averageRateCents: number;
  /** `YYYY-MM` */
  forecastMonth: string | null;
  status: GoalStatus;
}

export interface GoalInput {
  name: string;
  targetCents: number;
  targetDate: string | null;
  categoryId: string | null;
  accountId: string | null;
}

export const goalsQuery = (month: string) =>
  queryOptions({
    queryKey: [...GOALS_KEY, month],
    queryFn: () =>
      request<{ month: string; goals: GoalView[] }>('GET', `/api/goals?month=${month}`),
  });

const path = (id: string, month: string) => `/api/goals/${encodeURIComponent(id)}?month=${month}`;

export const createGoal = (month: string, input: Partial<GoalInput> & { name: string }) =>
  request<{ goal: GoalView } & WriteResult>('POST', `/api/goals?month=${month}`, input);
export const patchGoal = (month: string, id: string, patch: Partial<GoalInput>) =>
  request<{ goal: GoalView } & WriteResult>('PATCH', path(id, month), patch);
export const deleteGoal = (id: string) =>
  request<WriteResult>('DELETE', `/api/goals/${encodeURIComponent(id)}`);
/** The goal becomes the `by_date` target of its envelope from `validFrom` (`YYYY-MM`) on. */
export const adoptGoal = (id: string, validFrom: string) =>
  request<WriteResult & { categoryId: string }>(
    'POST',
    `/api/goals/${encodeURIComponent(id)}/adopt`,
    { validFrom },
  );
