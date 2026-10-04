import { addDays, lastDayOfMonth, monthsBetween } from '../date';
import { STRUCTURE_GROUPS } from './networth-structure';

/**
 * Report "Vermögen & Schulden": the net worth of a day split into what the household owns and what
 * it owes, per account. Pure: the per-account values come from `netWorthAsOf`, the same valuation
 * the Vermögen pages use, so assets plus debts always equal the net worth of the same day.
 *
 * An account counts as an asset while its value is positive and as a debt while it is negative, so
 * a loan or a credit card in the red is a debt, an overpaid card or a positive loan balance is an
 * asset, and a cash account that went below zero is a debt. Same rule as `structureOf`.
 */

export interface AccountMeta {
  id: string;
  name: string;
  /** `account.type`. */
  type: string;
}

export interface AssetsDebtsAccount {
  accountId: string;
  name: string;
  type: string;
  /** German label of the account type; unknown types keep their key. */
  typeLabel: string;
  /** EUR cents, positive for assets, negative for debts. */
  valueCents: number;
}

export interface AssetsDebtsDay {
  assetsCents: number;
  /** Negative: the sum of all accounts below zero. */
  debtsCents: number;
  /** `assetsCents + debtsCents`: equals `netWorthAsOf` of the day. */
  netCents: number;
  /** Largest first. */
  assets: AssetsDebtsAccount[];
  /** Largest debt first (most negative). */
  debts: AssetsDebtsAccount[];
}

const labelOf = (type: string): string =>
  STRUCTURE_GROUPS.find((g) => g.key === type)?.label ?? type;

/** Split the account values of one day into assets and debts. Accounts at exactly zero are left out. */
export function assetsDebtsOf(
  byAccount: Readonly<Record<string, number>>,
  metaOf: (accountId: string) => AccountMeta | undefined,
): AssetsDebtsDay {
  const assets: AssetsDebtsAccount[] = [];
  const debts: AssetsDebtsAccount[] = [];
  for (const [id, valueCents] of Object.entries(byAccount)) {
    const meta = metaOf(id);
    if (!meta) throw new RangeError(`Account ${id} is unknown`);
    if (valueCents === 0) continue;
    const row: AssetsDebtsAccount = {
      accountId: id,
      name: meta.name,
      type: meta.type,
      typeLabel: labelOf(meta.type),
      valueCents,
    };
    (valueCents > 0 ? assets : debts).push(row);
  }
  const byName = (a: AssetsDebtsAccount, b: AssetsDebtsAccount) =>
    a.name.localeCompare(b.name, 'de');
  assets.sort((a, b) => b.valueCents - a.valueCents || byName(a, b));
  debts.sort((a, b) => a.valueCents - b.valueCents || byName(a, b));
  const assetsCents = assets.reduce((sum, a) => sum + a.valueCents, 0);
  const debtsCents = debts.reduce((sum, a) => sum + a.valueCents, 0);
  return { assetsCents, debtsCents, netCents: assetsCents + debtsCents, assets, debts };
}

export interface NetWorthChange {
  startCents: number;
  endCents: number;
  deltaCents: number;
  /**
   * Change relative to the size of the start value (`delta / |start|`, 0,1 = 10 %); `null` when the
   * start is zero. A derived rate: never stored or summed, the formatter rounds it once.
   */
  deltaRate: number | null;
}

/** "Veränderung im Zeitraum" in EUR and percent. */
export function netWorthChange(startCents: number, endCents: number): NetWorthChange {
  const deltaCents = endCents - startCents;
  return {
    startCents,
    endCents,
    deltaCents,
    deltaRate: startCents === 0 ? null : deltaCents / Math.abs(startCents),
  };
}

/**
 * The month-end days of a window: one per calendar month from the month after `from` (or the month
 * of `to` for an empty window) through the month of `to`. The last one is `to` itself while the
 * month is still running (`partial`), otherwise the month's last day.
 */
export function monthEnds(
  from: string,
  to: string,
): { month: string; date: string; partial: boolean }[] {
  const first = from < to ? addDays(from, 1).slice(0, 7) : to.slice(0, 7);
  return monthsBetween(first, to.slice(0, 7)).map((month) => {
    const end = lastDayOfMonth(month);
    return end <= to ? { month, date: end, partial: false } : { month, date: to, partial: true };
  });
}
