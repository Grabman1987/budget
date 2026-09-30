import { ACCOUNT_GROUPS, accountValue, type AccountGroup } from './labels';
import type { AccountRow, SeriesPoint } from './types';

export interface GroupView {
  group: AccountGroup;
  accounts: AccountRow[];
  /** Sum of the account values (debts are negative). */
  sumCents: number;
}

/** Open accounts by group in chain order; closed accounts are listed separately. */
export function overviewModel(accounts: ReadonlyArray<AccountRow>) {
  const open = accounts.filter((a) => !a.closedAt);
  const groups: GroupView[] = ACCOUNT_GROUPS.map((group) => {
    const members = open.filter((a) => a.role === group.role);
    return {
      group,
      accounts: members,
      sumCents: members.reduce((sum, a) => sum + accountValue(a), 0),
    };
  }).filter((g) => g.accounts.length > 0);
  return {
    groups,
    closed: accounts.filter((a) => a.closedAt),
    netWorthCents: open.reduce((sum, a) => sum + accountValue(a), 0),
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
  const open = now.filter((a) => !a.closedAt);
  if (open.some((a) => a.openingDate > beforeDay)) return null;
  const sum = (rows: ReadonlyArray<AccountRow>, ids: Set<string>) =>
    rows.filter((a) => ids.has(a.id)).reduce((s, a) => s + accountValue(a), 0);
  const ids = new Set(open.map((a) => a.id));
  return sum(now, ids) - sum(before, ids);
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
