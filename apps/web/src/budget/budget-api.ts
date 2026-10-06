import type {
  budgetAccountMoney,
  IncomeTargets,
  QuickAssignFigures,
  QuickAssignMode,
} from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import type { WriteResult } from '../ledger/types';
import type { CategoryRow, GroupRow, TargetRow } from './api';
import { BUDGET_KEY } from './use-category-writes';

/** Shapes and calls of the budget API (`/api/budget/:month`); amounts are integer cents. */

export interface EnvelopeSummary {
  quickAssign?: QuickAssignFigures;
  categoryId: string;
  committedCents?: number;
  freeCents?: number;
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
  incomeTargets?: IncomeTargets;
  budgetMoney?: ReturnType<typeof budgetAccountMoney>;
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

/** Several months in one call (Plan › Jahr): the same views as `budgetQuery`, keyed by month. */
export const budgetMonthsQuery = (months: string[]) =>
  queryOptions({
    queryKey: [...BUDGET_KEY, 'months', months],
    queryFn: () =>
      request<{ months: Record<string, BudgetMonthView> }>(
        'GET',
        `/api/budget/months?months=${months.join(',')}`,
      ),
  });

export const assign = (
  month: string,
  items: Array<{ categoryId: string; assignedCents: number }>,
) => request<WriteResult>('PUT', `${path(month)}/assigned`, { items });
export const quickAssign = (month: string, mode: QuickAssignMode, categoryIds: string[]) =>
  request<WriteResult & { changedCount: number; openCount: number; missingCents: number }>(
    'POST',
    `${path(month)}/quick-assign`,
    { mode, categoryIds },
  );
export const moveMoney = (
  month: string,
  fromId: string | null,
  toId: string | null,
  amountCents: number,
) => request<WriteResult>('POST', `${path(month)}/move`, { fromId, toId, amountCents });
/** Cover is capped at the free source amount on the server. */
export const coverOverspending = (month: string, categoryId: string, fromId: string | null) =>
  request<WriteResult & { coveredCents: number }>('POST', `${path(month)}/cover`, {
    categoryId,
    fromId,
  });

/** Omitted source: suggested positive sources in descending order, one audit/undo. */
export const coverAll = (month: string, fromId?: string | null) =>
  request<WriteResult & { coveredCount: number; openCount: number; missingCents: number }>(
    'POST',
    `${path(month)}/move`,
    { coverAll: true, ...(fromId !== undefined && { fromId }) },
  );
