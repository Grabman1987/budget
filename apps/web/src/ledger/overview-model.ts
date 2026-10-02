import { bySortOrder, groupAccounts } from './account-groups';
import { accountValueEur, type AccountGroup } from './labels';
import type { AccountRow, SeriesPoint } from './types';

export interface GroupView {
  group: AccountGroup;
  accounts: AccountRow[];
  /** Sum of the account values (debts are negative). */
  sumCents: number | null;
}

const sumEur = (accounts: ReadonlyArray<AccountRow>): number | null =>
  accounts.some((a) => accountValueEur(a) === null)
    ? null
    : accounts.reduce((sum, a) => sum + (accountValueEur(a) ?? 0), 0);

/**
 * Open accounts by group (YNAB order, the owner's sort order inside); net worth also includes
 * closed accounts with residual balances.
 */
export function overviewModel(accounts: ReadonlyArray<AccountRow>) {
  const open = accounts.filter((a) => !a.closedAt);
  const closed = accounts.filter((a) => a.closedAt).sort(bySortOrder);
  const groups: GroupView[] = groupAccounts(open).map(({ group, accounts: members }) => ({
    group,
    accounts: members,
    sumCents: sumEur(members),
  }));
  return {
    groups,
    closed,
    closedValueCents: sumEur(closed),
    netWorthCents: sumEur(accounts),
    missingPriceSecurityIds: [
      ...new Set(accounts.flatMap((a) => a.missingPriceSecurityIds ?? [])),
    ].sort(),
    missingFxCurrencies: [...new Set(accounts.flatMap((a) => a.missingFxCurrencies))].sort(),
  };
}

/**
 * Net worth change against an earlier day, or `null` when it would mislead: an account that did
 * not exist yet at that day would count its whole opening balance as gain.
 */
export function netWorthChange(
  now: ReadonlyArray<AccountRow>,
  before: ReadonlyArray<AccountRow>,
  beforeDay: string,
): number | null {
  if (now.some((a) => a.openingDate > beforeDay)) return null;
  const ids = new Set(now.map((a) => a.id));
  const currentValue = sumEur(now);
  const previousValue = sumEur(before.filter((a) => ids.has(a.id)));
  if (currentValue === null || previousValue === null) return null;
  return currentValue - previousValue;
}

/** Change over a series window: last minus first balance. */
export const seriesChange = (points: ReadonlyArray<SeriesPoint>): number =>
  points.length < 2
    ? 0
    : (points[points.length - 1] as SeriesPoint).balanceCents -
      (points[0] as SeriesPoint).balanceCents;

/** Credit-card utilisation in percent of the limit, when the account has one. */
export function utilisation(account: AccountRow): number | null {
  if (!account.creditLimitCents || account.creditLimitCents <= 0) return null;
  return Math.max(0, Math.min(1, -account.balanceCents / account.creditLimitCents));
}
