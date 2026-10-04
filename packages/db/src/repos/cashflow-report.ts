import {
  monthHouseholdIncome,
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
import { account, booking, bookingSplit, INCOME_TYPES } from '../schema';
import { reportTables } from './report-tables';
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

  const tables = reportTables(db, { today });
  const source = new Map(tables.months.map((m) => [m.month, m]));
  const classIds = (cls: 'need' | 'want' | 'future') =>
    tables.categories.filter((c) => c.class === cls).map((c) => c.id);
  const spendByMonth = new Map(
    range.map((month) => {
      const spent = (cls: 'need' | 'want' | 'future') =>
        classIds(cls).reduce((sum, id) => sum + (source.get(month)?.spending[id] ?? 0), 0);
      return [month, { need: spent('need'), want: spent('want'), future: spent('future') }];
    }),
  );
  const income = new Map(
    range.map((month) => [
      month,
      source.has(month) ? monthHouseholdIncome(source.get(month)!, tables) : 0,
    ]),
  );
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
