import {
  adherenceMonth,
  allocation,
  lastDayOfMonth,
  monthOf,
  monthsBetween,
  planDeviation,
  type AdherenceInput,
  type AdherenceMonth,
  type Allocation,
  type PlanDeviationRow,
} from '@budget/domain';
import { allocationMonth } from './allocation';
import { INCOME_TYPES } from '../schema';
import { budgetOfMonths, reportMonths, spendCategories } from './spending-report';
import type { Executor } from './types';

/**
 * Budgettreue und 50/30/20 (2.2). Plan is the money assigned in Plan > Monat; 50/30/20 is the
 * shared assigned-money allocation (periodic costs and windfall transfers as twelfths, SPEC §4),
 * with household income only: Kapitalerträge and Erstattungen are not income here (owner
 * decision 02.10.2026), transfers and contact repayments never are.
 */

export interface AllocationRow {
  month: string;
  needCents: number;
  wantCents: number;
  futureCents: number;
  incomeCents: number;
  /** Income minus the three classes; negative = spent from savings. */
  restCents: number;
  shares: Allocation['shares'];
}

export interface BudgetAdherenceReport extends AdherenceMonth {
  month: string;
  /** `ok`: the month is in the budget; the others explain why there is nothing to show. */
  status: 'ok' | 'before_start' | 'future' | 'no_budget';
  /** The month is not over yet: Ist counts up to `liveUntil`. */
  live: boolean;
  liveUntil: string | null;
  firstMonth: string | null;
  lastMonth: string;
  allocation: AllocationRow[];
  deviation: { from: string | null; to: string | null; rows: PlanDeviationRow[] };
}

const HOUSEHOLD_EXCLUDED = [INCOME_TYPES.capital.id, INCOME_TYPES.refund.id];

export function budgetAdherence(db: Executor, today: string, month: string): BudgetAdherenceReport {
  const { first, through, available } = reportMonths(db, today);
  const thisMonth = monthOf(today);
  const base = {
    month,
    live: false,
    liveUntil: null,
    firstMonth: first,
    lastMonth: thisMonth,
    items: [],
    groups: [],
    overCount: 0,
    planCents: 0,
    istCents: 0,
    restCents: 0,
    allocation: [],
    deviation: { from: null, to: null, rows: [] },
  };
  if (first === null) return { ...base, status: 'no_budget' };
  if (month < first) return { ...base, status: 'before_start' };
  if (month > thisMonth) return { ...base, status: 'future' };

  const categories = spendCategories(db).filter(
    (c): c is typeof c & { class: 'need' | 'want' } => c.class !== 'future',
  );
  const months = monthsBetween(first, month > through ? month : through);
  const budgetMonths = budgetOfMonths(db, months);
  const byMonth = new Map(budgetMonths.map((m) => [m.month, m]));
  const inputs = (m: string): AdherenceInput[] =>
    categories.map((c) => {
      const e = byMonth.get(m)?.envelopes[c.id];
      return {
        id: c.id,
        name: c.name,
        groupName: c.groupName,
        class: c.class,
        kind: c.kind ?? 'variable',
        assignedCents: e?.assignedCents ?? 0,
        carryCents: e?.carryCents ?? 0,
        spendCents: e && e.activityCents !== 0 ? -e.activityCents : 0,
      };
    });

  const selected = adherenceMonth(inputs(month));
  const live = month === thisMonth && today < lastDayOfMonth(month);

  // 50/30/20: twelve months ending at the selected month, but never a month that is not over.
  const end = month > through ? through : month;
  const window = available.filter((m) => m <= end).slice(-12);
  const allocationRows: AllocationRow[] = window.map((m) => {
    const alloc = allocation([
      allocationMonth(db, m, byMonth.get(m)?.envelopes, {
        excludeIncomeTypeIds: HOUSEHOLD_EXCLUDED,
      }),
    ]);
    return {
      month: m,
      needCents: alloc.needCents,
      wantCents: alloc.wantCents,
      futureCents: alloc.futureCents,
      incomeCents: alloc.incomeCents,
      restCents: alloc.restCents,
      shares: alloc.shares,
    };
  });

  // Deviation: the last twelve full months, whatever month is selected.
  const k12 = available.slice(-12);
  const deviationRows = planDeviation(k12.map(inputs));
  return {
    ...selected,
    month,
    status: 'ok',
    live,
    liveUntil: live ? today : null,
    firstMonth: first,
    lastMonth: thisMonth,
    allocation: allocationRows,
    deviation: {
      from: k12[0] ? `${k12[0]}-01` : null,
      to: k12.length ? lastDayOfMonth(k12[k12.length - 1] as string) : null,
      rows: deviationRows,
    },
  };
}
