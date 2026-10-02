import { ACCOUNT_GROUPS, groupIdOf, type AccountGroup } from './labels';
import type { AccountRow } from './types';

type Groupable = Pick<AccountRow, 'type' | 'onBudget' | 'sortOrder' | 'name'>;

/** The owner's order: `sortOrder`, ties by name (stable and deterministic). */
export const bySortOrder = (a: Groupable, b: Groupable): number =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'de-AT');

/**
 * Accounts by group in the shared order (see `ACCOUNT_GROUPS`), each group in the owner's sort
 * order; empty groups are left out. Pass open accounts only: closed ones have their own section.
 */
export function groupAccounts<T extends Groupable>(
  accounts: ReadonlyArray<T>,
): { group: AccountGroup; accounts: T[] }[] {
  return ACCOUNT_GROUPS.map((group) => ({
    group,
    accounts: accounts.filter((a) => groupIdOf(a) === group.id).sort(bySortOrder),
  })).filter((g) => g.accounts.length > 0);
}
