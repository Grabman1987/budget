import {
  contractBinding,
  monthlyEquivalent,
  personalInflation,
  toEurCents,
  versionOn,
  type ContractSource,
  type InflationItem,
  type PersonalInflation,
} from '@budget/domain';
import { contractSources } from './contracts-report';
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
  const { available } = reportMonths(db, today);
  const categories = spendCategories(db);
  const spend = tableSpendByMonth(reportTables(db, { today }), categories);
  const fixed = contractSources(db).filter(
    (s) => s.categoryKind === 'fixed' && s.categoryId !== null && contractBinding(s) === 'fixed',
  );
  const byCategory = new Map<string, ContractSource[]>();
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
        if ((p.startDate && p.startDate > day) || (p.endDate && p.endDate < day)) continue;
        const v = versionOn(p.versions, day);
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
