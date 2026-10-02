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
import { fxRateOnOrBefore } from './prices';
import { budgetOfMonths, reportMonths, spendByMonth, spendCategories } from './spending-report';
import type { Executor } from './types';

/**
 * Persönliche Inflation (2.4). The basket holds the fixed-cost categories whose price the ledger
 * knows: the stored price versions of their expected payments, valued per month in EUR. Variable
 * categories are not in the basket (quantity and price cannot be separated) and neither is a
 * reference index: no consumer price series is stored, so there is nothing to compare with yet.
 */

export interface InflationReport extends PersonalInflation {
  /** Consumption categories (Bedarf, Wunsch) that are not in the basket. */
  excludedCategories: number;
  /** A reference index (VPI) is stored; always `false` until a source exists. */
  referenceAvailable: boolean;
}

export function inflationReport(db: Executor, today: string): InflationReport {
  const { available } = reportMonths(db, today);
  const categories = spendCategories(db);
  const spend = spendByMonth(budgetOfMonths(db, available), categories);
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
  const result = personalInflation({ available, items, baseConsumptionCents });
  const inBasket = new Set(result.contributions.map((c) => c.id));
  return {
    ...result,
    excludedCategories: categories.filter((c) => c.class !== 'future' && !inBasket.has(c.id))
      .length,
    referenceAvailable: false,
  };
}
