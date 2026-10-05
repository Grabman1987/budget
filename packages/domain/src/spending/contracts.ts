import { addDays, monthsBetween } from '../date';
import { monthlyEquivalent, versionOn, yearlyEquivalent } from '../schedule';
import type { Rhythm } from '../schedule';
import { toEurCents } from '../invest/invest';
import { mulDivRound, ratioBp } from '../wealth/int';

/**
 * Verträge und Abos (2.3) from expected outflow payments. A payment is a contract when its
 * category is a fixed cost, a minimum loan payment (debt, first stage) or a periodic cost; the
 * same selection as rule R10 (Fixkostenquote), so "gebunden je Monat" is exactly its numerator.
 * Terms like notice periods are not part of the ledger yet and are never invented here.
 */

export interface ContractVersion {
  validFrom: string;
  /** Amount per payment in `currency` (cents of that currency). */
  amountCents: number;
  currency: string;
}

export interface ContractSource {
  id: string;
  name: string;
  groupName: string;
  categoryId: string | null;
  payeeId?: string | null;
  categoryName: string | null;
  class: 'need' | 'want' | 'future' | null;
  categoryKind: string | null;
  categoryStage: number | null;
  rhythm: Rhythm;
  startDate: string | null;
  endDate: string | null;
  versions: ReadonlyArray<ContractVersion>;
  currentVersions?: ReadonlyArray<ContractVersion>;
}

export type ContractBinding = 'fixed' | 'periodic';

/** The role of a payment in the bound costs, or `null` when it is no contract. */
export function contractBinding(source: {
  categoryKind: string | null;
  categoryStage: number | null;
  endDate?: string | null;
  rhythm?: string;
}): ContractBinding | null {
  if (source.endDate != null || source.rhythm === 'once') return null;
  if (source.categoryKind === 'fixed') return 'fixed';
  if (source.categoryKind === 'periodic') return 'periodic';
  if (source.categoryKind === 'debt' && (source.categoryStage ?? 1) === 1) return 'fixed';
  return null;
}

/** EUR cents per unit of `currency` in micro-units on or before `day`; `null` when unknown. */
export type FxLookup = (currency: string, day: string) => number | null;

export interface ContractChange {
  from: string;
  previousCents: number | null;
  amountCents: number;
  currency: string;
  /** Change in basis points of the previous amount, only within one currency. */
  changeBp: number | null;
}

export interface ContractItem {
  id: string;
  name: string;
  groupName: string;
  categoryId: string | null;
  class: 'need' | 'want' | 'future' | null;
  rhythm: Rhythm;
  binding: ContractBinding;
  currency: string;
  /** Per payment in its own currency. */
  nativeCents: number;
  /** Per payment in EUR; `null` for a foreign currency without a rate. */
  eurCents: number | null;
  rateMicro: number | null;
  monthlyCents: number | null;
  yearlyCents: number | null;
  since: string | null;
  endDate: string | null;
  changes: ContractChange[];
  /** Increase within the last 12 months, for the hints. */
  recentIncrease: { from: string; changeBp: number; yearlyEffectCents: number | null } | null;
}

export interface ContractsOverview {
  asOf: string;
  items: ContractItem[];
  groups: string[];
  /** Fixed contracts per month. */
  fixedMonthlyCents: number;
  /** Periodic contracts per year. */
  periodicAnnualCents: number;
  /** fixedMonthly + periodicAnnual / 12. */
  boundMonthlyCents: number;
  yearlyCents: number;
  /** Contracts that could not be converted to EUR (foreign currency without a rate). */
  unconvertedCount: number;
}

/** Days of one payment cycle (a month counted as 31), the horizon of a contract that starts soon. */
const CYCLE_DAYS: Record<Rhythm, number> = {
  weekly: 7,
  monthly: 31,
  quarterly: 93,
  semiannual: 186,
  yearly: 372,
};

/**
 * The version a contract is valued with on `day`: the one in force, or - for a payment that has
 * its first due date still ahead - its first version. Expected payments are often entered with the
 * next due date as `startDate` and first `validFrom` (the schedule must not produce due dates in
 * the past, so the start cannot be moved back), although the contract itself runs for years; such
 * a payment is a contract from the day it is set up. Only a start within one payment cycle counts,
 * a payment that begins far ahead is not a contract yet. `undefined` after the end date.
 */
export function contractVersionOn<V extends { validFrom: string }>(
  payment: { rhythm: Rhythm; startDate: string | null; endDate: string | null },
  versions: ReadonlyArray<V>,
  day: string,
): V | undefined {
  if (payment.endDate && payment.endDate < day) return undefined;
  const started = !(payment.startDate && payment.startDate > day);
  const current = versionOn(versions, day);
  if (current && started) return current;
  const first = [...versions].sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0];
  if (!first) return undefined;
  const begin = [payment.startDate ?? '', first.validFrom].sort().pop() as string;
  if (begin > addDays(day, CYCLE_DAYS[payment.rhythm])) return undefined;
  return current ?? first;
}

const inForce = (s: ContractSource, day: string) => !(s.endDate && s.endDate < day);

function eurOf(
  cents: number,
  currency: string,
  day: string,
  fx: FxLookup,
): { eur: number | null; rate: number | null } {
  if (currency === 'EUR') return { eur: cents, rate: null };
  const rate = fx(currency, day);
  return rate === null ? { eur: null, rate: null } : { eur: toEurCents(cents, rate), rate };
}

