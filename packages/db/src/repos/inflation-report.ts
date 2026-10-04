import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  contractBinding,
  contractPrices,
  monthlyEquivalent,
  personalInflation,
  toEurCents,
  versionOn,
  type ContractVersion,
  type InflationItem,
  type PersonalInflation,
} from '@budget/domain';
import { booking, bookingSplit, expectedOccurrence, expectedPayment } from '../schema';
import { contractSources } from './contracts-report';
import { bookedAmountIn } from './expected-links';
import { cpiMonths, currentCpiSeries } from './cpi';
import { fxRateOnOrBefore } from './prices';
import { reportTables } from './report-tables';
import { reportMonths, spendCategories, tableSpendByMonth } from './spending-report';
import type { Executor } from './types';

/**
 * Persönliche Inflation (2.4). The basket holds the fixed-cost categories whose price the ledger
 * knows: the stored price versions of their expected payments, valued per month in EUR. Variable
 * categories are not in the basket (quantity and price cannot be separated). The comparison is the
 * Statistik Austria consumer price index (VPI, open data) as far as the market run has stored it;
 * without a stored series the report shows its own index alone.
 */

export interface InflationReport extends PersonalInflation {
  /** Consumption categories (Bedarf, Wunsch) that are not in the basket. */
  excludedCategories: number;
  /** A reference index (VPI) is stored. */
  referenceAvailable: boolean;
  /** The stored consumer price series: its key, source, last read and newest month. */
  reference: { series: string; source: string; fetchedAt: string | null; lastMonth: string } | null;
  /**
   * Why there is no own index: fewer than 13 closed months, or no fixed contract with a price
   * version and spending in the first twelve months (`null` when the index exists).
   */
  insufficientReason: 'months' | 'basket' | null;
  /** Contracts without a stored price history, priced from their matched bookings instead. */
  derivedContracts: { id: string; name: string; source: 'bookings'; prices: ContractVersion[] }[];
  /** The stored consumer price index alone: its 12-month change in the newest month, when stored. */
  referenceLatest: { month: string; changeBp: number } | null;
}

/** 12-month change of the newest stored month, basis points; `null` without the month a year before. */
function latestChange(months: Record<string, number>): InflationReport['referenceLatest'] {
  const latest = Object.keys(months).sort().at(-1);
  if (!latest) return null;
  const before = months[`${Number(latest.slice(0, 4)) - 1}${latest.slice(4)}`];
  const now = months[latest] as number;
  return before && before > 0
    ? { month: latest, changeBp: Math.round((now / before - 1) * 10_000) }
    : null;
}

/**
 * The live bookings matched to a contract's occurrences, in the contract's currency. Without any
 * linked occurrence (imported contracts) the history comes from the live bookings of the same
 * payee with a split in the contract's category: that split's amount, transfers excluded.
 */
function matchedCharges(db: Executor, paymentId: string, currency: string) {
  const linked = db
    .select({ date: booking.date, b: booking })
    .from(expectedOccurrence)
    .innerJoin(booking, eq(booking.id, expectedOccurrence.bookingId))
    .where(
      and(
        eq(expectedOccurrence.expectedPaymentId, paymentId),
        inArray(expectedOccurrence.status, ['received', 'deviating']),
        isNull(expectedOccurrence.deletedAt),
        isNull(booking.deletedAt),
      ),
    )
    .all()
    .map((r) => ({ date: r.date, amountCents: bookedAmountIn(r.b, currency) }));
  if (linked.length > 0) return linked;
  const p = db.select().from(expectedPayment).where(eq(expectedPayment.id, paymentId)).get();
  if (!p?.payeeId || !p.categoryId) return linked;
  const perBooking = new Map<string, { date: string; amountCents: number }>();
  const rows = db
    .select({ b: booking, split: bookingSplit.amountCents })
    .from(booking)
    .innerJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
    .where(
      and(
        eq(booking.payeeId, p.payeeId),
        eq(bookingSplit.categoryId, p.categoryId),
        isNull(booking.deletedAt),
        isNull(booking.transferId),
        isNull(bookingSplit.transferId),
      ),
    )
    .all();
  for (const { b, split } of rows) {
    // A foreign-currency charge keeps its split's share of the original amount (integer cents).
    const amountCents =
      b.currency === currency || b.originalCurrency !== currency || b.originalAmountCents === null
        ? split
        : Math.round((split * b.originalAmountCents) / b.amountCents);
    const sum = perBooking.get(b.id);
    if (sum) sum.amountCents += amountCents;
    else perBooking.set(b.id, { date: b.date, amountCents });
  }
  return [...perBooking.values()];
}

