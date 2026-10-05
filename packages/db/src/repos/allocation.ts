import {
  addMonths,
  assignedMonth,
  incomeBudgetMonth,
  householdIncomeCents,
  type AllocMonth,
  type AssignedCategory,
  type BudgetMonth,
} from '@budget/domain';
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import {
  account,
  booking,
  bookingSplit,
  category,
  expectedPayment,
  expectedPaymentVersion,
  INCOME_TYPES,
  rule,
} from '../schema';
import { budget } from './queries';
import { assertEurBudgetAccounts } from './account-invariants';
import { incomeGroupOf } from './report-ledger';
import type { Executor } from './types';

/** Uncategorized inflows and live income-category splits contribute to income read models. */
export function isIncomeCategorySplit(categoryId: string | null, categoryKind: string | null) {
  return categoryId === null || categoryKind === 'income';
}

/**
 * Read model for 50/30/20 (C11): what counts in `month` (`YYYY-MM`), ready for the domain's
 * `allocation`. Port of the prototype's `alloc` inputs:
 * - regular income = uncategorised inflows and live income-category splits on budget accounts,
 *   excluding transfer legs, Kapitalerträge, Erstattungen and the income type "Sonderzahlung"; special payments count as
 *   twelfths of the expected yearly
 *   special payments (expected inflows with a yearly rhythm);
 * - periodic categories count as twelfths of their planned yearly payments;
 * - categories with a windfall share (rule R12) count their planned monthly payment plus that share
 *   of the special payments as twelfths;
 * - every other spending category counts its envelope activity of the month.
 */
export function allocationMonth(
  db: Executor,
  month: string,
  /** The month's envelopes when the caller already computed the budget (saves a recomputation). */
  precomputed?: BudgetMonth['envelopes'],
): AllocMonth {
  assertEurBudgetAccounts(db);
  const year = month.slice(0, 4);
  const envelopes = precomputed ?? budget(db, [month])[0]?.envelopes ?? {};
  const spent = (categoryId: string) => -(envelopes[categoryId]?.activityCents ?? 0);

  const versions = db
    .select()
    .from(expectedPaymentVersion)
    .where(isNull(expectedPaymentVersion.deletedAt))
    .all();
  const payments = db.select().from(expectedPayment).where(isNull(expectedPayment.deletedAt)).all();
  /** Amount of an expected payment on a day: the latest version that started on or before it. */
  const amountOn = (paymentId: string, date: string) =>
    versions
      .filter((v) => v.expectedPaymentId === paymentId && v.validFrom <= date)
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0]?.amountCents ?? 0;
  const due = (p: { dueMonth: number | null }, day: number) =>
    `${year}-${String(p.dueMonth).padStart(2, '0')}-${day}`;

  const specialAnnual = payments
    .filter((p) => p.kind === 'inflow' && p.rhythm === 'yearly')
    .reduce((a, p) => a + amountOn(p.id, due(p, 15)), 0);
  const r12 = db.select().from(rule).where(eq(rule.code, 'R12')).get();
  const windfall =
    (JSON.parse(r12?.paramsJson ?? '{}') as { windfallShares?: Record<string, number> })
      .windfallShares ?? {};

  const regularIncome = db
    .select({
      cents: bookingSplit.amountCents,
      incomeTypeId: bookingSplit.incomeTypeId,
      date: booking.date,
      incomeNextMonth: booking.incomeNextMonth,
      categoryId: bookingSplit.categoryId,
      categoryKind: category.kind,
      contactId: bookingSplit.contactId,
      openingDate: account.openingDate,
    })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .innerJoin(account, eq(account.id, booking.accountId))
    .leftJoin(category, and(eq(category.id, bookingSplit.categoryId), isNull(category.deletedAt)))
    .where(
      and(
        isNull(booking.deletedAt),
        isNull(account.deletedAt),
        eq(account.onBudget, true),
        // Unary plus: keep SQLite from walking the (almost all NULL) transfer indexes instead of
        // the date range below, which is ~3x faster here.
        sql`+${booking.transferId} is null`,
        sql`+${bookingSplit.transferId} is null`,
        // Income counts in its booking month or, flagged `incomeNextMonth`, in the month after:
        // nothing outside these two months can match the filter below (index on `booking.date`).
        gte(booking.date, `${addMonths(month, -1)}-01`),
        lte(booking.date, `${month}-31`),
      ),
    )
    .all()
    .filter(
      (s) =>
        isIncomeCategorySplit(s.categoryId, s.categoryKind) &&
        s.contactId === null &&
        s.date >= s.openingDate &&
        incomeBudgetMonth(s.date, s.incomeNextMonth) === month &&
        s.cents > 0 &&
        s.incomeTypeId !== INCOME_TYPES.special.id &&
        householdIncomeCents(s.cents, s.incomeTypeId, incomeGroupOf(s.incomeTypeId)) !== 0,
    )
    .reduce((a, s) => a + s.cents, 0);

  const categories = db.select().from(category).where(isNull(category.deletedAt)).all();
  const counted: AssignedCategory[] = categories.flatMap((c): AssignedCategory[] => {
    if (!c.class) return []; // income, card payment and advance have no class
    if (c.kind === 'periodic') {
      const annual = payments
        .filter((p) => p.categoryId === c.id && p.rhythm === 'yearly')
        .reduce((a, p) => a + amountOn(p.id, due(p, 12)), 0);
      return [
        { class: c.class, kind: 'periodic', actualCents: spent(c.id), annualPlannedCents: annual },
      ];
    }
    const share = windfall[c.id.replace(/^cat-/, '')];
    if (share !== undefined) {
      const regular = payments
        .filter((p) => p.categoryId === c.id)
        .reduce((a, p) => a + amountOn(p.id, `${month}-15`), 0);
      return [
        {
          class: c.class,
          kind: 'windfall',
          actualCents: spent(c.id),
          regularCents: regular,
          windfallShare: share,
        },
      ];
    }
    return [{ class: c.class, kind: 'regular', actualCents: spent(c.id) }];
  });

  return assignedMonth({
    regularIncomeCents: regularIncome,
    specialIncomeAnnualCents: specialAnnual,
    categories: counted,
  });
}