function changesOf(versions: ReadonlyArray<ContractVersion>): ContractChange[] {
  const sorted = [...versions].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  return sorted.map((v, i) => {
    const before = sorted[i - 1];
    const comparable = before && before.currency === v.currency && before.amountCents > 0;
    return {
      from: v.validFrom,
      previousCents: before ? before.amountCents : null,
      amountCents: v.amountCents,
      currency: v.currency,
      changeBp: comparable ? ratioBp(v.amountCents - before.amountCents, before.amountCents) : null,
    };
  });
}

/** The contracts in force on `asOf`, with their monthly and yearly cost and price history. */
export function contractsOverview(
  asOf: string,
  sources: ReadonlyArray<ContractSource>,
  fx: FxLookup,
): ContractsOverview {
  const yearAgo = `${Number(asOf.slice(0, 4)) - 1}${asOf.slice(4)}`;
  const items: ContractItem[] = [];
  for (const s of sources) {
    const binding = contractBinding(s);
    if (!binding) continue;
    const v = contractVersionOn(s, s.currentVersions ?? s.versions, asOf);
    if (!v) continue;
    const { eur, rate } = eurOf(v.amountCents, v.currency, asOf, fx);
    const changes = changesOf(s.versions);
    const last = [...changes].reverse().find((c) => c.changeBp !== null && c.changeBp > 0);
    const latest = changes[changes.length - 1];
    const recent =
      last && last === latest && last.from > yearAgo && last.from <= asOf && last.previousCents
        ? {
            from: last.from,
            changeBp: last.changeBp as number,
            yearlyEffectCents:
              last.currency === 'EUR'
                ? yearlyEquivalent(s.rhythm, last.amountCents - last.previousCents)
                : null,
          }
        : null;
    items.push({
      id: s.id,
      name: s.name,
      groupName: s.groupName,
      categoryId: s.categoryId,
      class: s.class,
      rhythm: s.rhythm,
      binding,
      currency: v.currency,
      nativeCents: v.amountCents,
      eurCents: eur,
      rateMicro: rate,
      monthlyCents: eur === null ? null : monthlyEquivalent(s.rhythm, eur),
      yearlyCents: eur === null ? null : yearlyEquivalent(s.rhythm, eur),
      since: s.startDate ?? s.versions.map((x) => x.validFrom).sort()[0] ?? null,
      endDate: s.endDate,
      changes,
      recentIncrease: recent,
    });
  }
  const sum = (pick: (i: ContractItem) => number | null, binding: ContractBinding) =>
    items.filter((i) => i.binding === binding).reduce((a, i) => a + (pick(i) ?? 0), 0);
  const fixedMonthlyCents = sum((i) => i.monthlyCents, 'fixed');
  const periodicAnnualCents = sum((i) => i.yearlyCents, 'periodic');
  const boundMonthlyCents = fixedMonthlyCents + mulDivRound(periodicAnnualCents, 1, 12);
  const yearlyCents = fixedMonthlyCents * 12 + periodicAnnualCents;
  if (![fixedMonthlyCents, periodicAnnualCents, yearlyCents].every(Number.isSafeInteger))
    throw new RangeError('Contracts exceed safe integer cents');
  return {
    asOf,
    items,
    groups: [...new Set(items.map((i) => i.groupName))],
    fixedMonthlyCents,
    periodicAnnualCents,
    boundMonthlyCents,
    yearlyCents,
    unconvertedCount: items.filter((i) => i.eurCents === null).length,
  };
}

export interface ContractSeriesPoint {
  month: string;
  /** Fixed contracts per month in EUR at mid-month. */
  fixedMonthlyCents: number;
}

export interface ContractMarker {
  month: string;
  entries: Array<{
    name: string;
    previousCents: number | null;
    amountCents: number;
    currency: string;
  }>;
}

/**
 * Cost of the fixed contracts per month between `from` and `to` (months), valued at mid-month,
 * with a marker for every month in which a price changed or a contract started. A foreign
 * currency without a rate on that day is left out of that month and reported as partial.
 */
export function contractSeries(
  sources: ReadonlyArray<ContractSource>,
  from: string,
  to: string,
  fx: FxLookup,
): { points: ContractSeriesPoint[]; markers: ContractMarker[]; partial: boolean } {
  const fixed = sources.filter((s) => contractBinding(s) !== null);
  let partial = false;
  const points = monthsBetween(from, to).map((month) => {
    const day = `${month}-15`;
    let total = 0;
    for (const s of fixed) {
      if (!inForce(s, day) || (s.startDate && s.startDate.slice(0, 7) > month)) continue;
      const v = versionOn(s.versions, `${month}-31`);
      if (!v) continue;
      const { eur } = eurOf(v.amountCents, v.currency, day, fx);
      if (eur === null) {
        partial = true;
        continue;
      }
      total += monthlyEquivalent(s.rhythm, eur);
    }
    return { month, fixedMonthlyCents: total };
  });
  const byMonth = new Map<string, ContractMarker['entries']>();
  for (const s of fixed)
    for (const c of changesOf(s.versions)) {
      const month = c.from.slice(0, 7);
      // The first version of a contract that existed before the window is no event.
      if (month < from || month > to || (c.previousCents === null && month === from)) continue;
      byMonth.set(month, [
        ...(byMonth.get(month) ?? []),
        {
          name: s.name,
          previousCents: c.previousCents,
          amountCents: c.amountCents,
          currency: c.currency,
        },
      ]);
    }
  const markers = [...byMonth]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, entries]) => ({ month, entries }));
  return { points, markers, partial };
}

/** Average EUR per unit of a foreign currency in micro-units from what was paid; null without payments. */
export function averageRateMicro(paidEurCents: number, paidNativeCents: number): number | null {
  return paidNativeCents > 0 ? mulDivRound(paidEurCents, 1_000_000, paidNativeCents) : null;
}
