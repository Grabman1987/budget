import { ratioBp } from '../wealth/int';

/**
 * Persönliche Inflation (2.4): a fixed-weight price index (Laspeyres) of the household's own
 * basket. Only items with a real price over time can be in it: contracts and subscriptions with
 * their stored price versions. Variable categories are left out because the ledger cannot
 * separate quantity and price there, and the report says so instead of inventing a price.
 * Weights are the actual spending of the base year, the index starts at 100 in the first month.
 */

export interface InflationItem {
  id: string;
  name: string;
  class: 'need' | 'want' | 'future' | null;
  /** Price level per month (monthly equivalent in EUR cents); `null` when not in force. */
  level: Readonly<Record<string, number | null>>;
  /** Net spending of the category per month, positive cents. */
  spend: Readonly<Record<string, number>>;
}

export interface InflationPoint {
  month: string;
  /** The own index, first month = 100. */
  index: number;
  /** Reference index (e.g. consumer prices) rebased to 100 in the first month, when given. */
  reference: number | null;
}

export interface InflationContribution {
  id: string;
  name: string;
  class: 'need' | 'want' | 'future' | null;
  /** Share of the base-year spending in basis points of the basket. */
  shareBp: number;
  /** Price change of the item over the window in basis points. */
  changeBp: number;
  /** Contribution in hundredths of a percentage point (share × change). */
  contributionBp: number;
}

export interface PersonalInflation {
  status: 'ok' | 'insufficient';
  /** Months the index covers; empty when insufficient. */
  points: InflationPoint[];
  baseMonth: string | null;
  /** Window of the 12-month change. */
  fromMonth: string | null;
  toMonth: string | null;
  inflationBp: number | null;
  referenceBp: number | null;
  /** Difference to the reference in basis points; `null` without reference. */
  differenceBp: number | null;
  indexFrom: number | null;
  indexTo: number | null;
  contributions: InflationContribution[];
  contributionSumBp: number;
  /** Items in the index and their share of the consumption of the base year, basis points. */
  basketItems: number;
  coverageBp: number | null;
}

const empty = (): PersonalInflation => ({
  status: 'insufficient',
  points: [],
  baseMonth: null,
  fromMonth: null,
  toMonth: null,
  inflationBp: null,
  referenceBp: null,
  differenceBp: null,
  indexFrom: null,
  indexTo: null,
  contributions: [],
  contributionSumBp: 0,
  basketItems: 0,
  coverageBp: null,
});

/** Index values are ratios, not money: four decimals keep float noise out of the answer. */
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

const sumSpend = (item: InflationItem, months: ReadonlyArray<string>) =>
  months.reduce((a, m) => a + (item.spend[m] ?? 0), 0);

export function personalInflation(input: {
  /** Full months, ascending; at least 13 are needed for a 12-month change. */
  available: ReadonlyArray<string>;
  items: ReadonlyArray<InflationItem>;
  /** Consumption (Bedarf + Wunsch) over the base year, to say how much the basket covers. */
  baseConsumptionCents: number;
  /** Optional reference index per month (any base); rebased here. */
  reference?: Readonly<Record<string, number>> | null;
}): PersonalInflation {
  const { available } = input;
  if (available.length < 13) return empty();
  const base = available[0] as string;
  const baseYear = available.slice(0, 12);
  const weighted = input.items
    .filter((i) => (i.level[base] ?? 0) > 0)
    .map((i) => ({ item: i, weight: Math.max(0, sumSpend(i, baseYear)) }))
    .filter((x) => x.weight > 0);
  const total = weighted.reduce((a, x) => a + x.weight, 0);
  if (total <= 0) return empty();

  // Fixed weights; an item that is no longer in force keeps its last price (no change).
  const last = new Map<string, number>();
  const points: InflationPoint[] = [];
  const refBase = input.reference?.[base] ?? null;
  for (const month of available) {
    let sum = 0;
    for (const { item, weight } of weighted) {
      const own = item.level[month];
      if (own !== null && own !== undefined && own > 0) last.set(item.id, own);
      const price = last.get(item.id) ?? (item.level[base] as number);
      sum += (weight / total) * (price / (item.level[base] as number));
    }
    const ref = input.reference?.[month];
    points.push({
      month,
      index: round4(100 * sum),
      reference: refBase && ref !== undefined ? round4((100 * ref) / refBase) : null,
    });
  }
  const toMonth = available[available.length - 1] as string;
  const fromMonth = available[available.length - 13] as string;
  const p = (m: string) => points.find((x) => x.month === m) as InflationPoint;
  const indexFrom = p(fromMonth).index;
  const indexTo = p(toMonth).index;
  const bpOf = (a: number, b: number) => Math.round((b / a - 1) * 10_000);
  const refFrom = p(fromMonth).reference;
  const refTo = p(toMonth).reference;
  const inflationBp = bpOf(indexFrom, indexTo);
  const referenceBp = refFrom !== null && refTo !== null ? bpOf(refFrom, refTo) : null;

  // Contributions: weights from the twelve months up to the start of the window.
  const at = available.indexOf(fromMonth);
  const weightMonths = available.slice(Math.max(0, at - 11), at + 1);
  const candidates = input.items
    .filter((i) => (i.level[fromMonth] ?? 0) > 0 && (i.level[toMonth] ?? 0) > 0)
    .map((i) => ({ item: i, weight: Math.max(0, sumSpend(i, weightMonths)) }))
    .filter((x) => x.weight > 0);
  const wTotal = candidates.reduce((a, x) => a + x.weight, 0);
  const contributions: InflationContribution[] = candidates
    .map(({ item, weight }) => {
      const shareBp = ratioBp(weight, wTotal);
      const changeBp = bpOf(item.level[fromMonth] as number, item.level[toMonth] as number);
      return {
        id: item.id,
        name: item.name,
        class: item.class,
        shareBp,
        changeBp,
        contributionBp: Math.round((weight / wTotal) * changeBp),
      };
    })
    .sort((a, b) => b.contributionBp - a.contributionBp || a.name.localeCompare(b.name, 'de'));
  return {
    status: 'ok',
    points,
    baseMonth: base,
    fromMonth,
    toMonth,
    inflationBp,
    referenceBp,
    differenceBp: referenceBp === null ? null : inflationBp - referenceBp,
    indexFrom,
    indexTo,
    contributions,
    contributionSumBp: contributions.reduce((a, c) => a + c.contributionBp, 0),
    basketItems: weighted.length,
    coverageBp: input.baseConsumptionCents > 0 ? ratioBp(total, input.baseConsumptionCents) : null,
  };
}
