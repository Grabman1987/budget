import type { PortfolioPositionsView } from '@budget/db';
import { depotHoldings } from './depot-model';
import { accountValueEur } from './labels';
import type { AccountRow } from './types';

/** What the account tree shows for one account (and sums per group). */
export interface TreeValue {
  /** EUR cents; `null` while unknown (depot positions not loaded, no price at all, missing rate). */
  cents: number | null;
  /** True when the figure is incomplete: a depot position has no price, shown as "≈". */
  approx: boolean;
}

/** Depots and crypto accounts open the depot page; their figure there is the Depotwert. */
export const isDepotAccount = (account: Pick<AccountRow, 'type'>): boolean =>
  account.type === 'brokerage' || account.type === 'crypto';

/**
 * The tree's figure per account. A depot shows its Depotwert, exactly the number of its depot
 * page (the same `depotHoldings` slice of the positions view), not cash plus positions: its own
 * booking balance is not part of it and the settlement account keeps showing its cash. Every
 * other account keeps the shared EUR value of the accounts overview.
 */
export function treeValues(
  accounts: ReadonlyArray<AccountRow>,
  positions: PortfolioPositionsView | undefined,
): Map<string, TreeValue> {
  return new Map(
    accounts.map((a) => {
      if (!isDepotAccount(a)) return [a.id, { cents: accountValueEur(a), approx: false }];
      // Not loaded (or an unusable answer): unknown, never cash plus positions.
      if (!Array.isArray(positions?.positions)) return [a.id, { cents: null, approx: false }];
      const depot = depotHoldings(positions!, a.id);
      return [
        a.id,
        { cents: depot.valueCents, approx: depot.valueCents !== null && depot.incomplete },
      ];
    }),
  );
}

/** Sum of the shown figures; unknown as soon as one is unknown, "≈" when any part is. */
export function sumTreeValues(
  accounts: ReadonlyArray<Pick<AccountRow, 'id'>>,
  values: ReadonlyMap<string, TreeValue>,
): TreeValue {
  let cents = 0;
  let approx = false;
  for (const a of accounts) {
    const v = values.get(a.id);
    if (!v || v.cents === null) return { cents: null, approx: false };
    cents += v.cents;
    approx ||= v.approx;
  }
  return { cents, approx };
}
