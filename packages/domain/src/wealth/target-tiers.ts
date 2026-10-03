/**
 * Dynamic target weights by investment sum (Einstellungen › Anlageklassen).
 *
 * The owner keeps several target sets, each valid up to an investment sum (for example up to
 * 10.000 €, up to 20.000 €, up to 50.000 €, above). The set that applies is chosen by the current
 * investment sum: the first tier, in ascending order of its threshold, whose threshold is not below
 * the sum. A tier without threshold (`upToCents` null) is the open "above" tier and always comes
 * last. A sum above every threshold of a list without an open tier uses the last (highest) tier.
 */

import { cents, formatEuro } from '../money';

export interface TargetTierBound {
  id: string;
  /** Inclusive upper bound of the investment sum in cents; `null` = above the last threshold. */
  upToCents: number | null;
}

/** Tiers in ascending order of their threshold, the open tier (null) last. */
export function sortTargetTiers<T extends TargetTierBound>(tiers: ReadonlyArray<T>): T[] {
  return [...tiers].sort((a, b) => {
    if (a.upToCents === null) return b.upToCents === null ? 0 : 1;
    if (b.upToCents === null) return -1;
    return a.upToCents - b.upToCents;
  });
}

/**
 * The tier that applies to an investment sum. A negative sum (cash accounts overdrawn beyond the
 * holdings) belongs to the lowest tier. Returns `null` for an empty list.
 */
export function selectTargetTier<T extends TargetTierBound>(
  tiers: ReadonlyArray<T>,
  sumCents: number,
): T | null {
  const sorted = sortTargetTiers(tiers);
  for (const tier of sorted) if (tier.upToCents === null || sumCents <= tier.upToCents) return tier;
  return sorted.at(-1) ?? null;
}

/** Why a tier list cannot be stored; `null` when it is well-formed. */
export function targetTierListProblem(tiers: ReadonlyArray<TargetTierBound>): string | null {
  if (tiers.length === 0) return 'at least one tier is needed';
  const open = tiers.filter((t) => t.upToCents === null);
  if (open.length > 1) return 'only one tier can be open ("above")';
  const seen = new Set<number>();
  for (const t of tiers) {
    if (t.upToCents === null) continue;
    if (!Number.isSafeInteger(t.upToCents) || t.upToCents < 0)
      return 'a threshold is a whole number of cents, 0 or more';
    if (seen.has(t.upToCents)) return 'two tiers have the same threshold';
    seen.add(t.upToCents);
  }
  return null;
}

/**
 * German label of a tier by its threshold: "bis 20.000 €" for a bounded tier, "über 50.000 €" for
 * the open tier (above the highest bounded threshold), "alle Summen" for a lone open tier.
 */
export function targetTierLabel(
  tier: TargetTierBound,
  all: ReadonlyArray<TargetTierBound>,
): string {
  const eur = (value: number) => formatEuro(cents(value), { cents: false });
  if (tier.upToCents !== null) return `bis ${eur(tier.upToCents)}`;
  const below = sortTargetTiers(all)
    .filter((t) => t.upToCents !== null)
    .at(-1);
  return below?.upToCents != null ? `über ${eur(below.upToCents)}` : 'alle Summen';
}
