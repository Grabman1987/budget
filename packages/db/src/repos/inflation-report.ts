import { isNull } from 'drizzle-orm';
import { category } from '../schema';
import {
  implicitContractRhythm,
  derivePriceHistory,
  useTrailingMean,
  trailingPriceLevels,
  contractPrices,
  monthlyEquivalent,
  personalInflation,
  toEurCents,
  versionOn,
  type ContractVersion,
  type InflationItem,
  type PersonalInflation,
} from '@budget/domain';
import { contractSources } from './contracts-report';
import { matchedCharges } from './contract-history';
import { overviewData } from './report-ledger';
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
  excluded: Array<{ id: string; name: string; reason: string }>;
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

export function inflationReport(db: Executor, today: string): InflationReport {
  const categories = spendCategories(db);
  const spend = tableSpendByMonth(reportTables(db, { today }), categories);
  // The index starts with the first month that has spending: an opening-balance month before it
  // holds no prices and would leave the basket empty.
  const months = reportMonths(db, today).available;
  const first = months.findIndex((m) => Object.values(spend[m] ?? {}).some((v) => v !== 0));
  const available = first < 0 ? months : months.slice(first);
  const derivedContracts: InflationReport['derivedContracts'] = [];
  const ledger = overviewData(db);
  const settings = new Map(
    db
      .select()
      .from(category)
      .where(isNull(category.deletedAt))
      .all()
      .map((c) => [c.id, c.inflationTrailingMean]),
  );
  const charged = new Map<
    string,
    { bookingId: string; date: string; amountCents: number; payeeId: string | null; name: string }[]
  >();
  for (const split of ledger.splits) {
    if (split.kind !== 'spend' || !split.categoryId || split.date > today) continue;
    const own = charged.get(split.categoryId) ?? [];
    const existing = own.find((r) => r.bookingId === split.bookingId);
    if (existing) existing.amountCents -= split.amountCents;
    else
      own.push({
        bookingId: split.bookingId,
        date: split.date,
        amountCents: -split.amountCents,
        payeeId: split.payeeId,
        name: split.payeeName ?? 'Ohne Empfänger',
      });
    charged.set(split.categoryId, own);
  }
  const fixed = contractSources(db)
    .filter(
      (s) =>
        s.categoryKind === 'fixed' &&
        s.categoryId !== null &&
        (s.endDate === null || s.endDate !== s.startDate),
    )
    .map((s) => {
      const charges = matchedCharges(db, s.id, s.versions[0]?.currency ?? 'EUR').filter(
        (c) => c.date <= today,
      );
      const { versions, source } = contractPrices(s.versions, charges);
      if (source === 'bookings')
        derivedContracts.push({ id: s.id, name: s.name, source, prices: [...versions] });
      const lastCharge = charges
        .filter((c) => c.amountCents < 0)
        .map((c) => c.date)
        .sort()
        .at(-1);
      const ended = lastCharge && lastCharge.slice(0, 7) < available.at(-1)!;
      return {
        ...s,
        versions,
        derived: source === 'bookings',
        charges,
        endDate: source === 'bookings' && ended ? lastCharge! : s.endDate,
      };
    });
  for (const c of categories.filter((c) => c.kind === 'fixed')) {
    const own = charged.get(c.id) ?? [];
    for (const payeeId of new Set(own.map((r) => r.payeeId))) {
      if (payeeId === null) continue;
      if (fixed.some((s) => s.categoryId === c.id && s.payeeId === payeeId)) continue;
      const charges = own.filter((r) => r.payeeId === payeeId);
      const rhythm = implicitContractRhythm(charges);
      if (!rhythm) continue;
      const versions = derivePriceHistory(charges).map((v) => ({ ...v, currency: 'EUR' }));
      const lastCharge: string = charges
        .filter((r) => r.amountCents < 0)
        .map((r) => r.date)
        .sort()
        .at(-1)!;
      const id = `implicit:${c.id}:${payeeId ?? 'none'}`;
      const name = charges[0]!.name;
      derivedContracts.push({ id, name, source: 'bookings', prices: versions });
      fixed.push({
        id,
        name,
        categoryId: c.id,
        payeeId,
        categoryName: c.name,
        groupName: c.groupName ?? 'Ohne Gruppe',
        categoryKind: c.kind ?? 'fixed',
        categoryStage: null,
        class: c.class,
        rhythm,
        startDate: versions[0]?.validFrom ?? null,
        endDate: lastCharge.slice(0, 7) < available.at(-1)! ? lastCharge : null,
        versions,
        derived: true,
        charges,
      });
    }
  }
  const cache = new Map<string, number | null>();
  const rateOn = (currency: string, day: string) => {
    const key = `${currency}|${day}`;
    if (!cache.has(key)) cache.set(key, fxRateOnOrBefore(db, currency, day)?.rateMicro ?? null);
    return cache.get(key) ?? null;
  };
  const items: InflationItem[] = [];
  for (const category of categories.filter((c) => c.kind === 'fixed')) {
    const categoryId = category.id;
    const allCharges = charged.get(categoryId) ?? [];
    if (useTrailingMean(allCharges, settings.get(categoryId) ?? null)) {
      items.push({
        id: categoryId,
        categoryId,
        categoryName: category.name,
        name: category.name,
        class: category.class,
        source: 'trailing',
        level: trailingPriceLevels(available, allCharges),
        spend: Object.fromEntries(available.map((m) => [m, spend[m]?.[categoryId] ?? 0])),
      });
      continue;
    }
    for (const p of fixed.filter((p) => p.categoryId === categoryId)) {
      const level: Record<string, number | null> = {};
      for (const month of available) {
        const day = `${month}-15`;
        const v =
          (!p.derived && p.startDate && p.startDate.slice(0, 7) > month) ||
          (p.endDate && p.endDate.slice(0, 7) < month)
            ? undefined
            : versionOn(p.versions, `${month}-31`);
        const rate = v && v.currency !== 'EUR' ? rateOn(v.currency, day) : null;
        level[month] =
          v && (v.currency === 'EUR' || rate !== null)
            ? monthlyEquivalent(
                p.rhythm,
                v.currency === 'EUR' ? v.amountCents : toEurCents(v.amountCents, rate!),
              )
            : null;
      }
      items.push({
        id: p.id,
        name: p.name,
        categoryId,
        categoryName: category.name,
        rhythm: p.rhythm,
        class: category.class,
        source: p.derived ? 'bookings' : 'stored',
        level,
        spend: Object.fromEntries(
          available.map((m) => [
            m,
            allCharges
              .filter((r) => r.payeeId === p.payeeId && r.date.startsWith(m))
              .reduce((a, r) => a - r.amountCents, 0),
          ]),
        ),
      });
    }
  }
  const firstPrice = Math.max(
    0,
    available.findIndex((m) => items.some((i) => (i.level[m] ?? 0) > 0)),
  );
  const base = available.slice(firstPrice, firstPrice + 12);
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
  const excluded = categories
    .filter((c) => c.class !== 'future' && !inBasket.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      reason:
        c.kind !== 'fixed'
          ? 'Variable Kategorie: Menge und Preis nicht trennbar'
          : 'Kein regelmäßiger Preis mit ausreichender Buchungshistorie',
    }));
  return {
    ...result,
    excludedCategories: excluded.length,
    excluded,
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
