import {
  budgetMonths,
  monthOf,
  monthsBetween,
  type BudgetInput,
  type BudgetMonth,
  type CardRule,
  type LedgerSplit,
} from '@budget/domain';
import { and, asc, count, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { account, booking, bookingSplit, budgetMonth, category } from '../schema';
import { assignedByMonth } from './envelopes';
import { assertEurBudgetAccounts } from './account-invariants';
import { memoizedShared } from './request-memo';
import type { Executor } from './types';

/**
 * Read models for the domain layer. They are aggregate queries without N+1 that ignore
 * soft-deleted bookings, accounts and categories; splits count through their live parent booking.
 * The arithmetic itself lives in `@budget/domain`.
 */

export interface AccountBalance {
  accountId: string;
  balanceCents: number;
}

/**
 * Balance per live account (by `sort_order`) as of `asOfDate` (default: all bookings), by the one
 * opening-date rule of the domain (`balanceOn`, C5): 0 before the opening date, afterwards the
 * opening balance plus every booking dated on or after the opening date.
 */
export function accountBalances(db: Executor, asOfDate?: string): AccountBalance[] {
  const sum = sql`${account.openingBalanceCents} + COALESCE(SUM(${booking.amountCents}), 0)`;
  const balance =
    asOfDate === undefined
      ? sum
      : sql`CASE WHEN ${account.openingDate} <= ${asOfDate} THEN ${sum} ELSE 0 END`;
  return db
    .select({ accountId: account.id, balanceCents: sql<number>`${balance}`.mapWith(Number) })
    .from(account)
    .leftJoin(
      booking,
      and(
        eq(booking.accountId, account.id),
        isNull(booking.deletedAt),
        gte(booking.date, account.openingDate),
        asOfDate === undefined ? undefined : lte(booking.date, asOfDate),
      ),
    )
    .where(isNull(account.deletedAt))
    .groupBy(account.id)
    .orderBy(asc(account.sortOrder), asc(account.name), asc(account.id))
    .all();
}

/**
 * Everything `budgetMonths` needs, read in five queries: live accounts and categories, the splits
 * of live bookings on live accounts with the account of the other transfer leg, assigned amounts
 * and held amounts. Transfer legs are whole bookings (`booking.transfer_id`) or single splits
 * (`booking_split.transfer_id`); both kinds are resolved here.
 */
export function budgetLedger(db: Executor): Omit<BudgetInput, 'months'> {
  // One read per request and database state; every reader of the ledger only filters and sums it.
  return memoizedShared(db, 'budgetLedger', () => readBudgetLedger(db));
}

function readBudgetLedger(db: Executor): Omit<BudgetInput, 'months'> {
  assertEurBudgetAccounts(db);
  const accounts = db
    .select({
      id: account.id,
      onBudget: account.onBudget,
      openingBalanceCents: account.openingBalanceCents,
      openingDate: account.openingDate,
    })
    .from(account)
    .where(isNull(account.deletedAt))
    .all();
  const categories = db
    .select({
      id: category.id,
      name: category.name,
      class: category.class,
      kind: category.kind,
      rolloverOverspending: category.rolloverOverspending,
      cardAccountId: category.cardAccountId,
      openingAvailableCents: category.openingAvailableCents,
    })
    .from(category)
    .where(isNull(category.deletedAt))
    .all();
  const rows = db
    .select({
      bookingId: booking.id,
      payeeId: booking.payeeId,
      status: booking.status,
      accountId: booking.accountId,
      date: booking.date,
      incomeNextMonth: booking.incomeNextMonth,
      bookingTransferId: booking.transferId,
      splitTransferId: bookingSplit.transferId,
      amountCents: bookingSplit.amountCents,
      categoryId: bookingSplit.categoryId,
    })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .innerJoin(account, eq(account.id, booking.accountId))
    .where(and(isNull(booking.deletedAt), isNull(account.deletedAt)))
    .all();
  // Legs per transfer: (booking id, account) of a whole-booking leg or of a split's booking.
  const legs = new Map<string, { bookingId: string; accountId: string }[]>();
  const addLeg = (transferId: string, bookingId: string, accountId: string) => {
    const list = legs.get(transferId) ?? [];
    if (!list.some((l) => l.bookingId === bookingId)) list.push({ bookingId, accountId });
    legs.set(transferId, list);
  };
  for (const r of rows) {
    if (r.bookingTransferId) addLeg(r.bookingTransferId, r.bookingId, r.accountId);
    if (r.splitTransferId) addLeg(r.splitTransferId, r.bookingId, r.accountId);
  }
  const partnerOf = (transferId: string | null, bookingId: string) =>
    transferId === null
      ? null
      : (legs.get(transferId)?.find((l) => l.bookingId !== bookingId)?.accountId ?? null);
  const splits: LedgerSplit[] = rows.map((r) => ({
    bookingId: r.bookingId,
    payeeId: r.payeeId,
    status: r.status,
    accountId: r.accountId,
    date: r.date,
    incomeNextMonth: r.incomeNextMonth,
    amountCents: r.amountCents,
    categoryId: r.categoryId,
    transferAccountId: partnerOf(r.splitTransferId ?? r.bookingTransferId, r.bookingId),
  }));
  const held = Object.fromEntries(
    db
      .select({ month: budgetMonth.month, heldCents: budgetMonth.heldCents })
      .from(budgetMonth)
      .where(isNull(budgetMonth.deletedAt))
      .all()
      .map((r) => [r.month, r.heldCents]),
  );
  const openingCarry = Object.fromEntries(
    categories
      .filter((c) => c.openingAvailableCents !== 0)
      .map((c) => [c.id, c.openingAvailableCents]),
  );
  return { accounts, categories, splits, assigned: assignedByMonth(db), held, openingCarry };
}

/**
 * The budget of `months` (consecutive `YYYY-MM`): envelopes and "Zu verteilen" per month. It is
 * always computed from the budget start (the first opening month of a budget account), where the
 * opening envelopes apply, and then cut to the requested months. `cardRule` (default `'ynab'`)
 * lets the reconciliation of the parallel run show the concept rule next to it.
 */
export function budget(
  db: Executor,
  months: string[],
  options: { cardRule?: CardRule; asOf?: string } = {},
): BudgetMonth[] {
  return budgetOfLedger(budgetLedger(db), months, options);
}

/** `budget` on a ledger the caller already read (several budgets of one request share one read). */
export function budgetOfLedger(
  source: Omit<BudgetInput, 'months'>,
  months: string[],
  options: { cardRule?: CardRule; asOf?: string } = {},
): BudgetMonth[] {
  const ledger = options.asOf
    ? { ...source, splits: source.splits.filter((s) => s.date <= options.asOf!) }
    : source;
  const first = months[0];
  if (first === undefined) return [];
  const start = ledger.accounts
    .filter((a) => a.onBudget)
    .map((a) => monthOf(a.openingDate))
    .reduce((a, m) => (m < a ? m : a), first);
  const all = monthsBetween(start, months[months.length - 1] as string);
  // The budget is computed from its start through the last requested month. Readers of one ledger
  // object (one request) that ask for the same span and options share that computation.
  const key = `${all[0]}|${all[all.length - 1]}|${options.cardRule ?? ''}|${options.asOf ?? ''}`;
  let computed = budgetResults.get(source);
  if (!computed) budgetResults.set(source, (computed = new Map()));
  let result = computed.get(key);
  if (!result) {
    result = budgetMonths({ ...ledger, months: all, ...options });
    computed.set(key, result);
  }
  return result.filter((m) => months.includes(m.month));
}

const budgetResults = new WeakMap<object, Map<string, BudgetMonth[]>>();

/** Number of live bookings per account (accounts without bookings are omitted). */
export function bookingCountByAccount(db: Executor): { accountId: string; count: number }[] {
  return db
    .select({ accountId: booking.accountId, count: count() })
    .from(booking)
    .where(isNull(booking.deletedAt))
    .groupBy(booking.accountId)
    .orderBy(asc(booking.accountId))
    .all();
}
