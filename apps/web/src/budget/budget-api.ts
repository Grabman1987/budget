import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import type { WriteResult } from '../ledger/types';
import type { CategoryRow, GroupRow, TargetRow } from './api';
import { BUDGET_KEY } from './use-category-writes';

/** Shapes and calls of the budget API (`/api/budget/:month`); amounts are integer cents. */

export interface EnvelopeSummary {
  categoryId: string;
  carryCents: number;
  assignedCents: number;
  activityCents: number;
  availableCents: number;
  overspentCents: number;
  cashOverspentCents: number;
  creditOverspentCents: number;
  fundedCardCents: number;
  goalCents: number;
  needCents: number;
  dueMonth: string | null;
  target: TargetRow | null;
}

export interface MonthSummary {
  unclassified?: { count: number; inflowCents: number; outflowCents: number; netCents: number };
  month: string;
  carryInCents: number;
  incomeCents: number;
  uncoveredCents: number;
  heldCents: number;
  assignedCents: number;
  activityCents: number;
  availableCents: number;
  toBeAssignedCents: number;
  creditOverspentCents: number;
  cashOverspentCents: number;
  envelopes: EnvelopeSummary[];
  cards: Array<{ accountId: string; cardDebtGrowthCents: number }>;
}

export interface BudgetMonthView {
  summary: MonthSummary;
  groups: GroupRow[];
  categories: CategoryRow[];
}

const path = (month: string) => `/api/budget/${month}`;

export const budgetQuery = (month: string) =>
  queryOptions({
    queryKey: [...BUDGET_KEY, month],
    queryFn: () => request<BudgetMonthView>('GET', path(month)),
  });

export const assign = (
  month: string,
  items: Array<{ categoryId: string; assignedCents: number }>,
) => request<WriteResult>('PUT', `${path(month)}/assigned`, { items });
export const moveMoney = (
  month: string,
  fromId: string | null,
  toId: string | null,
  amountCents: number,
) => request<WriteResult>('POST', `${path(month)}/move`, { fromId, toId, amountCents });
/** From "Zu verteilen" (`fromId: null`) at most what it holds, unless `allowNegative`. */
export const coverOverspending = (
  month: string,
  categoryId: string,
  fromId: string | null,
  allowNegative = false,
) =>
  request<WriteResult & { coveredCents: number }>('POST', `${path(month)}/cover`, {
    categoryId,
    fromId,
    ...(allowNegative && { allowNegative }),
  });
