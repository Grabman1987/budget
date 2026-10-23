import {
  paymentsPreview,
  paymentsPreviewWindow,
  plannedExecutions,
  deduplicatePreviewSources,
  type PreviewPayment,
  type PlannedPreviewSource,
} from '@budget/domain';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import {
  account,
  booking,
  bookingSplit,
  savingsPlan,
  security,
  trade,
  category,
  expectedOccurrence,
  expectedPayment,
  expectedPaymentVersion,
} from '../schema';
import { schedulePayment, scheduleVersion } from './expected';
import { runInTransaction, type Executor } from './types';
import { readPaymentLifecycles, paymentOpenSuppressed } from './expected-lifecycle-invariants';
import {
  statementSettlementRead,
  statementLegacyKeys,
  statementOwnedBookingIds,
} from './statement-settlement-read';

/** Pure read: neither materialises occurrences nor refreshes status or audit. */
export function readPaymentsPreview(db: Executor, asOf: string) {
  return runInTransaction(db, (tx) => readPaymentsPreviewInSnapshot(tx, asOf));
}
function readPaymentsPreviewInSnapshot(db: Executor, asOf: string) {
  const { from, to } = paymentsPreviewWindow(asOf);
  const accepted = statementSettlementRead(db),
    replaced = statementLegacyKeys(db),
    owned = statementOwnedBookingIds(db);
  const versions = db
    .select()
    .from(expectedPaymentVersion)
    .where(isNull(expectedPaymentVersion.deletedAt))
    .all();
  const payments = db
    .select({
      payment: expectedPayment,
      categoryName: category.name,
      categoryClass: category.class,
      categoryKind: category.kind,
    })
    .from(expectedPayment)
    .leftJoin(category, eq(category.id, expectedPayment.categoryId))
    .where(and(isNull(expectedPayment.deletedAt), eq(expectedPayment.kind, 'outflow')))
    .all();
  const lifecycle = readPaymentLifecycles(
    db,
    payments.map((p) => p.payment.id),
  );
  const stored = db
    .select({
      paymentId: expectedOccurrence.expectedPaymentId,
      dueDate: expectedOccurrence.dueDate,
      occurrenceId: expectedOccurrence.id,
      status: expectedOccurrence.status,
      storedExpectedCents: expectedOccurrence.expectedAmountCents,
      bookingId: booking.id,
      storedBookingId: expectedOccurrence.bookingId,
      bookedAmountCents: booking.amountCents,
      bookedCurrency: booking.currency,
    })
    .from(expectedOccurrence)
    .leftJoin(booking, and(eq(booking.id, expectedOccurrence.bookingId), isNull(booking.deletedAt)))
    .where(
      and(
        isNull(expectedOccurrence.deletedAt),
        gte(expectedOccurrence.dueDate, from),
        lte(expectedOccurrence.dueDate, to),
      ),
    )
    .all()
    .filter(
      (row) =>
        !paymentOpenSuppressed(lifecycle.get(row.paymentId), {
          ...row,
          status: row.storedBookingId !== null && row.bookingId === null ? 'expected' : row.status,
        }),
    )
    .map(({ storedBookingId, ...row }) => {
      void storedBookingId; // Read-filter input only; preserve the existing public stored shape.
      return row;
    });
  const projected: PreviewPayment[] = payments.map(({ payment: p, ...c }) => ({
    ...schedulePayment(p, lifecycle.get(p.id)),
    id: p.id,
    name: p.name,
    ...c,
    versions: versions
      .filter((v) => v.expectedPaymentId === p.id)
      .map((v) => ({ ...scheduleVersion(v), currency: v.currency })),
  }));
  const accounts = new Map(
    db
      .select()
      .from(account)
      .where(isNull(account.deletedAt))
      .all()
      .map((a) => [a.id, a]),
  );
  const securities = new Map(
    db
      .select()
      .from(security)
      .where(isNull(security.deletedAt))
      .all()
      .map((s) => [s.id, s]),
  );
  const plans = db.select().from(savingsPlan).where(isNull(savingsPlan.deletedAt)).all();
  const linkedBookings = new Set(stored.flatMap((s) => (s.bookingId ? [s.bookingId] : [])));
  const future = db
    .select({ b: booking, split: bookingSplit })
    .from(booking)
    .innerJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
    .where(and(isNull(booking.deletedAt), gte(booking.date, from), lte(booking.date, to)))
    .all();
  const candidates: PlannedPreviewSource[] = [];
  const transfers = new Map<string, typeof future>();
  for (const r of future) {
    const id = r.split.transferId ?? r.b.transferId;
    if (id) transfers.set(id, [...(transfers.get(id) ?? []), r]);
  }
  for (const [id, legs] of transfers) {
    const debit = legs.filter((r) => r.split.amountCents < 0);
    if (debit.length === 0 || debit.some((r) => linkedBookings.has(r.b.id) || owned.has(r.b.id)))
      continue;
    const first = debit[0]!;
    const target = legs.find((r) => r.b.accountId !== first.b.accountId && r.split.amountCents > 0);
    if (!target || !accounts.has(first.b.accountId) || !accounts.has(target.b.accountId)) continue;
    candidates.push({
      id: `transfer:${id}`,
      name: `Umbuchung · ${accounts.get(first.b.accountId)!.name} → ${accounts.get(target.b.accountId)!.name}`,
      date: first.b.date,
      amountCents: -debit.reduce((a, r) => a + r.split.amountCents, 0),
      currency: first.b.currency,
      sourceAccountId: first.b.accountId,
      targetAccountId: target.b.accountId,
      bookingId: first.b.id,
      source: 'transfer',
    });
  }
  const futureExecutions = db
    .select()
    .from(trade)
    .where(and(isNull(trade.deletedAt), gte(trade.date, from), lte(trade.date, to)))
    .all();
  const window = paymentsPreviewWindow(asOf);
  for (const month of window.months)
    for (const execution of plannedExecutions(plans, month)) {
      const p = plans.find((p) => p.id === execution.planId)!;
      const a = accounts.get(p.accountId);
      if (!a || !securities.has(p.securityId)) continue;
      if (
        futureExecutions.some(
          (t) =>
            t.savingsPlanId &&
            t.savingsMonth === month &&
            t.accountId === p.accountId &&
            t.securityId === p.securityId &&
            t.bookingId &&
            linkedBookings.has(t.bookingId),
        )
      )
        continue;
      candidates.push({
        id: `savings:${p.accountId}:${p.securityId}:${month}`,
        name: `Sparplan · ${securities.get(p.securityId)!.name}`,
        date: execution.date,
        amountCents: execution.amountCents,
        currency: a.currency,
        sourceAccountId: p.sourceAccountId,
        targetAccountId: a.referenceAccountId ?? a.id,
        source: 'savings',
      });
    }
  for (const s of deduplicatePreviewSources(candidates)) {
    projected.push({
      id: s.source === 'savings' ? s.id.slice(0, -8) : s.id,
      name: s.name,
      categoryName: null,
      categoryClass: 'future',
      categoryKind: 'invest',
      kind: 'outflow',
      contactShareBp: 0,
      rhythm: 'monthly',
      dueDay: Number(s.date.slice(8)),
      dueMonth: null,
      dateShift: 'none',
      startDate: s.date,
      endDate: s.date,
      versions: [
        {
          validFrom: s.date,
          amountCents: s.amountCents,
          amountMaxCents: null,
          currency: s.currency,
        },
      ],
    });
  }
  const result = paymentsPreview(
    asOf,
    projected,
    stored
      .map((s) => ({
        ...s,
        status: replaced.has(s.paymentId + '|' + s.dueDate)
          ? 'skipped'
          : s.bookingId === null && (s.status === 'received' || s.status === 'deviating')
            ? 'expected'
            : s.status,
      }))
      .concat(
        [...replaced]
          .filter((key) => !stored.some((s) => s.paymentId + '|' + s.dueDate === key))
          .map((key) => {
            const [paymentId, dueDate] = key.split('|') as [string, string];
            return {
              paymentId,
              dueDate,
              occurrenceId: 'statement-replacement:' + key,
              status: 'skipped' as const,
              storedExpectedCents: 0,
              bookingId: null,
              bookedAmountCents: null,
              bookedCurrency: null,
            };
          }),
      ),
  );
  if (accepted.settlements.length === 0) return result;
  return {
    ...result,
    statementTransfers: accepted.settlements.flatMap((r) =>
      (r.state === 'open' || r.state === 'represented') && r.debitDate >= from && r.debitDate <= to
        ? [
            {
              id: r.id,
              date: r.debitDate,
              amountCents: r.payableCents,
              currency: r.currency,
              fundingAccountId: r.fundingAccountId,
              cardAccountId: r.cardAccountId,
              state: r.state,
            },
          ]
        : [],
    ),
  };
}
