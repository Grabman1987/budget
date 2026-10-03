import {
  cashflowChartMonths,
  cashflowMonth,
  cashflowTotals,
  cashflowWindow,
  monthOf,
  monthsBetween,
  type CashflowMonth,
  type CashflowTotals,
  type Period,
} from '@budget/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { account, booking, bookingSplit, category, INCOME_TYPES } from '../schema';
import { isIncomeCategorySplit } from './allocation';
import { budget } from './queries';
import type { Executor } from './types';

/**
 * Report 3.2 Cashflow-Verlauf: household income, consumption (Bedarf, Wunsch) and Zukunft per full
 * month of the budget accounts, with Kapitalerträge as a separate series (owner decision
 * 02.10.2026: dividends and interest are not household income). Spending comes from the same
 * `budget` envelopes as Plan and Heute, income from the splits of live bookings on budget accounts;
 * transfers, refunds (income type Erstattungen) and contact repayments are never income.
 */

export interface CashflowReport {
  period: Period;
  /** Last day of the data: the running month is not part of it. */
  asOf: string;
  /** `YYYY-MM` of the first budget month; `null` without a budget account. */
  firstMonth: string | null;
  /** Months of the Zeitraum (full months only). */
  windowMonths: string[];
  /** Months of the charts: the window, or the last 12 when the window is shorter than 6 months. */
  months: (CashflowMonth & { inWindow: boolean })[];
  totals: CashflowTotals;
}

export function cashflowReport(db: Executor, today: string, period: Period): CashflowReport {
  const starts = db
    .select({ openingDate: account.openingDate })
    .from(account)
    .where(and(isNull(account.deletedAt), eq(account.onBudget, true)))
    .all()
    .map((a) => monthOf(a.openingDate));
  const firstMonth = starts.length ? starts.reduce((a, m) => (m < a ? m : a)) : null;
  const empty: CashflowReport = {
    period,
    asOf: today,
    firstMonth,
    windowMonths: [],
    months: [],
    totals: cashflowTotals([]),
  };
  if (firstMonth === null) return empty;
  const windowMonths = cashflowWindow(period, today, firstMonth);
  const chartMonths = period.includes('..')
    ? windowMonths
    : cashflowChartMonths(windowMonths, today, firstMonth);
  if (chartMonths.length === 0) return { ...empty, windowMonths };
  const range = monthsBetween(
    chartMonths[0] as string,
    chartMonths[chartMonths.length - 1] as string,
  );

  const categories = new Map(
    db
      .select()
      .from(category)
      .where(isNull(category.deletedAt))
      .all()
      .map((c) => [c.id, c]),
  );
  const spendByMonth = new Map(
    budget(db, range, period.includes('..') ? { asOf: today } : {}).map((m) => {
      const spent = (cls: 'need' | 'want' | 'future') =>
        [...categories.values()]
          .filter((c) => c.class === cls)
          .reduce((a, c) => a - (m.envelopes[c.id]?.activityCents ?? 0), 0);
      return [m.month, { need: spent('need'), want: spent('want'), future: spent('future') }];
    }),
  );

  const income = new Map<string, number>();
  const capital = new Map<string, number>();
  const rows = db
    .select({
      cents: bookingSplit.amountCents,
      incomeTypeId: bookingSplit.incomeTypeId,
      date: booking.date,
      categoryId: bookingSplit.categoryId,
      onBudget: account.onBudget,
    })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .innerJoin(account, eq(account.id, booking.accountId))
    .where(
      and(
        isNull(booking.deletedAt),
        isNull(account.deletedAt),
        isNull(booking.transferId),
        isNull(bookingSplit.transferId),
      ),
    )
    .all();
  const first = range[0] as string;
  const last = range[range.length - 1] as string;
  for (const s of rows) {
    const month = monthOf(s.date);
    if (s.cents <= 0 || month < first || month > last || (period.includes('..') && s.date > today))
      continue;
    if (s.incomeTypeId === INCOME_TYPES.capital.id) {
      // Dividends and interest count wherever they were booked, but never as household income.
      capital.set(month, (capital.get(month) ?? 0) + s.cents);
      continue;
    }
    if (!s.onBudget || s.incomeTypeId === INCOME_TYPES.refund.id) continue;
    const kind = s.categoryId === null ? null : (categories.get(s.categoryId)?.kind ?? null);
    if (!isIncomeCategorySplit(s.categoryId, kind)) continue;
    income.set(month, (income.get(month) ?? 0) + s.cents);
  }

  const inWindow = new Set(windowMonths);
  const months = range.map((month) => {
    const spend = spendByMonth.get(month) ?? { need: 0, want: 0, future: 0 };
    return {
      ...cashflowMonth({
        month,
        incomeCents: income.get(month) ?? 0,
        needCents: spend.need,
        wantCents: spend.want,
        futureCents: spend.future,
        capitalCents: capital.get(month) ?? 0,
      }),
      inWindow: inWindow.has(month),
    };
  });
  return {
    period,
    asOf: today,
    firstMonth,
    windowMonths,
    months,
    totals: cashflowTotals(months.filter((m) => m.inWindow)),
  };
}
