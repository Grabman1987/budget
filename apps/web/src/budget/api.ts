import { queryString, request } from '../api/http';
import type { WriteResult } from '../ledger/types';

/** Shapes and calls of the categories API (`/api/categories`); amounts are integer cents. */

export const CATEGORY_KINDS = [
  'fixed',
  'periodic',
  'variable',
  'project',
  'saving',
  'invest',
  'debt',
  'advance',
  'card_payment',
  'income',
] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];
/** Kinds without a 50/30/20 class (server rule). */
export const CLASSLESS_KINDS: ReadonlySet<CategoryKind> = new Set([
  'income',
  'card_payment',
  'advance',
]);
export type CategoryClass = 'need' | 'want' | 'future';
export type TargetKind = 'monthly' | 'by_date' | 'keep_balance';

export interface GroupRow {
  id: string;
  name: string;
  sortOrder: number;
}

export interface CategoryRow {
  id: string;
  name: string;
  icon: string | null;
  groupId: string;
  class: CategoryClass | null;
  kind: CategoryKind;
  stage: number | null;
  cardAccountId: string | null;
  rolloverOverspending: boolean;
  inflationTrailingMean?: boolean | null;
  sortOrder: number;
  hiddenAt: string | null;
  splitCount: number;
}

export interface TargetRow {
  id: string;
  categoryId: string;
  kind: TargetKind;
  amountCents: number;
  everyMonths: number;
  targetDate: string | null;
  dueDay: number | null;
  validFrom: string;
}

export interface CategoryTree {
  groups: GroupRow[];
  categories: CategoryRow[];
  targets: TargetRow[];
}

export interface CategoryInput {
  inflationTrailingMean?: boolean | null;
  name: string;
  groupId: string;
  icon?: string | null;
  class?: CategoryClass | null;
  kind?: CategoryKind;
  stage?: number | null;
  cardAccountId?: string | null;
}

export interface TargetInput {
  kind: TargetKind;
  amountCents: number;
  everyMonths: number;
  targetDate?: string | null;
  dueDay?: number | null;
}

export interface SplitCandidate {
  splitId: string;
  bookingId: string;
  date: string;
  accountId: string;
  payeeName: string | null;
  memo: string | null;
  amountCents: number;
}

const path = (id: string) => `/api/categories/${encodeURIComponent(id)}`;

export const fetchCategories = () => request<CategoryTree>('GET', '/api/categories');
/** A target version from `validFrom` (`YYYY-MM`) on; `target: null` removes the target. */
export interface TargetChange {
  validFrom: string;
  target: TargetInput | null;
}
export const createCategory = (input: CategoryInput & { target?: TargetChange }) =>
  request<{ category: CategoryRow } & WriteResult>('POST', '/api/categories', input);
export const patchCategory = (
  id: string,
  patch: Partial<CategoryInput> & { hidden?: boolean; target?: TargetChange },
) => request<{ category: CategoryRow } & WriteResult>('PATCH', path(id), patch);
export const sortCategories = (groups: Array<{ id: string; categoryIds: string[] }>) =>
  request<WriteResult>('POST', '/api/categories/sort', { groups });
export const mergeCategories = (sourceIds: string[], targetId: string) =>
  request<WriteResult & { movedSplits: number; movedMonths: number }>(
    'POST',
    '/api/categories/merge',
    { sourceIds, targetId },
  );
export const createGroup = (name: string) =>
  request<{ group: GroupRow } & WriteResult>('POST', '/api/categories/groups', { name });
export const renameGroup = (id: string, name: string) =>
  request<WriteResult>('PATCH', `/api/categories/groups/${encodeURIComponent(id)}`, { name });
export const deleteGroup = (id: string) =>
  request<WriteResult>('DELETE', `/api/categories/groups/${encodeURIComponent(id)}`);
export const fetchSplitOff = (id: string, filter: { q?: string; from?: string; to?: string }) =>
  request<{ splits: SplitCandidate[] }>('GET', `${path(id)}/split-off${queryString(filter)}`);
export const splitOff = (
  id: string,
  splitIds: string[],
  into: { targetId: string } | { newCategory: CategoryInput },
) =>
  request<WriteResult & { targetId: string; moved: number }>('POST', `${path(id)}/split-off`, {
    splitIds,
    ...into,
  });