export function inflationReport(db: Executor, today: string): InflationReport {
  const categories = spendCategories(db);
  const spend = tableSpendByMonth(reportTables(db, { today }), categories);
  // The index starts with the first month that has spending: an opening-balance month before it
  // holds no prices and would leave the basket empty.
  const months = reportMonths(db, today).available;
  const first = months.findIndex((m) => Object.values(spend[m] ?? {}).some((v) => v !== 0));
  const available = first < 0 ? months : months.slice(first);
  const derivedContracts: InflationReport['derivedContracts'] = [];
  const fixed = contractSources(db)
    .filter(
      (s) => s.categoryKind === 'fixed' && s.categoryId !== null && contractBinding(s) === 'fixed',
    )
    .map((s) => {
      const charges = matchedCharges(db, s.id, s.versions[0]?.currency ?? 'EUR');
      const { versions, source } = contractPrices(s.versions, charges);
      if (source === 'bookings')
        derivedContracts.push({ id: s.id, name: s.name, source, prices: [...versions] });
      return { ...s, versions, derived: source === 'bookings' };
    });
  const byCategory = new Map<string, (typeof fixed)[number][]>();
  for (const s of fixed)
    byCategory.set(s.categoryId as string, [...(byCategory.get(s.categoryId as string) ?? []), s]);
  const cache = new Map<string, number | null>();
  const rateOn = (currency: string, day: string) => {
    const key = `${currency}|${day}`;
    if (!cache.has(key)) cache.set(key, fxRateOnOrBefore(db, currency, day)?.rateMicro ?? null);
    return cache.get(key) ?? null;
  };
  const items: InflationItem[] = [];
  for (const [categoryId, payments] of byCategory) {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) continue;
    const level: Record<string, number | null> = {};
    const own: Record<string, number> = {};
    for (const month of available) {
      const day = `${month}-15`;
      let total = 0;
      let any = false;
      for (const p of payments) {
        // A derived history is the truth from its first charge on (the imported start date is
        // not), and a charge anywhere in the month prices the month: the base month can be filled.
        if ((!p.derived && p.startDate && p.startDate > day) || (p.endDate && p.endDate < day))
          continue;
        const v = versionOn(p.versions, p.derived ? `${month}-31` : day);
        if (!v) continue;
        let eur = v.amountCents;
        if (v.currency !== 'EUR') {
          const rate = rateOn(v.currency, day);
          if (rate === null) continue;
          eur = toEurCents(v.amountCents, rate);
        }
        total += monthlyEquivalent(p.rhythm, eur);
        any = true;
      }
      level[month] = any ? total : null;
      own[month] = spend[month]?.[categoryId] ?? 0;
    }
    items.push({ id: categoryId, name: category.name, class: category.class, level, spend: own });
  }
  const base = available.slice(0, 12);
  const baseConsumptionCents = categories
    .filter((c) => c.class !== 'future')
    .reduce((a, c) => a + base.reduce((s, m) => s + (spend[m]?.[c.id] ?? 0), 0), 0);
  const series = currentCpiSeries(db);
  const stored = series ? cpiMonths(db, series) : null;
  const result = personalInflation({
    available,
    items,
    baseConsumptionCents,
    reference: stored?.months ?? null,
  });
  const inBasket = new Set(result.contributions.map((c) => c.id));
  return {
    ...result,
    excludedCategories: categories.filter((c) => c.class !== 'future' && !inBasket.has(c.id))
      .length,
    referenceAvailable: stored !== null,
    derivedContracts,
    insufficientReason: result.status === 'ok' ? null : available.length < 13 ? 'months' : 'basket',
    referenceLatest: stored ? latestChange(stored.months) : null,
    reference:
      series && stored
        ? {
            series,
            source: stored.source ?? 'statistik_austria',
            fetchedAt: stored.fetchedAt,
            lastMonth: Object.keys(stored.months).sort().at(-1) as string,
          }
        : null,
  };
}
