import { ratioBp, shareBps } from '../wealth/int';
import { addMonths } from '../date';
import type { Rhythm } from '../schedule';
import type { ContractVersion } from './contracts';

/**
 * Persönliche Inflation (2.4): a chained price index (Laspeyres) of the household's own
 * basket. Only items with a real price over time can be in it: contracts and subscriptions with
 * their stored price versions. Variable categories are left out because the ledger cannot
 * separate quantity and price there, and the report says so instead of inventing a price.
 * Weights are the actual spending of the base year, the index starts at 100 in the first month.
 */

export interface InflationItem {
  id: string;
  name: string;
  categoryId?: string;
  categoryName?: string;
  rhythm?: Rhythm;
  source?: 'stored' | 'bookings' | 'trailing';
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

/** The 12-month change of one month, personal against the reference. */
export interface InflationMonth {
  month: string;
  ownBp: number;
  /** `null` when the reference series does not cover the month or the one a year before. */
  referenceBp: number | null;
}

/** December versus December, or the latest running-year month versus its previous year. */
export interface InflationYear {
  year: number;
  /** Months of the year the own index covers / the reference covers. */
  ownMonths: number;
  referenceMonths: number;
  /** Price change against the same month of the previous year. */
  ownChangeBp: number | null;
  referenceChangeBp: number | null;
  throughMonth: string;
  differenceBp: number | null;
}

export interface PersonalInflation {
  status: 'ok' | 'insufficient';
  /** 12-month change per month from the 13th month on. */
  monthly: InflationMonth[];
  years: InflationYear[];
  /** The newest month with both an own and a reference 12-month change. */
  latestComparison: {
    month: string;
    ownBp: number;
    referenceBp: number;
    differenceBp: number;
  } | null;
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
  basket: Array<
    InflationContribution & {
      categoryId: string;
      categoryName: string;
      source: string;
      baseCents: number;
      nowCents: number;
      history: Array<{ month: string; cents: number }>;
      successors: string[];
    }
  >;
  coverageBp: number | null;
}

const empty = (): PersonalInflation => ({
  status: 'insufficient',
  monthly: [],
  years: [],
  latestComparison: null,
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
  basket: [],
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
  // Price relatives belong to items, never to the sum of contracts in a category.
  const raw = input.items.filter((i) => Object.values(i.level).some((v) => (v ?? 0) > 0));
  const first = input.available.findIndex((m) => raw.some((i) => (i.level[m] ?? 0) > 0));
  const available = input.available.slice(Math.max(0, first));
  if (available.length < 13) return empty();
  const base = available[0]!;
  const baseYear = available.slice(0, 12);
  const weighted = linkInflationSuccessors(raw, available).map((item) => ({
    item,
    weight: Math.max(0, sumSpend(item, baseYear)),
  }));
  const total = weighted.reduce((a, x) => a + x.weight, 0);
  if (total <= 0) return empty();
  const state = new Map(
    weighted.map(({ item, weight }) => [
      item.id,
      {
        price: 0,
        relative: 1,
        weight,
        contribution: 0,
      },
    ]),
  );
  const snapshots = new Map<string, Map<string, number>>();
  const points: InflationPoint[] = [];
  const refBase = input.reference?.[base] ?? null;
  let anchor = 100;
  let previousIndex = 100;
  for (let pos = 0; pos < available.length; pos++) {
    const month = available[pos]!;
    // December link: new calendar-year weights from the previous twelve months.
    if (pos > 0 && month.endsWith('-01')) {
      anchor = previousIndex;
      const prior = available.slice(Math.max(0, pos - 12), pos);
      for (const { item } of weighted) {
        const st = state.get(item.id)!;
        st.relative = 1;
        st.weight = Math.max(0, sumSpend(item, prior));
      }
    }
    const activeTotal = [...state.values()].reduce((a, v) => a + v.weight, 0);
    let index = anchor;
    for (const { item } of weighted) {
      const st = state.get(item.id)!;
      const price = item.level[month];
      const before = st.relative;
      if (price != null && price > 0) {
        // Entry is linked at relative 1; a successor already has its predecessor's price.
        if (st.price > 0) st.relative *= price / st.price;
        st.price = price;
      }
      const share = activeTotal > 0 ? st.weight / activeTotal : 0;
      index += anchor * share * (st.relative - 1);
      st.contribution += anchor * share * (st.relative - before);
    }
    const ref = input.reference?.[month];
    points.push({
      month,
      index: round4(index),
      reference: refBase && ref !== undefined ? round4((100 * ref) / refBase) : null,
    });
    snapshots.set(month, new Map([...state].map(([id, st]) => [id, st.contribution])));
    previousIndex = index;
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

  // Monthly 12-month changes, personal against the reference (raw reference, any base).
  const indexAt = new Map(points.map((x) => [x.month, x.index]));
  const refRaw = input.reference ?? {};
  const monthly: InflationMonth[] = [];
  for (let i = 12; i < available.length; i++) {
    const m = available[i] as string;
    const before = available[i - 12] as string;
    const r = refRaw[m];
    const rb = refRaw[before];
    monthly.push({
      month: m,
      ownBp: bpOf(indexAt.get(before) as number, indexAt.get(m) as number),
      referenceBp: r !== undefined && rb !== undefined && rb > 0 ? bpOf(rb, r) : null,
    });
  }
  const latest = [...monthly].reverse().find((x) => x.referenceBp !== null);

  // December against December; for an unfinished year compare the latest same month.
  const years: InflationYear[] = [];
  for (const year of [...new Set(available.map((m) => Number(m.slice(0, 4))))]) {
    const own = points.filter((p) => p.month.startsWith(`${year}-`));
    const end = own.at(-1)!;
    const beforeMonth = addMonths(end.month, -12);
    const before = indexAt.get(beforeMonth);
    const ref = refRaw[end.month];
    const refBefore = refRaw[beforeMonth];
    const ownChangeBp = before ? bpOf(before, end.index) : null;
    const referenceChangeBp =
      ref !== undefined && refBefore !== undefined && refBefore > 0 ? bpOf(refBefore, ref) : null;
    years.push({
      year,
      throughMonth: end.month,
      ownMonths: own.length,
      referenceMonths: Object.keys(refRaw).filter((m) => m.startsWith(`${year}-`)).length,
      ownChangeBp,
      referenceChangeBp,
      differenceBp:
        ownChangeBp !== null && referenceChangeBp !== null ? ownChangeBp - referenceChangeBp : null,
    });
  }

  // Attribute the very same chained index increments, then reconcile hundredth-Pp rounding.
  const endStateTotal = [...state.values()].reduce((a, v) => a + v.weight, 0);
  const shares = shareBps(
    weighted.map(({ item }) => state.get(item.id)!.weight),
    endStateTotal,
  );
  const exact = weighted.map(
    ({ item }) =>
      (((snapshots.get(toMonth)?.get(item.id) ?? 0) -
        (snapshots.get(fromMonth)?.get(item.id) ?? 0)) /
        indexFrom) *
      10_000,
  );
  const rounded = exact.map(Math.floor);
  let remainder = inflationBp - rounded.reduce((a, v) => a + v, 0);
  const order = exact
    .map((v, i) => ({ i, rest: v - Math.floor(v) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    rounded[i]! += 1;
    remainder--;
  }
  const contributions: InflationContribution[] = weighted.map(({ item }, i) => {
    const prices = available
      .map((m) => item.level[m])
      .filter((v): v is number => v != null && v > 0);
    const atFrom =
      available
        .slice(0, available.indexOf(fromMonth) + 1)
        .map((m) => item.level[m])
        .filter((v): v is number => v != null && v > 0)
        .at(-1) ?? prices[0]!;
    return {
      id: item.id,
      name: item.categoryName ?? item.name,
      class: item.class,
      shareBp: shares[i] ?? 0,
      changeBp: bpOf(atFrom, prices.at(-1)!),
      contributionBp: rounded[i] ?? 0,
    };
  });
  const basket = weighted.map(({ item }, i) => {
    const history = available.flatMap((month) =>
      item.level[month] != null && item.level[month]! > 0
        ? [{ month, cents: item.level[month]! }]
        : [],
    );
    return {
      ...contributions[i]!,
      name: item.name,
      categoryId: item.categoryId ?? item.id,
      categoryName: item.categoryName ?? item.name,
      source: item.source ?? 'stored',
      baseCents: history[0]!.cents,
      nowCents: history.at(-1)!.cents,
      changeBp: bpOf(history[0]!.cents, history.at(-1)!.cents),
      history,
      successors: item.successors ?? [],
    };
  });
  const grouped = new Map<string, InflationContribution>();
  for (let i = 0; i < weighted.length; i++) {
    const item = weighted[i]!.item;
    const id = item.categoryId ?? item.id;
    const c = contributions[i]!;
    const old = grouped.get(id);
    if (old) {
      old.shareBp += c.shareBp;
      old.contributionBp += c.contributionBp;
      old.changeBp = old.shareBp ? Math.round((old.contributionBp * 10_000) / old.shareBp) : 0;
    } else grouped.set(id, { ...c, id });
  }

  return {
    status: 'ok',
    monthly,
    years,
    latestComparison:
      latest && latest.referenceBp !== null
        ? {
            month: latest.month,
            ownBp: latest.ownBp,
            referenceBp: latest.referenceBp,
            differenceBp: latest.ownBp - latest.referenceBp,
          }
        : null,
    points,
    baseMonth: base,
    fromMonth,
    toMonth,
    inflationBp,
    referenceBp,
    differenceBp: referenceBp === null ? null : inflationBp - referenceBp,
    indexFrom,
    indexTo,
    contributions: [...grouped.values()].sort((a, b) => b.contributionBp - a.contributionBp),
    contributionSumBp: contributions.reduce((a, c) => a + c.contributionBp, 0),
    basketItems: basket.length,
    basket,
    coverageBp: input.baseConsumptionCents > 0 ? ratioBp(total, input.baseConsumptionCents) : null,
  };
}

/** A same-category, same-rhythm non-overlapping successor within two periods is one item. */
export function linkInflationSuccessors(
  items: ReadonlyArray<InflationItem>,
  months: ReadonlyArray<string>,
): Array<InflationItem & { successors: string[] }> {
  const bounds = (item: InflationItem) => months.filter((m) => (item.level[m] ?? 0) > 0);
  const ordered = items
    .map((i) => ({
      ...i,
      level: { ...i.level },
      spend: { ...i.spend },
      successors: [] as string[],
    }))
    .sort(
      (a, b) => (bounds(a)[0] ?? '').localeCompare(bounds(b)[0] ?? '') || a.id.localeCompare(b.id),
    );
  const result: typeof ordered = [];
  for (const item of ordered) {
    const start = bounds(item)[0];
    const cycle = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 }[item.rhythm ?? 'monthly'];
    const candidates = result.filter((old) => {
      const end = bounds(old).at(-1);
      return (
        item.source !== 'trailing' &&
        old.source !== 'trailing' &&
        item.categoryId != null &&
        old.categoryId === item.categoryId &&
        old.rhythm === item.rhythm &&
        end &&
        start &&
        end < start &&
        start <= addMonths(end, 2 * cycle)
      );
    });
    if (candidates.length === 1) {
      const old = candidates[0]!;
      old.successors.push(item.name);
      for (const m of months) {
        if ((item.level[m] ?? 0) > 0) old.level[m] = item.level[m]!;
        old.spend[m] = (old.spend[m] ?? 0) + (item.spend[m] ?? 0);
      }
      if (item.source === 'bookings') old.source = 'bookings';
    } else result.push(item);
  }
  return result;
}

/** At least six regularly spaced charges; tolerate shifted due days and one missed period. */
export function implicitContractRhythm(charges: ReadonlyArray<ContractCharge>): Rhythm | null {
  const paid = charges
    .filter((c) => c.amountCents < 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (paid.length < 6) return null;
  const gaps = paid
    .slice(1)
    .map((c, i) => (Date.parse(c.date) - Date.parse(paid[i]!.date)) / 86_400_000);
  for (const [rhythm, days] of [
    ['monthly', 30.44],
    ['quarterly', 91.31],
    ['semiannual', 182.62],
    ['yearly', 365.25],
  ] as const)
    if (
      gaps.filter((g) => Math.abs(g - days) <= 12 || Math.abs(g - 2 * days) <= 12).length >=
      Math.ceil(gaps.length * 0.8)
    )
      return rhythm;
  return null;
}

/** Utilities: parallel billers, or a successor plus a large settlement. Explicit choice wins. */
export function useTrailingMean(
  charges: ReadonlyArray<ContractCharge & { payeeId: string | null }>,
  setting: boolean | null,
): boolean {
  if (setting !== null) return setting;
  const paid = charges.filter((c) => c.amountCents < 0);
  const byMonth = new Map<string, Set<string | null>>();
  for (const c of paid) {
    const m = c.date.slice(0, 7);
    byMonth.set(m, new Set([...(byMonth.get(m) ?? []), c.payeeId]));
  }
  if ([...byMonth.values()].filter((p) => p.size >= 2).length >= 2) return true;
  const values = paid.map((c) => -c.amountCents).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)] ?? 0;
  if (!values.some((v) => v > 3 * median)) return false;
  const billers = [...new Set(paid.map((c) => c.payeeId).filter((id) => id !== null))].map((id) => {
    const charges = paid
      .filter((c) => c.payeeId === id)
      .sort((a, b) => a.date.localeCompare(b.date));
    const rhythm = implicitContractRhythm(charges) ?? 'monthly';
    return {
      first: charges[0]!.date,
      last: charges.at(-1)!.date,
      cycle: { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 }[rhythm],
    };
  });
  return billers.some((old) =>
    billers.some(
      (next) =>
        old !== next &&
        old.last < next.first &&
        next.first.slice(0, 7) <= addMonths(old.last.slice(0, 7), 2 * old.cycle),
    ),
  );
}

/** All category charges, including credits; require twelve observed calendar months. */
export function trailingPriceLevels(
  months: ReadonlyArray<string>,
  charges: ReadonlyArray<ContractCharge>,
): Record<string, number | null> {
  const first = charges.map((c) => c.date.slice(0, 7)).sort()[0];
  return Object.fromEntries(
    months.map((m) => {
      const from = addMonths(m, -11);
      const total = charges
        .filter((c) => c.date.slice(0, 7) >= from && c.date.slice(0, 7) <= m)
        .reduce((a, c) => a - c.amountCents, 0);
      return [m, first && from >= first ? Math.round(total / 12) : null];
    }),
  );
}

/** A charge of an outflow contract: the matched booking's date and signed amount in cents. */
export interface ContractCharge {
  date: string;
  amountCents: number;
}

/**
 * The price history of a contract read from its charges (the matched bookings), for contracts
 * without stored price versions. Rule: refunds (amount >= 0) are ignored; the first charge opens
 * the history; a later charge opens a new price only when its amount differs from the current
 * price AND the next charge repeats it (a price that stays for at least two consecutive charges),
 * so one-off outliers never count. The newest charge alone is not trusted yet. Cents are absolute.
 */
export function derivePriceHistory(
  charges: ReadonlyArray<ContractCharge>,
): Array<{ validFrom: string; amountCents: number }> {
  const paid = charges
    .filter((c) => c.amountCents < 0)
    .map((c) => ({ date: c.date, cents: -c.amountCents }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const history: Array<{ validFrom: string; amountCents: number }> = [];
  paid.forEach((c, i) => {
    const current = history[history.length - 1]?.amountCents;
    if (current === undefined || (c.cents !== current && paid[i + 1]?.cents === c.cents))
      history.push({ validFrom: c.date, amountCents: c.cents });
  });
  return history;
}

/**
 * The price versions an inflation basket item is valued with. Stored versions win when they hold
 * a real history (two or more: one version is only the current price); otherwise the history is
 * derived from the charges, in the currency of the stored version (EUR without one).
 */
export function contractPrices(
  stored: ReadonlyArray<ContractVersion>,
  charges: ReadonlyArray<ContractCharge>,
): { versions: ReadonlyArray<ContractVersion>; source: 'stored' | 'bookings' } {
  if (stored.length >= 2) return { versions: stored, source: 'stored' };
  const derived = derivePriceHistory(charges);
  if (derived.length === 0) return { versions: stored, source: 'stored' };
  const currency = stored[0]?.currency ?? 'EUR';
  return { versions: derived.map((v) => ({ ...v, currency })), source: 'bookings' };
}
