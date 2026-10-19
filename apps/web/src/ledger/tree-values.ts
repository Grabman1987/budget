import type { PortfolioPositionsView } from '@budget/db';
import { depotHoldings } from './depot-model';
import { accountValueEur } from './labels';
import type { AccountRow } from './types';

/** What the account tree and Konten › Übersicht show for one account, and what it adds to sums. */
export interface TreeValue {
  /** Shown figure in EUR cents; `null` while unknown (positions not loaded, no price, missing rate). */
  cents: number | null;
  /** True when the figure is incomplete: a depot position has no price, shown as "≈". */
  approx: boolean;
  /** What the row adds to group sums; the same as `cents` unless the depot's cash is counted there. */
  sumCents: number | null;
  /** Settlement account: cash of the linked depots that was added to `cents`. */
  includedCashCents: number | null;
  /** Depot without an open Verrechnungskonto: its own cash, shown as a line under the row. */
  cashCents: number | null;
}

/** Depots and crypto accounts open the depot page; their figure there is the Depotwert. */
export const isDepotAccount = (account: Pick<AccountRow, 'type'>): boolean =>
  account.type === 'brokerage' || account.type === 'crypto';

const plain = (cents: number | null): TreeValue => ({
  cents,
  approx: false,
  sumCents: cents,
  includedCashCents: null,
  cashCents: null,
});

/**
 * The figure per account for the tree and the overview, one regrouping of existing numbers:
 * - A depot shows its Depotwert, exactly the number of its depot page (the same `depotHoldings`
 *   slice of the positions view).
 * - The depot's own cash (shared EUR value minus Depotwert) is added to the Verrechnungskonto it is
 *   linked to (`referenceAccountId`), so the platform's row reads settlement cash plus depot cash.
 *   Without an open Verrechnungskonto it stays with the depot: shown as a line under the row and
 *   counted in the sums.
 * - Every other account keeps the shared EUR value.
 * Sums over all open accounts therefore stay equal to the net worth. While the positions are not
 * loaded (or unusable), depots and their settlement accounts are unknown, never cash plus positions.
 */
export function treeValues(
  accounts: ReadonlyArray<AccountRow>,
  positions: PortfolioPositionsView | undefined,
): Map<string, TreeValue> {
  const values = new Map<string, TreeValue>(accounts.map((a) => [a.id, plain(accountValueEur(a))]));
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const included = new Map<string, number>();
  for (const depot of accounts) {
    if (!isDepotAccount(depot) || depot.closedAt) continue;
    const settlement = depot.referenceAccountId ? byId.get(depot.referenceAccountId) : undefined;
    const linked =
      settlement && !settlement.closedAt && !isDepotAccount(settlement) ? settlement : undefined;
    const total = accountValueEur(depot);
    const held = Array.isArray(positions?.positions)
      ? depotHoldings(positions!, depot.id)
      : undefined;
    const shown = held?.valueCents ?? null;
    if (!held || shown === null || total === null) {
      values.set(depot.id, { ...plain(shown), sumCents: null });
      if (linked) values.set(linked.id, plain(null));
      continue;
    }
    const cash = total - shown;
    const approx = held.incomplete;
    if (linked) {
      values.set(depot.id, { ...plain(shown), approx });
      included.set(linked.id, (included.get(linked.id) ?? 0) + cash);
    } else {
      values.set(depot.id, {
        cents: shown,
        approx,
        sumCents: total,
        includedCashCents: null,
        cashCents: cash === 0 ? null : cash,
      });
    }
  }
  for (const [id, cash] of included) {
    const current = values.get(id)!;
    // An unknown settlement stays unknown (a linked depot was unknown); otherwise add the depot cash.
    if (current.cents === null || current.sumCents === null) continue;
    values.set(id, {
      ...current,
      cents: current.cents + cash,
      sumCents: current.sumCents + cash,
      includedCashCents: cash === 0 ? null : cash,
    });
  }
  return values;
}

/** Sum of what the accounts add; unknown as soon as one is unknown, "≈" when any part is. */
export function sumTreeValues(
  accounts: ReadonlyArray<Pick<AccountRow, 'id'>>,
  values: ReadonlyMap<string, TreeValue>,
): { cents: number | null; approx: boolean } {
  let cents = 0;
  let approx = false;
  for (const a of accounts) {
    const v = values.get(a.id);
    if (!v || v.sumCents === null) return { cents: null, approx: false };
    cents += v.sumCents;
    approx ||= v.approx;
  }
  return { cents, approx };
}
