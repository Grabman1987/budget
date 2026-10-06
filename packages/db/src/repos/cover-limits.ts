import { budgetAccountMoney, coverAvailability, monthOf, nextPayday } from '@budget/domain';
import { isNull } from 'drizzle-orm';
import { expectedOccurrence } from '../schema';
import { accountBalances, budgetLedger } from './queries';
import { loadFacts, scheduled, type RuleFacts } from './rule-inputs';
import type { Executor } from './types';

/** Signed budget-account money and the cover cap, read as of `today`. */
export function coverBudgetMoney(db: Executor, today: string, facts: RuleFacts) {
  const balances = new Map(accountBalances(db, today).map((a) => [a.accountId, a.balanceCents]));
  return budgetAccountMoney(
    facts.accounts.map((a) => ({ ...a, balanceCents: balances.get(a.id) ?? 0 })),
  );
}

/**
 * Shared inputs for source display, individual cover and bulk cover. No materialisation/writes.
 * Facts are always as of `today`; other months than today's get no commitments and no cap.
 */
export function coverCommitments(
  db: Executor,
  month: string,
  today: string,
  ledger: ReturnType<typeof budgetLedger> = budgetLedger(db),
  facts: RuleFacts = loadFacts(db, today, ledger),
) {
  const nextIncome = nextPayday(today).day;
  const current = month === monthOf(today);
  const capCents = current ? coverBudgetMoney(db, today, facts).coverCapCents : undefined;
  const onBudget = new Map(ledger.accounts.map((a) => [a.id, a]));
  const liveBookings = new Set(ledger.splits.map((s) => s.bookingId));
  const stored = new Map(
    db
      .select()
      .from(expectedOccurrence)
      .where(isNull(expectedOccurrence.deletedAt))
      .all()
      .map((o) => [`${o.expectedPaymentId}|${o.dueDate}`, o]),
  );
  const bookings = ledger.splits.filter((s) => {
    const a = onBudget.get(s.accountId);
    return a?.onBudget && s.date >= a.openingDate;
  });
  const near = (a: string, b: string) =>
    Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) <= 3 * 86_400_000;
  const matched = new Set<unknown>();
  const dues = scheduled(facts, today, nextIncome, today)
    .filter(
      (o) =>
        o.payment.kind === 'outflow' &&
        (o.payment.accountId === null || onBudget.get(o.payment.accountId)?.onBudget),
    )
    .filter((o) => stored.get(`${o.payment.id}|${o.dueDate}`)?.status !== 'missed')
    .map((o) => {
      const row = stored.get(`${o.payment.id}|${o.dueDate}`);
      const categoryId = o.category?.id ?? null;
      let booked = !!row?.bookingId && liveBookings.has(row.bookingId);
      if (!booked) {
        // An unlinked pending booking of the same category/amount around the due date is it.
        const twin = bookings.find(
          (b) =>
            !matched.has(b) &&
            b.status === 'pending' &&
            b.categoryId === categoryId &&
            b.amountCents === o.cents &&
            near(b.date, o.dueDate),
        );
        if (twin) {
          matched.add(twin);
          booked = true;
        }
      }
      return { categoryId, dueDate: o.dueDate, amountCents: o.cents, booked };
    });
  return (envelopes: Parameters<typeof coverAvailability>[0]) =>
    current
      ? coverAvailability(envelopes, bookings, dues, month, today, nextIncome, capCents)
      : envelopes.map((e) => ({
          categoryId: e.categoryId,
          committedCents: 0,
          freeCents: Math.max(0, e.availableCents),
        }));
}
