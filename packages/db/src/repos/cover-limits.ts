import { coverAvailability, nextPayday } from '@budget/domain';
import { isNull } from 'drizzle-orm';
import { expectedOccurrence } from '../schema';
import { budgetLedger } from './queries';
import { loadFacts, scheduled, type RuleFacts } from './rule-inputs';
import type { Executor } from './types';

/** Shared inputs for source display, individual cover and bulk cover. No materialisation/writes. */
export function coverCommitments(
  db: Executor,
  month: string,
  today: string,
  ledger: ReturnType<typeof budgetLedger> = budgetLedger(db),
  facts: RuleFacts = loadFacts(db, today, ledger),
) {
  const nextIncome = nextPayday(today).day;
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
  const dues = scheduled(facts, today, nextIncome, today)
    .filter(
      (o) =>
        o.payment.kind === 'outflow' &&
        (o.payment.accountId === null || onBudget.get(o.payment.accountId)?.onBudget),
    )
    .filter((o) => stored.get(`${o.payment.id}|${o.dueDate}`)?.status !== 'missed')
    .map((o) => {
      const row = stored.get(`${o.payment.id}|${o.dueDate}`);
      return {
        categoryId: o.category?.id ?? null,
        dueDate: o.dueDate,
        amountCents: o.cents,
        booked: !!row?.bookingId && liveBookings.has(row.bookingId),
      };
    });
  const bookings = ledger.splits.filter((s) => {
    const a = onBudget.get(s.accountId);
    return a?.onBudget && s.date >= a.openingDate;
  });
  return (envelopes: Parameters<typeof coverAvailability>[0]) =>
    coverAvailability(envelopes, bookings, dues, month, today, nextIncome);
}
