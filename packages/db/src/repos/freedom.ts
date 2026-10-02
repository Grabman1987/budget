import {
  DEFAULT_REAL_RETURN_BP,
  freedomAnnualSpendCents,
  freedomProgressBp,
  freedomTargetCents,
  monthOf,
  monthsBetween,
  resolveParams,
} from '@budget/domain';
import { isNull, eq, and } from 'drizzle-orm';
import { account, category, rule } from '../schema';
import { netWorthValuationAsOf } from './portfolio';
import { budget } from './queries';
import { referenceMonth } from './rule-inputs';
import {
  freedomExpenseMonths,
  freedomInvestedCents,
  freedomInvestmentAccounts,
} from './freedom-inputs';
import type { Executor } from './types';

export interface FreedomView {
  asOf: string;
  refMonth: string;
  months: { month: string; consumptionCents: number | null }[];
  annualSpendCents: number | null;
  multiple: number;
  targetCents: number | null;
  investedCents: number | null;
  progressBp: number | null;
  defaultRealReturnBp: number;
  expensesUnsafe: boolean;
  accounts: {
    id: string;
    name: string;
    valueCents: number | null;
    missingPrice: boolean;
    missingFxCurrencies: string[];
  }[];
}

/** Quote-independent expense basis; unknown investment values never become zero. */
export function freedomView(db: Executor, asOf: string): FreedomView {
  const accounts = db.select().from(account).where(isNull(account.deletedAt)).all();
  const categories = db.select().from(category).where(isNull(category.deletedAt)).all();
  const starts = accounts.filter((a) => a.onBudget).map((a) => monthOf(a.openingDate));
  const first = starts.reduce((a, m) => (m < a ? m : a), monthOf(asOf));
  const budgetByMonth = new Map(
    starts.length ? budget(db, monthsBetween(first, monthOf(asOf))).map((m) => [m.month, m]) : [],
  );
  const refMonth = referenceMonth(asOf);
  const months = freedomExpenseMonths({ categories, budgetByMonth }, refMonth);
  const raw = db
    .select()
    .from(rule)
    .where(and(eq(rule.code, 'R16'), isNull(rule.deletedAt)))
    .get();
  let params: unknown = {};
  try {
    const parsed: unknown = JSON.parse(raw?.paramsJson ?? '{}');
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) params = parsed;
  } catch {
    /* As in the rule book, malformed stored JSON uses the existing defaults. */
  }
  const multiple = resolveParams('R16', params)['multiple'] as number;
  let annualSpendCents: number | null = null;
  if (months.every((m) => m.consumptionCents !== null)) {
    try {
      annualSpendCents = freedomAnnualSpendCents(months.map((m) => m.consumptionCents!));
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
    }
  }
  const target = annualSpendCents === null ? null : freedomTargetCents(annualSpendCents, multiple);
  const targetCents = target !== null && Number.isSafeInteger(target) ? target : null;
  const valuation = netWorthValuationAsOf(db, asOf);
  const sources = freedomInvestmentAccounts(accounts, asOf).map((a) => {
    const value = valuation.byAccount[a.id] ?? null;
    return {
      id: a.id,
      name: a.name,
      valueCents: value !== null && Number.isSafeInteger(value) ? value : null,
      missingPrice: !!valuation.missingPriceByAccount[a.id]?.length,
      missingFxCurrencies: valuation.missingFxByAccount[a.id] ?? [],
    };
  });
  const invested = freedomInvestedCents(
    accounts,
    asOf,
    Object.fromEntries(sources.map((a) => [a.id, a.valueCents])),
  );
  const investedCents = invested !== null && Number.isSafeInteger(invested) ? invested : null;
  const progress =
    investedCents !== null && targetCents !== null && targetCents > 0 && months.length > 0
      ? freedomProgressBp(investedCents, targetCents)
      : null;
  return {
    asOf,
    refMonth,
    months,
    annualSpendCents,
    multiple,
    targetCents,
    investedCents,
    progressBp: progress !== null && Number.isSafeInteger(progress) ? progress : null,
    defaultRealReturnBp: DEFAULT_REAL_RETURN_BP,
    expensesUnsafe: annualSpendCents === null || targetCents === null,
    accounts: sources,
  };
}
