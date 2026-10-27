import type { AccountRow } from './types';

// A correction preference belongs to this account/browser, independently of capture defaults.
const key = (accountId: string) => `budget-reconcile-category:${accountId}`;

export function readCorrectionCategory(accountId: string): string {
  try {
    return localStorage.getItem(key(accountId)) ?? '';
  } catch {
    return '';
  }
}

export function rememberCorrectionCategory(accountId: string, categoryId: string): void {
  try {
    localStorage.setItem(key(accountId), categoryId);
  } catch {
    // Blocked browser storage must not prevent a canonical correction.
  }
}

/** Null is TBA for cash accounts; tracking/card corrections retain their existing semantics. */
export function defaultCorrectionCategoryLabel(
  account: Pick<AccountRow, 'onBudget' | 'type'>,
): string {
  return account.onBudget && ['checking', 'cash', 'savings'].includes(account.type)
    ? 'Zu verteilen'
    : 'Ohne Kategorie';
}
