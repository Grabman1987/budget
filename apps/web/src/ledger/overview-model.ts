import { bySortOrder, groupAccounts } from './account-groups';
import { accountValueEur, type AccountGroup } from './labels';
import type { AccountRow, SeriesPoint } from './types';
import { longDay } from './format';
import { sumTreeValues, type TreeValue } from './tree-values';

/** Stored owner checks are independent of provider observation/retrieval dates. */
export function accountCheck(account: AccountRow) {
  const review = account.reviewStatus;
  if (!review) return { text: 'Prüfstatus nicht verfügbar', stale: false, state: 'unavailable' };
  const manual = account.type === 'p2p' || account.type === 'other_asset';
  const date = review.checkedOn;
  const checked = date ? `${manual ? 'Wert vom' : 'geprüft am'} ${longDay(date)}` : 'nie geprüft';
  return {
    text: review.state === 'due' ? `Fällig · ${checked}` : checked,
    stale: review.state === 'due',
    state: review.state,
  };
}

export interface GroupView {
  group: AccountGroup;
  accounts: AccountRow[];
  /** Sum of the account values (debts are negative). */
  sumCents: number | null;
  /** True when a part of the sum is incomplete (a depot position without price): shown as "≈". */
  sumApprox: boolean;
}

const sumEur = (accounts: ReadonlyArray<AccountRow>): number | null =>
  accounts.some((a) => accountValueEur(a) === null)
    ? null
    : accounts.reduce((sum, a) => sum + (accountValueEur(a) ?? 0), 0);

/**
 * Open accounts by group (YNAB order, the owner's sort order inside); net worth also includes
 * closed accounts with residual balances.
 */
export function overviewModel(
  accounts: ReadonlyArray<AccountRow>,
  /** Tree figures (Depotwert, depot cash moved to the Verrechnungskonto); without them the shared EUR value. */
  values?: ReadonlyMap<string, TreeValue>,
) {
  const open = accounts.filter((a) => !a.closedAt);
  const closed = accounts.filter((a) => a.closedAt).sort(bySortOrder);
  const groups: GroupView[] = groupAccounts(open).map(({ group, accounts: members }) => ({
    group,
    accounts: members,
    ...(values
      ? (({ cents, approx }) => ({ sumCents: cents, sumApprox: approx }))(
          sumTreeValues(members, values),
        )
      : { sumCents: sumEur(members), sumApprox: false }),
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

/** Page-only identities and counts; shared sums, group membership and account order stay intact. */
export function accountOverviewPresentation(model: ReturnType<typeof overviewModel>) {
  const visible = model.groups.flatMap((group) => group.accounts);
  const byId = new Map(visible.map((a) => [a.id, a]));
  const related = new Map<string, AccountRow[]>();
  for (const depot of visible) {
    if (!['brokerage', 'crypto'].includes(depot.type) || !depot.referenceAccountId) continue;
    const reference = byId.get(depot.referenceAccountId);
    if (!reference || reference.id === depot.id) continue;
    const add = (id: string, account: AccountRow) => {
      const linked = related.get(id) ?? [];
      if (!linked.some((a) => a.id === account.id)) related.set(id, [...linked, account]);
    };
    add(depot.id, reference);
    add(reference.id, depot);
  }
  return {
    visible,
    budget: model.groups.find((group) => group.group.id === 'budget'),
    checked: visible.filter((account) => account.reviewStatus?.state === 'checked').length,
    reviewUnavailable: visible.filter((account) => !account.reviewStatus).length,
    related,
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
