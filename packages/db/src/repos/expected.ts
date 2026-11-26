import {
  addDays,
  amountGap,
  addMonths,
  candidateFits,
  lastDayOfMonth,
  monthOf,
  monthlyEquivalent,
  occurrences,
  settleMatches,
  versionOn,
  versionSuggestion,
  yearlyEquivalent,
  type AssignInput,
  type BookingFacts,
  type MatchCandidate,
  type Occurrence,
  type SchedulePayment,
  type ScheduleVersion,
  type VersionSuggestion,
} from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { assertStatementExpectedLink, statementOwnedBookingIds } from './statement-settlement-read';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, ne, or } from 'drizzle-orm';
import {
  account,
  booking,
  bookingSplit,
  category,
  contact,
  expectedOccurrence,
  expectedPayment,
  expectedPaymentPause,
  expectedPaymentVersion,
  incomeType,
  payee,
} from '../schema';
import {
  insertTracked,
  updateTracked,
  withGroup,
  type AuditContext,
  type GroupedContext,
} from './audit';
import { createEntity, getEntity, restoreEntity, softDeleteEntity, updateEntity } from './entities';
import type { NewRow, RowPatch } from './entities';
import { ConflictError, EntityNotFoundError } from './errors';
import {
  bankPayeeFacts,
  closeStaleLinkProposals,
  ensureLinkProposal,
  isRejectedPair,
  previouslyLinkedBookingIds,
  rejectedBookingIds,
  rejectedOccurrenceIds,
  rejectedLinkPairs,
  resolveLinkProposals,
  RESOLUTION_AUTO,
  RESOLUTION_LINKED,
  RESOLUTION_MISSED,
} from './expected-auto-link';
import {
  bookedAmountIn,
  expectedLinkPatches,
  expectedLinkedStatus,
  assertBookingUnclaimed,
  mixedReceiptShareCents,
} from './expected-links';
import { runInTransaction, type Executor } from './types';
import {
  readPaymentLifecycles,
  assertPaymentDeletable,
  assertPaymentReview,
  assertPaymentPauseRanges,
  isPaymentLifecycleDay,
  paymentDateSuppressed,
  paymentOpenSuppressed,
  type PaymentLifecycle,
} from './expected-lifecycle-invariants';

export { bookedAmountIn } from './expected-links';

/**
 * Expected payments (Erwartete Zahlungen, concept §3.3): versions, occurrences and their matching
 * to bookings. The schedule and the matching rules live in `@budget/domain`; this file stores the
 * result. Occurrences are materialised from the first day of last month to the end of the month
 * twelve months ahead; `refreshOccurrences` is idempotent (unique payment + due date). All writes
 * are audited and `undo`-able, also the ones of `refresh`/`match` (actor `system`).
 *
 * Amounts of an occurrence are signed (outflow negative) and stay in the currency of the version
 * (`expected_payment_version.currency`); a booking in another currency is compared by its
 * original amount when that has the version's currency.
 */

export const SYSTEM_ACTOR: AuditContext = { actor: 'system' };

type Payment = typeof expectedPayment.$inferSelect;
type Version = typeof expectedPaymentVersion.$inferSelect;
type OccurrenceRow = typeof expectedOccurrence.$inferSelect;

export interface VersionInput {
  /** First day the amount applies (`YYYY-MM-DD`). */
  validFrom: string;
  /** Positive cents; the payment's kind gives the sign. */
  amountCents: number;
  amountMaxCents?: number | null;
  currency?: string;
  note?: string | null;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** Materialisation window: last month (for late matches) up to twelve months ahead. */
export function occurrenceHorizon(today: string): { from: string; to: string } {
  return {
    from: `${addMonths(monthOf(today), -1)}-01`,
    to: lastDayOfMonth(addMonths(monthOf(today), 12)),
  };
}

export const schedulePayment = (p: Payment, lifecycle?: PaymentLifecycle): SchedulePayment => ({
  kind: p.kind,
  rhythm: p.rhythm,
  dueDay: p.dueDay,
  dueMonth: p.dueMonth,
  dateShift: p.dateShift,
  startDate: p.startDate,
  endDate: p.endDate,
  intervalWeeks: p.intervalWeeks,
  contactShareBp: p.contactShareBp,
  pauses: lifecycle?.pauses ?? [],
});

export const scheduleVersion = (v: Version): ScheduleVersion => ({
  validFrom: v.validFrom,
  amountCents: v.amountCents,
  amountMaxCents: v.amountMaxCents,
});

function liveVersions(db: Executor, paymentId: string): Version[] {
  return db
    .select()
    .from(expectedPaymentVersion)
    .where(
      and(
        eq(expectedPaymentVersion.expectedPaymentId, paymentId),
        isNull(expectedPaymentVersion.deletedAt),
      ),
    )
    .orderBy(asc(expectedPaymentVersion.validFrom))
    .all();
}

function versionsByPayment(db: Executor, paymentIds?: string[]): Map<string, Version[]> {
  const rows = db
    .select()
    .from(expectedPaymentVersion)
    .where(
      and(
        isNull(expectedPaymentVersion.deletedAt),
        paymentIds ? inArray(expectedPaymentVersion.expectedPaymentId, paymentIds) : undefined,
      ),
    )
    .orderBy(asc(expectedPaymentVersion.validFrom))
    .all();
  const map = new Map<string, Version[]>();
  for (const v of rows) map.set(v.expectedPaymentId, [...(map.get(v.expectedPaymentId) ?? []), v]);
  return map;
}

const livePayment = (db: Executor, id: string): Payment => {
  const row = getEntity(db, expectedPayment, id);
  if (!row) throw new EntityNotFoundError('expected_payment', id);
  return row;
};

// ---------------------------------------------------------------------------------------------
// Re-planning of occurrences
// ---------------------------------------------------------------------------------------------

export interface ReplanResult {
  created: number;
  updated: number;
  removed: number;
}

/**
 * Bring the occurrences of one payment in line with its schedule and versions. Creates missing
 * ones (also the ones an undo soft-deleted: they come back as `expected`), re-plans amounts of
 * future `expected` rows and removes future `expected` rows that are no longer due. Matched,
 * missed and past rows are history and stay as they are; so does a `skipped` (gestrichen) row: it
 * is a decision of the owner, never re-planned, removed or revived as `expected` here. A deleted payment has no plan.
 */
function replanPayment(
  tx: Executor,
  payment: Payment,
  today: string,
  ctx: GroupedContext,
  suppliedLifecycle?: PaymentLifecycle,
  lifecycleOnly = false,
): ReplanResult {
  const result: ReplanResult = { created: 0, updated: 0, removed: 0 };
  const { from, to } = occurrenceHorizon(today);
  const versions = liveVersions(tx, payment.id);
  const lifecycle = suppliedLifecycle ?? readPaymentLifecycles(tx, [payment.id]).get(payment.id);
  const desired =
    payment.deletedAt === null
      ? occurrences(schedulePayment(payment, lifecycle), versions.map(scheduleVersion), from, to)
      : [];
  const existing = new Map(
    tx
      .select()
      .from(expectedOccurrence)
      .where(eq(expectedOccurrence.expectedPaymentId, payment.id))
      .all()
      // A moved occurrence (#1360) is identified by its rule date, not by the chosen day.
      .map((row) => [row.plannedDueDate ?? row.dueDate, row]),
  );
  const wanted = new Set<string>();
  for (const occ of desired) {
    wanted.add(occ.dueDate);
    if (lifecycleOnly) continue;
    const row = existing.get(occ.dueDate);
    if (!row) {
      insertTracked(
        tx,
        expectedOccurrence,
        {
          id: randomUUID(),
          expectedPaymentId: payment.id,
          dueDate: occ.dueDate,
          expectedAmountCents: occ.amountCents,
          contactShareCents: occ.contactShareCents,
          status: 'expected',
        },
        ctx,
      );
      result.created++;
    } else if (
      row.deletedAt !== null &&
      row.dueDate >= today &&
      row.bookingId === null &&
      row.status === 'expected' &&
      lifecycle?.revivableOccurrenceIds.has(row.id)
    ) {
      updateTracked(
        tx,
        expectedOccurrence,
        [row.id],
        {
          deletedAt: null,
          status: 'expected',
          bookingId: null,
          expectedAmountCents: occ.amountCents,
          contactShareCents: occ.contactShareCents,
        },
        ctx,
        'restore',
      );
      result.created++;
    } else if (
      row.deletedAt === null &&
      row.status === 'expected' &&
      row.bookingId === null &&
      row.dueDate >= today &&
      (row.expectedAmountCents !== occ.amountCents ||
        row.contactShareCents !== occ.contactShareCents)
    ) {
      updateTracked(
        tx,
        expectedOccurrence,
        [row.id],
        { expectedAmountCents: occ.amountCents, contactShareCents: occ.contactShareCents },
        ctx,
      );
      result.updated++;
    }
  }
  for (const row of existing.values()) {
    if (
      row.deletedAt === null &&
      row.status === 'expected' &&
      row.bookingId === null &&
      row.dueDate >= today &&
      (lifecycleOnly
        ? paymentDateSuppressed(lifecycle, row.dueDate)
        : !wanted.has(row.plannedDueDate ?? row.dueDate))
    ) {
      updateTracked(
        tx,
        expectedOccurrence,
        [row.id],
        { deletedAt: new Date().toISOString() },
        ctx,
        'delete',
      );
      result.removed++;
    }
  }
  return result;
}

/**
 * Materialise and re-plan the occurrences of every live payment for `today`. Idempotent: a second
 * run changes nothing. Payments that were deleted have their future `expected` rows removed.
 */
export function refreshOccurrences(
  db: Executor,
  today: string,
  ctx: AuditContext = SYSTEM_ACTOR,
): ReplanResult {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const total: ReplanResult = { created: 0, updated: 0, removed: 0 };
    for (const { id, patch } of expectedLinkPatches(tx))
      updateTracked(tx, expectedOccurrence, [id], patch, grouped);
    const payments = tx.select().from(expectedPayment).all();
    const lifecycle = readPaymentLifecycles(
      tx,
      payments.map((p) => p.id),
    );
    for (const payment of payments) {
      // Soft-deleted payments only matter while they still have future rows to remove.
      if (payment.deletedAt !== null) {
        const open = tx
          .select({ id: expectedOccurrence.id })
          .from(expectedOccurrence)
          .where(
            and(
              eq(expectedOccurrence.expectedPaymentId, payment.id),
              isNull(expectedOccurrence.deletedAt),
              eq(expectedOccurrence.status, 'expected'),
              gte(expectedOccurrence.dueDate, today),
            ),
          )
          .get();
        if (!open) continue;
      }
      const r = replanPayment(tx, payment, today, grouped, lifecycle.get(payment.id));
      total.created += r.created;
      total.updated += r.updated;
      total.removed += r.removed;
    }
    return total;
  });
}

// ---------------------------------------------------------------------------------------------
// Payments and versions
// ---------------------------------------------------------------------------------------------

export type ExpectedPaymentInput = NewRow<typeof expectedPayment>;
export type ExpectedPaymentPatch = RowPatch<typeof expectedPayment>;

const cleanName = (name: string): string => {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (trimmed === '') throw new ConflictError('An expected payment needs a name');
  return trimmed;
};

function insertVersion(
  tx: Executor,
  paymentId: string,
  input: VersionInput,
  ctx: GroupedContext,
): Version {
  const clash = tx
    .select({ id: expectedPaymentVersion.id, deletedAt: expectedPaymentVersion.deletedAt })
    .from(expectedPaymentVersion)
    .where(
      and(
        eq(expectedPaymentVersion.expectedPaymentId, paymentId),
        eq(expectedPaymentVersion.validFrom, input.validFrom),
      ),
    )
    .get();
  if (clash)
    throw new ConflictError(
      clash.deletedAt === null
        ? `There is already a version from ${input.validFrom}; versions are never edited, pick another day`
        : `A version from ${input.validFrom} was undone; pick another day`,
    );
  if (input.amountCents <= 0) throw new ConflictError('The amount of a version must be positive');
  return insertTracked(
    tx,
    expectedPaymentVersion,
    {
      id: randomUUID(),
      expectedPaymentId: paymentId,
      validFrom: input.validFrom,
      amountCents: input.amountCents,
      amountMaxCents: input.amountMaxCents ?? null,
      currency: input.currency ?? 'EUR',
      note: input.note ?? null,
    },
    ctx,
  );
}

/** Create a payment with its first version and plan its occurrences. */
export function createExpectedPayment(
  db: Executor,
  input: ExpectedPaymentInput,
  version: VersionInput,
  ctx: AuditContext,
  today: string,
): { payment: Payment; version: Version; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const payment = createEntity(
      tx,
      expectedPayment,
      { ...input, name: cleanName(input.name) },
      grouped,
    );
    if (payment.rhythm === 'weekly' && !payment.startDate)
      throw new ConflictError('Wöchentliche Zahlungen brauchen ein Startdatum.');
    const first = insertVersion(tx, payment.id, version, grouped);
    replanPayment(tx, payment, today, grouped);
    return { payment, version: first, groupId: grouped.groupId };
  });
}

/** Change a payment (schedule, counterparty, tolerance …) and re-plan its future occurrences. */
export function updateExpectedPayment(
  db: Executor,
  id: string,
  patch: ExpectedPaymentPatch,
  ctx: AuditContext,
  today: string,
): { payment: Payment; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const before = livePayment(tx, id);
    const changedEnd = patch.endDate !== undefined && patch.endDate !== before.endDate;
    if (
      changedEnd &&
      patch.endDate !== null &&
      (!isPaymentLifecycleDay(patch.endDate) || addDays(patch.endDate, 1) < today)
    )
      throw new ConflictError(
        'Beenden ist nur ab heute möglich. Vergangene Termine bleiben erhalten.',
      );
    if (changedEnd) {
      const lifecycle = readPaymentLifecycles(tx, [id]).get(id);
      // Legacy generic PATCH is not a reviewed-token API. New UI end actions use /end.
      if (!lifecycle?.reviewToken)
        throw new ConflictError(
          'Die Zahlungshistorie ist für eine sichere Änderung nicht vollständig lesbar.',
        );
      const scheduleKeys = [
        'rhythm',
        'dueDay',
        'dueMonth',
        'dateShift',
        'startDate',
        'intervalWeeks',
      ] as const;
      if (scheduleKeys.some((key) => patch[key] !== undefined && patch[key] !== before[key]))
        throw new ConflictError(
          'Bitte zuerst den Rhythmus speichern und den Endtermin danach separat ändern.',
        );
    }
    const clean = patch.name === undefined ? patch : { ...patch, name: cleanName(patch.name) };
    const payment = updateEntity(tx, expectedPayment, id, clean, grouped);
    if (payment.rhythm === 'weekly' && !payment.startDate)
      throw new ConflictError('Wöchentliche Zahlungen brauchen ein Startdatum.');
    if (changedEnd && payment.endDate !== null) {
      const lifecycle = readPaymentLifecycles(tx, [id]).get(id);
      if (lifecycle?.endedFrom !== addDays(payment.endDate, 1))
        throw new ConflictError(
          'Der neue Endtermin ist nicht eindeutig belegt. Die Änderung wurde nicht gespeichert.',
        );
      replanPayment(tx, payment, today, grouped, lifecycle, true);
    } else replanPayment(tx, payment, today, grouped);
    return { payment, groupId: grouped.groupId };
  });
}

/** Soft-delete a payment; its future open occurrences go with it, history stays. */
export function deleteExpectedPayment(
  db: Executor,
  id: string,
  ctx: AuditContext,
  today: string,
  reviewToken: string,
): { groupId: string } {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    const lifecycle = readPaymentLifecycles(tx, [id]).get(id);
    assertPaymentReview(lifecycle, reviewToken);
    assertPaymentDeletable(lifecycle);
    softDeleteEntity(tx, expectedPayment, id, grouped);
    const payment = getEntity(tx, expectedPayment, id, { includeDeleted: true })!;
    replanPayment(tx, payment, today, grouped);
  });
  return { groupId: grouped.groupId };
}

/** Forward-only interval; suppressed open rows and the interval share one audited action. */
export function pauseExpectedPayment(
  db: Executor,
  id: string,
  throughDate: string,
  reviewToken: string,
  ctx: AuditContext,
  today: string,
): { groupId: string } {
  if (!isPaymentLifecycleDay(today) || !isPaymentLifecycleDay(throughDate) || throughDate < today)
    throw new ConflictError('Die Pause braucht ein gültiges Enddatum ab heute.');
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const payment = livePayment(tx, id);
    const before = readPaymentLifecycles(tx, [id]).get(id);
    assertPaymentReview(before, reviewToken);
    if (before?.pauses.some((p) => p.fromDate <= throughDate && p.throughDate >= today))
      throw new ConflictError('Für diesen Zeitraum besteht bereits eine Pause.');
    insertTracked(
      tx,
      expectedPaymentPause,
      { id: randomUUID(), expectedPaymentId: id, fromDate: today, throughDate },
      grouped,
    );
    const lifecycle = readPaymentLifecycles(tx, [id]).get(id);
    assertPaymentPauseRanges(lifecycle);
    replanPayment(tx, payment, today, grouped, lifecycle, true);
    return { groupId: grouped.groupId };
  });
}

/** Existing endDate stays inclusive; the explicit action names the first excluded day. */
export function endExpectedPayment(
  db: Executor,
  id: string,
  fromDate: string,
  reviewToken: string,
  ctx: AuditContext,
  today: string,
): { groupId: string } {
  if (!isPaymentLifecycleDay(today) || !isPaymentLifecycleDay(fromDate) || fromDate < today)
    throw new ConflictError(
      'Beenden ist nur ab heute möglich. Vergangene Termine bleiben erhalten.',
    );
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const current = livePayment(tx, id);
    assertPaymentReview(readPaymentLifecycles(tx, [id]).get(id), reviewToken);
    const endDate = addDays(fromDate, -1);
    if (current.endDate === endDate)
      throw new ConflictError('Diese Zahlung ist bereits ab diesem Datum beendet.');
    const payment = updateEntity(tx, expectedPayment, id, { endDate }, grouped);
    const lifecycle = readPaymentLifecycles(tx, [id]).get(id);
    if (lifecycle?.endedFrom !== fromDate)
      throw new ConflictError(
        'Der neue Endtermin ist nicht eindeutig belegt. Die Änderung wurde nicht gespeichert.',
      );
    replanPayment(tx, payment, today, grouped, lifecycle, true);
    return { groupId: grouped.groupId };
  });
}

/** Bring a deleted payment back and plan its occurrences again. */
export function restoreExpectedPayment(
  db: Executor,
  id: string,
  ctx: AuditContext,
  today: string,
): { payment: Payment; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const payment = restoreEntity(tx, expectedPayment, id, grouped);
    replanPayment(tx, payment, today, grouped);
    return { payment, groupId: grouped.groupId };
  });
}

/**
 * A price change: a new version from a day. Old versions are never edited (a trigger enforces
 * it). Future `expected` occurrences are re-planned with the new amount, in the same audit group.
 */
export function addExpectedVersion(
  db: Executor,
  paymentId: string,
  input: VersionInput,
  ctx: AuditContext,
  today: string,
): { version: Version; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const payment = livePayment(tx, paymentId);
    const version = insertVersion(tx, paymentId, input, grouped);
    replanPayment(tx, payment, today, grouped);
    return { version, groupId: grouped.groupId };
  });
}

/** Live versions of a payment, oldest first. */
export function listExpectedVersions(db: Executor, paymentId: string): Version[] {
  livePayment(db, paymentId);
  return liveVersions(db, paymentId);
}

export interface ExpectedPaymentListing extends Payment {
  /** The version in force today, else the next one; null without versions. */
  version: Pick<Version, 'id' | 'validFrom' | 'amountCents' | 'amountMaxCents' | 'currency'> | null;
  /** Signed amount of the version (outflow negative). */
  amountCents: number | null;
  nextDueDate: string | null;
  monthlyEquivalentCents: number | null;
  yearlyEquivalentCents: number | null;
  lifecycle: {
    pauses: Array<{ fromDate: string; throughDate: string }>;
    endedFrom: string | null;
    endEvidence: 'none' | 'proven' | 'unavailable';
    deletion: 'neverAssigned' | 'everAssigned' | 'unavailable';
    reviewToken: string | null;
  };
}

/** Payments with current version, next due date and monthly and yearly equivalents. */
export function listExpectedPayments(
  db: Executor,
  today: string,
  options: { includeDeleted?: boolean } = {},
): ExpectedPaymentListing[] {
  return runInTransaction(db, (tx) => listExpectedPaymentsInSnapshot(tx, today, options));
}
function listExpectedPaymentsInSnapshot(
  db: Executor,
  today: string,
  options: { includeDeleted?: boolean },
): ExpectedPaymentListing[] {
  const payments = db
    .select()
    .from(expectedPayment)
    .where(options.includeDeleted ? undefined : isNull(expectedPayment.deletedAt))
    .orderBy(asc(expectedPayment.name), asc(expectedPayment.id))
    .all();
  const versions = versionsByPayment(db);
  const lifecycle = readPaymentLifecycles(
    db,
    payments.map((p) => p.id),
  );
  const horizon = lastDayOfMonth(addMonths(monthOf(today), 13));
  return payments.map((p) => {
    const list = versions.get(p.id) ?? [];
    const current = versionOn(list, today) ?? list[0] ?? null;
    const sign = p.kind === 'outflow' ? -1 : 1;
    const signed = current ? sign * current.amountCents : null;
    const state = lifecycle.get(p.id)!;
    const next = occurrences(
      schedulePayment(p, state),
      list.map(scheduleVersion),
      today,
      horizon,
    )[0];
    return {
      ...p,
      version: current && {
        id: current.id,
        validFrom: current.validFrom,
        amountCents: current.amountCents,
        amountMaxCents: current.amountMaxCents,
        currency: current.currency,
      },
      amountCents: signed,
      nextDueDate: next?.dueDate ?? null,
      monthlyEquivalentCents:
        signed === null ? null : monthlyEquivalent(p.rhythm, signed, p.intervalWeeks),
      yearlyEquivalentCents:
        signed === null ? null : yearlyEquivalent(p.rhythm, signed, p.intervalWeeks),
      lifecycle: {
        pauses: state.pauses,
        endedFrom: state.endedFrom,
        endEvidence: state.endEvidence,
        deletion: state.deletion,
        reviewToken: state.reviewToken,
      },
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------------------------

const CHUNK = 400;
const chunks = <T>(list: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
};

interface BookingRow {
  id: string;
  accountId: string;
  date: string;
  amountCents: number;
  currency: string;
  originalAmountCents: number | null;
  originalCurrency: string | null;
  facts: BookingFacts;
  payeeId: string | null;
  importKey: string | null;
  bankRawPayee: string | null;
  bankRawText: string | null;
  bankSourceId: string | null;
}

/** Live bookings on the given accounts between two days, with payee contact, categories, income types. */
function loadBookings(tx: Executor, accountIds: string[], from: string, to: string): BookingRow[] {
  if (accountIds.length === 0) return [];
  const rows = tx
    .select({
      id: booking.id,
      accountId: booking.accountId,
      date: booking.date,
      amountCents: booking.amountCents,
      currency: booking.currency,
      originalAmountCents: booking.originalAmountCents,
      originalCurrency: booking.originalCurrency,
      payeeId: booking.payeeId,
      payeeContactId: payee.contactId,
      importKey: booking.importKey,
      bankRawPayee: booking.bankRawPayee,
      bankRawText: booking.bankRawText,
      bankSourceId: booking.bankSourceId,
    })
    .from(booking)
    .leftJoin(payee, eq(payee.id, booking.payeeId))
    .where(
      and(
        isNull(booking.deletedAt),
        inArray(booking.accountId, accountIds),
        gte(booking.date, from),
        lte(booking.date, to),
      ),
    )
    .all();
  const cats = new Map<string, string[]>();
  const incomes = new Map<string, string[]>();
  for (const ids of chunks(rows.map((r) => r.id))) {
    const splits = tx
      .select({
        bookingId: bookingSplit.bookingId,
        categoryId: bookingSplit.categoryId,
        incomeTypeId: bookingSplit.incomeTypeId,
      })
      .from(bookingSplit)
      .where(inArray(bookingSplit.bookingId, ids))
      .all();
    for (const s of splits) {
      if (s.categoryId) cats.set(s.bookingId, [...(cats.get(s.bookingId) ?? []), s.categoryId]);
      if (s.incomeTypeId)
        incomes.set(s.bookingId, [...(incomes.get(s.bookingId) ?? []), s.incomeTypeId]);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    date: r.date,
    amountCents: r.amountCents,
    currency: r.currency,
    originalAmountCents: r.originalAmountCents,
    originalCurrency: r.originalCurrency,
    payeeId: r.payeeId,
    importKey: r.importKey,
    bankRawPayee: r.bankRawPayee,
    bankRawText: r.bankRawText,
    bankSourceId: r.bankSourceId,
    facts: {
      accountId: r.accountId,
      payeeId: r.payeeId,
      payeeContactId: r.payeeContactId,
      categoryIds: cats.get(r.id) ?? [],
      incomeTypeIds: incomes.get(r.id) ?? [],
    },
  }));
}

/** The occurrence as the matching rules see it (amounts signed, range maximum from the version). */
function plannedOccurrence(
  occ: OccurrenceRow,
  payment: Payment,
  version: Version | undefined,
): Occurrence {
  const sign = payment.kind === 'outflow' ? -1 : 1;
  return {
    dueDate: occ.dueDate,
    amountCents: occ.expectedAmountCents,
    amountMaxCents: version?.amountMaxCents == null ? null : sign * version.amountMaxCents,
    contactShareCents: occ.contactShareCents,
  };
}

const liveClaimedBookings = (tx: Executor): Set<string> =>
  new Set([
    ...statementOwnedBookingIds(tx),
    ...tx
      .select({ bookingId: expectedOccurrence.bookingId })
      .from(expectedOccurrence)
      .innerJoin(booking, eq(booking.id, expectedOccurrence.bookingId))
      .where(
        and(
          isNull(expectedOccurrence.deletedAt),
          isNotNull(expectedOccurrence.bookingId),
          isNull(booking.deletedAt),
        ),
      )
      .all()
      .map((r) => r.bookingId!),
  ]);

/** One recurring debit the system linked on its own; `groupId` undoes exactly this link. */
export interface AutoLink {
  occurrenceId: string;
  bookingId: string;
  groupId: string;
}

export interface MatchSummary {
  received: number;
  deviating: number;
  missed: number;
  /** Proposals opened under Konten › Prüfen by this run (#1102). */
  proposed: number;
  /** Recurring debits linked by this run, each undoable on its own (#1102). */
  links: AutoLink[];
}

/**
 * Match open occurrences (`expected`) to bookings and close the ones whose window has passed
 * (`missed`). A booking fits when it is on the payment's account, has the same sign and its payee
 * (or the payee's contact), category or income type is the payment's; nearest day first, then
 * nearest amount. Fits inside the tolerance are assigned before deviating ones, and a booking
 * belongs to at most one occurrence (enforced in code, see assertBookingUnclaimed). Existing live links only
 * have their amount status refreshed; unlinked or manually missed occurrences are left alone.
 *
 * Recurring debits (kind `outflow`, #1102) are stricter: only an unambiguous pairing
 * (`settleMatches`) is stored, in an audit group of its own; any other pairing becomes a proposal
 * under Konten › Prüfen. A bank line without a payee is identified by its learned bank alias, and
 * a pairing the owner undid or dismissed is not stored or proposed again. Inflows are unchanged.
 * `autoOnly` limits a bank-sync run to new debit links/proposals: income, existing links and
 * overdue unmatched occurrences remain untouched.
 */
export function matchOccurrences(
  db: Executor,
  today: string,
  ctx: AuditContext = SYSTEM_ACTOR,
  options: { autoOnly?: boolean } = {},
): MatchSummary {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const summary: MatchSummary = { received: 0, deviating: 0, missed: 0, proposed: 0, links: [] };
    if (!options.autoOnly) {
      for (const { id, patch } of expectedLinkPatches(tx))
        updateTracked(tx, expectedOccurrence, [id], patch, grouped);
    }
    const openCandidates = tx
      .select({ occ: expectedOccurrence, payment: expectedPayment })
      .from(expectedOccurrence)
      .innerJoin(expectedPayment, eq(expectedPayment.id, expectedOccurrence.expectedPaymentId))
      .where(
        and(
          isNull(expectedOccurrence.deletedAt),
          isNull(expectedPayment.deletedAt),
          eq(expectedOccurrence.status, 'expected'),
          options.autoOnly ? eq(expectedPayment.kind, 'outflow') : undefined,
          options.autoOnly ? isNull(expectedOccurrence.bookingId) : undefined,
        ),
      )
      .all()
      .filter((r) => addDays(r.occ.dueDate, -r.payment.dateWindowDays) <= today);
    const lifecycle = readPaymentLifecycles(
      tx,
      openCandidates.map((r) => r.payment.id),
    );
    const open = openCandidates.filter(
      (r) => !paymentOpenSuppressed(lifecycle.get(r.payment.id), r.occ),
    );
    if (open.length === 0) {
      closeStaleLinkProposals(tx, liveClaimedBookings(tx), grouped);
      return summary;
    }

    const versions = versionsByPayment(tx, [...new Set(open.map((r) => r.payment.id))]);
    const accountIds = [
      ...new Set(open.map((r) => r.payment.accountId).filter((a): a is string => a !== null)),
    ];
    const dues = open.map((r) => r.occ.dueDate).sort();
    const bookings = loadBookings(tx, accountIds, addDays(dues[0]!, -31), addDays(today, 62));
    const debits = open.filter((r) => r.payment.kind === 'outflow');
    const rejected = rejectedLinkPairs(
      tx,
      debits.map((r) => r.occ.id),
    );
    const rejectedBookings = new Set([
      ...rejectedBookingIds(rejected),
      ...previouslyLinkedBookingIds(
        tx,
        bookings.map((b) => b.id),
      ),
    ]);
    const rejectedOccurrences = rejectedOccurrenceIds(rejected);
    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    /** Automatic debit links require a matching payee, contact or learned bank alias. */
    const sameCounterparty = (payment: Payment, bookingId: string) => {
      const facts = bookingById.get(bookingId);
      if (!facts || payment.accountId === null) return false;
      const known = { ...facts.facts, ...bankPayees.get(bookingId) };
      return (
        (payment.payeeId !== null && known.payeeId === payment.payeeId) ||
        (payment.contactId !== null && known.payeeContactId === payment.contactId)
      );
    };
    const bankPayees = debits.length > 0 ? bankPayeeFacts(tx, bookings) : new Map<string, never>();
    const debitFacts = (b: BookingRow): BookingFacts => ({ ...b.facts, ...bankPayees.get(b.id) });

    const inputs: AssignInput[] = open.map(({ occ, payment }) => {
      const version = versionOn(versions.get(payment.id) ?? [], occ.dueDate);
      const currency = version?.currency ?? 'EUR';
      const planned = plannedOccurrence(occ, payment, version);
      const target = {
        accountId: payment.accountId,
        payeeId: payment.payeeId,
        contactId: payment.contactId,
        categoryId: payment.categoryId,
        incomeTypeId: payment.incomeTypeId,
      };
      const debit = payment.kind === 'outflow';
      const candidates: MatchCandidate[] = bookings
        .filter(
          (b) =>
            candidateFits(target, debit ? debitFacts(b) : b.facts) &&
            !(debit && isRejectedPair(rejected, occ.id, b.id)),
        )
        .map((b) => ({ id: b.id, date: b.date, amountCents: bookedAmountIn(b, currency) }));
      return {
        key: occ.id,
        group: payment.id,
        status: occ.status,
        occurrence: planned,
        candidates,
        toleranceCents: payment.amountToleranceCents,
        windowDays: payment.dateWindowDays,
      };
    });

    const matches = settleMatches(inputs, liveClaimedBookings(tx));
    for (const { occ, payment } of open) {
      const match = matches.get(occ.id);
      const debit = payment.kind === 'outflow';
      const needsOwner =
        debit &&
        !!match &&
        (match.doubt !== null ||
          rejectedBookings.has(match.candidate.id) ||
          rejectedOccurrences.has(occ.id) ||
          !sameCounterparty(payment, match.candidate.id));
      if (match && !needsOwner) {
        // A recurring debit is one decision of its own: undoing it must not touch other links.
        const linkCtx = debit ? withGroup({ actor: grouped.actor }) : grouped;
        updateTracked(
          tx,
          expectedOccurrence,
          [occ.id],
          { status: match.status, bookingId: match.candidate.id },
          linkCtx,
        );
        if (debit) {
          // In the run's group, not the link's: undoing the link must not reopen the proposal.
          resolveLinkProposals(
            tx,
            { occurrenceId: occ.id, bookingId: match.candidate.id },
            RESOLUTION_AUTO,
            grouped,
          );
          summary.links.push({
            occurrenceId: occ.id,
            bookingId: match.candidate.id,
            groupId: linkCtx.groupId,
          });
        }
        summary[match.status]++;
        continue;
      }
      if (match) {
        const version = versionOn(versions.get(payment.id) ?? [], occ.dueDate);
        const proposal = ensureLinkProposal(
          tx,
          {
            occurrence: occ,
            payment,
            currency: version?.currency ?? 'EUR',
            booking: match.candidate,
            reason:
              match.doubt === 'amount'
                ? 'Betrag außerhalb der Toleranz'
                : match.doubt === 'several'
                  ? 'mehrere Zuordnungen möglich'
                  : rejectedBookings.has(match.candidate.id) || rejectedOccurrences.has(occ.id)
                    ? 'früher abgelehnt'
                    : !sameCounterparty(payment, match.candidate.id)
                      ? 'Empfänger nicht bestätigt'
                      : 'bitte bestätigen',
          },
          grouped,
        );
        if (proposal.created) summary.proposed++;
      }
      // The window closes as before; an open proposal stays confirmable for a missed occurrence.
      if (!options.autoOnly && today > addDays(occ.dueDate, payment.dateWindowDays)) {
        updateTracked(tx, expectedOccurrence, [occ.id], { status: 'missed' }, grouped);
        summary.missed++;
      }
    }
    closeStaleLinkProposals(tx, liveClaimedBookings(tx), grouped);
    return summary;
  });
}

// ---------------------------------------------------------------------------------------------
// Manual link, unlink, missed
// ---------------------------------------------------------------------------------------------

function liveOccurrence(tx: Executor, id: string): { occ: OccurrenceRow; payment: Payment } {
  const row = tx
    .select({ occ: expectedOccurrence, payment: expectedPayment })
    .from(expectedOccurrence)
    .innerJoin(expectedPayment, eq(expectedPayment.id, expectedOccurrence.expectedPaymentId))
    .where(
      and(
        eq(expectedOccurrence.id, id),
        isNull(expectedOccurrence.deletedAt),
        isNull(expectedPayment.deletedAt),
      ),
    )
    .get();
  if (!row) throw new EntityNotFoundError('expected_occurrence', id);
  return row;
}

/**
 * Link a booking to an occurrence by hand (any date, any fit). The status follows the amount:
 * `received` inside the range plus tolerance, else `deviating`. A booking can belong to one
 * occurrence only; a previous link of this occurrence is replaced.
 */
export function linkOccurrence(
  db: Executor,
  occurrenceId: string,
  bookingId: string,
  ctx: AuditContext,
): { occurrence: OccurrenceRow; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const { occ, payment } = liveOccurrence(tx, occurrenceId);
    assertStatementExpectedLink(tx, bookingId, payment.id, occ.dueDate);
    const b = tx
      .select()
      .from(booking)
      .where(and(eq(booking.id, bookingId), isNull(booking.deletedAt)))
      .get();
    if (!b) throw new EntityNotFoundError('booking', bookingId);
    assertBookingUnclaimed(tx, bookingId, occurrenceId);
    const status = expectedLinkedStatus(tx, occ, payment, b);
    updateTracked(tx, expectedOccurrence, [occurrenceId], { status, bookingId }, grouped);
    // The owner decided: proposals of this occurrence and this booking close in the same step.
    resolveLinkProposals(tx, { occurrenceId, bookingId }, RESOLUTION_LINKED, grouped);
    return { occurrence: liveOccurrence(tx, occurrenceId).occ, groupId: grouped.groupId };
  });
}

/**
 * Remove the link of an occurrence. It becomes `missed` (ausgefallen) and the automatic matching
 * leaves it alone, so the same booking is not linked again; link a booking by hand to reopen it.
 */
export function unlinkOccurrence(
  db: Executor,
  occurrenceId: string,
  ctx: AuditContext,
): { occurrence: OccurrenceRow; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const { occ } = liveOccurrence(tx, occurrenceId);
    if (occ.bookingId === null) throw new ConflictError('This occurrence has no booking to unlink');
    const bookingId = occ.bookingId;
    updateTracked(
      tx,
      expectedOccurrence,
      [occurrenceId],
      { status: 'missed', bookingId: null },
      grouped,
    );
    // Siblings of a multi-linked booking keep their own share and get a fresh status (#1336).
    for (const { id, patch } of expectedLinkPatches(tx, [bookingId]))
      updateTracked(tx, expectedOccurrence, [id], patch, grouped);
    return { occurrence: liveOccurrence(tx, occurrenceId).occ, groupId: grouped.groupId };
  });
}

/**
 * Take one occurrence out of the plan ("gestrichen"): the forecast, Heute and the reports leave it
 * out, the rule and the other occurrences stay, and no booking is matched to it. A deliberate plan
 * change (unpaid leave, a gap in income), not a warning like `missed`. Works for an occurrence that
 * was not materialised yet: the row is created. `dueDate` must be a real occurrence of the rule
 * inside the materialisation window (`occurrenceHorizon`), else a `RangeError`. An occurrence
 * linked to a booking cannot be skipped (`ConflictError`). Skipping twice changes nothing.
 */
export function skipOccurrence(
  db: Executor,
  paymentId: string,
  dueDate: string,
  ctx: AuditContext,
  today: string,
): { occurrence: OccurrenceRow; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const payment = livePayment(tx, paymentId);
    const { from, to } = occurrenceHorizon(today);
    const lifecycle = readPaymentLifecycles(tx, [paymentId]).get(paymentId);
    // A moved occurrence (#1360) may be addressed by its chosen day; its rule date decides.
    const moved = tx
      .select()
      .from(expectedOccurrence)
      .where(
        and(
          eq(expectedOccurrence.expectedPaymentId, paymentId),
          eq(expectedOccurrence.dueDate, dueDate),
          isNotNull(expectedOccurrence.plannedDueDate),
        ),
      )
      .get();
    const ruleDate = moved?.plannedDueDate ?? dueDate;
    const planned =
      /^\d{4}-\d{2}-\d{2}$/.test(ruleDate) && ruleDate >= from && ruleDate <= to
        ? occurrences(
            schedulePayment(payment, lifecycle),
            liveVersions(tx, paymentId).map(scheduleVersion),
            ruleDate,
            ruleDate,
          )[0]
        : undefined;
    if (!planned)
      throw new RangeError(
        `${dueDate} is not a planned occurrence of this payment (${from}..${to})`,
      );
    const row =
      moved ??
      tx
        .select()
        .from(expectedOccurrence)
        .where(
          and(
            eq(expectedOccurrence.expectedPaymentId, paymentId),
            or(
              eq(expectedOccurrence.plannedDueDate, ruleDate),
              and(
                eq(expectedOccurrence.dueDate, ruleDate),
                isNull(expectedOccurrence.plannedDueDate),
              ),
            ),
          ),
        )
        .get();
    let id = row?.id;
    if (!row) {
      id = randomUUID();
      insertTracked(
        tx,
        expectedOccurrence,
        {
          id,
          expectedPaymentId: paymentId,
          dueDate,
          expectedAmountCents: planned.amountCents,
          contactShareCents: planned.contactShareCents,
          status: 'skipped',
        },
        grouped,
      );
    } else if (row.deletedAt !== null) {
      const generated = row.status === 'expected' && lifecycle?.revivableOccurrenceIds.has(row.id);
      const repeatedSkip =
        row.status === 'skipped' && lifecycle?.revivableSkippedOccurrenceIds.has(row.id);
      if (row.dueDate < today || row.bookingId !== null || (!generated && !repeatedSkip))
        throw new ConflictError(
          'Dieser entfernte Termin hat einen erhaltenen Verlauf. Bitte die ursprüngliche Aktion verwenden; er wird nicht neu angelegt.',
        );
      updateTracked(
        tx,
        expectedOccurrence,
        [row.id],
        {
          deletedAt: null,
          status: 'skipped',
          bookingId: null,
          expectedAmountCents: repeatedSkip ? row.expectedAmountCents : planned.amountCents,
          contactShareCents: repeatedSkip ? row.contactShareCents : planned.contactShareCents,
        },
        grouped,
        'restore',
      );
    } else if (row.bookingId !== null) {
      throw new ConflictError('This occurrence is linked to a booking; unlink it first');
    } else if (row.status !== 'skipped') {
      updateTracked(tx, expectedOccurrence, [row.id], { status: 'skipped' }, grouped);
    }
    return { occurrence: liveOccurrence(tx, id!).occ, groupId: grouped.groupId };
  });
}

/**
 * Bring a skipped occurrence back into the plan: it is `expected` again (the matching then treats
 * it like any other) and its amount is re-planned from the current versions. A row that exists
 * only because it was skipped is not removed: within the window `refreshOccurrences` creates the
 * same row anyway. Anything but a skipped occurrence is a `ConflictError`.
 */
export function unskipOccurrence(
  db: Executor,
  occurrenceId: string,
  ctx: AuditContext,
  today: string,
): { occurrence: OccurrenceRow; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const { occ, payment } = liveOccurrence(tx, occurrenceId);
    if (occ.status !== 'skipped') throw new ConflictError('This occurrence is not skipped');
    if (paymentDateSuppressed(readPaymentLifecycles(tx, [payment.id]).get(payment.id), occ.dueDate))
      throw new ConflictError(
        'Dieser Termin ist pausiert oder beendet. Bitte zuerst die Zahlungsaktion rückgängig machen.',
      );
    updateTracked(tx, expectedOccurrence, [occurrenceId], { status: 'expected' }, grouped);
    replanPayment(tx, payment, today, grouped);
    const after = tx
      .select()
      .from(expectedOccurrence)
      .where(eq(expectedOccurrence.id, occurrenceId))
      .get()!;
    return { occurrence: after, groupId: grouped.groupId };
  });
}

/**
 * Move one open occurrence to another day (#1360): `due_date` becomes the chosen day and the rule
 * date is kept in `planned_due_date`, so re-planning neither recreates nor removes it; forecast,
 * Heute and matching follow the new day. Moving back to the rule date clears the marker. Only an
 * `expected`, unlinked occurrence can move, never into the past or onto a day that already holds
 * another occurrence of the same payment (`ConflictError`).
 */
export function moveOccurrence(
  db: Executor,
  occurrenceId: string,
  date: string,
  ctx: AuditContext,
  today: string,
): { occurrence: OccurrenceRow; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const { occ, payment } = liveOccurrence(tx, occurrenceId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today)
      throw new RangeError('Wähle heute oder einen späteren Tag.');
    if (occ.bookingId !== null || occ.status !== 'expected')
      throw new ConflictError('Nur offene Termine ohne Buchung lassen sich verschieben.');
    if (date === occ.dueDate) return { occurrence: occ, groupId: grouped.groupId };
    const taken = tx
      .select({ id: expectedOccurrence.id })
      .from(expectedOccurrence)
      .where(
        and(
          eq(expectedOccurrence.expectedPaymentId, payment.id),
          ne(expectedOccurrence.id, occ.id),
          or(eq(expectedOccurrence.dueDate, date), eq(expectedOccurrence.plannedDueDate, date)),
        ),
      )
      .get();
    if (taken) throw new ConflictError('An diesem Tag gibt es schon einen Termin dieser Zahlung.');
    const ruleDate = occ.plannedDueDate ?? occ.dueDate;
    updateTracked(
      tx,
      expectedOccurrence,
      [occ.id],
      { dueDate: date, plannedDueDate: date === ruleDate ? null : ruleDate },
      grouped,
    );
    return { occurrence: liveOccurrence(tx, occ.id).occ, groupId: grouped.groupId };
  });
}

/** Mark an open occurrence as not happening ("ausgefallen"). Unlink a linked one first. */
export function markOccurrenceMissed(
  db: Executor,
  occurrenceId: string,
  ctx: AuditContext,
): { occurrence: OccurrenceRow; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const { occ } = liveOccurrence(tx, occurrenceId);
    if (occ.bookingId !== null)
      throw new ConflictError('This occurrence is linked to a booking; unlink it first');
    if (occ.status === 'skipped')
      throw new ConflictError('This occurrence is skipped (gestrichen); bring it back first');
    updateTracked(tx, expectedOccurrence, [occurrenceId], { status: 'missed' }, grouped);
    resolveLinkProposals(tx, { occurrenceId }, RESOLUTION_MISSED, grouped);
    return { occurrence: liveOccurrence(tx, occurrenceId).occ, groupId: grouped.groupId };
  });
}

// ---------------------------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------------------------

export interface UpcomingRow {
  occurrenceId: string;
  paymentId: string;
  name: string;
  kind: Payment['kind'];
  dueDate: string;
  status: OccurrenceRow['status'];
  /** Signed, in `currency`. */
  amountCents: number;
  currency: string;
  contactShareCents: number;
  accountId: string | null;
  accountName: string | null;
  payeeId: string | null;
  payeeName: string | null;
  contactId: string | null;
  contactName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryClass: string | null;
  incomeTypeId: string | null;
  incomeTypeName: string | null;
  bookingId: string | null;
  /** The linked booking's own amount (account currency), signed. */
  bookedAmountCents: number | null;
  /** Only for `deviating` rows: the price change the booking suggests. */
  suggestion: VersionSuggestion | null;
}

/**
 * Occurrences due in `from`..`to` of live payments, with everything a list needs. Skipped
 * (gestrichen) ones only with `includeSkipped`.
 */
export function upcoming(
  db: Executor,
  from: string,
  to: string,
  options: { kind?: Payment['kind']; includeSkipped?: boolean } = {},
): UpcomingRow[] {
  return runInTransaction(db, (tx) => upcomingInSnapshot(tx, from, to, options));
}
function upcomingInSnapshot(
  db: Executor,
  from: string,
  to: string,
  options: { kind?: Payment['kind']; includeSkipped?: boolean },
): UpcomingRow[] {
  const rows = db
    .select({
      occ: expectedOccurrence,
      payment: expectedPayment,
      accountName: account.name,
      payeeName: payee.name,
      contactName: contact.name,
      categoryName: category.name,
      categoryClass: category.class,
      incomeTypeName: incomeType.name,
      bookingDate: booking.date,
      bookingAmount: booking.amountCents,
      bookingCurrency: booking.currency,
      bookingOriginalAmount: booking.originalAmountCents,
      bookingOriginalCurrency: booking.originalCurrency,
    })
    .from(expectedOccurrence)
    .innerJoin(expectedPayment, eq(expectedPayment.id, expectedOccurrence.expectedPaymentId))
    .leftJoin(account, eq(account.id, expectedPayment.accountId))
    .leftJoin(payee, eq(payee.id, expectedPayment.payeeId))
    .leftJoin(contact, eq(contact.id, expectedPayment.contactId))
    .leftJoin(category, eq(category.id, expectedPayment.categoryId))
    .leftJoin(incomeType, eq(incomeType.id, expectedPayment.incomeTypeId))
    .leftJoin(booking, and(eq(booking.id, expectedOccurrence.bookingId), isNull(booking.deletedAt)))
    .where(
      and(
        isNull(expectedOccurrence.deletedAt),
        isNull(expectedPayment.deletedAt),
        gte(expectedOccurrence.dueDate, from),
        lte(expectedOccurrence.dueDate, to),
        options.kind ? eq(expectedPayment.kind, options.kind) : undefined,
        // Skipped (gestrichen) occurrences are out of the plan; only the plan view asks for them.
        options.includeSkipped ? undefined : ne(expectedOccurrence.status, 'skipped'),
      ),
    )
    .orderBy(asc(expectedOccurrence.dueDate), asc(expectedPayment.name), asc(expectedOccurrence.id))
    .all();
  const versions = versionsByPayment(db, [...new Set(rows.map((r) => r.payment.id))]);
  const lifecycle = readPaymentLifecycles(
    db,
    rows.map((r) => r.payment.id),
  );
  return rows
    .filter(
      (r) =>
        !paymentOpenSuppressed(lifecycle.get(r.payment.id), {
          dueDate: r.occ.dueDate,
          status: r.bookingDate === null && r.occ.bookingId !== null ? 'expected' : r.occ.status,
          bookingId: r.bookingDate === null ? null : r.occ.bookingId,
        }),
    )
    .map((r) => {
      const version = versionOn(versions.get(r.payment.id) ?? [], r.occ.dueDate);
      const currency = version?.currency ?? 'EUR';
      // A mixed contact receipt (#1322) counts only this occurrence's own share.
      const share =
        r.occ.bookingId !== null && r.bookingDate !== null
          ? mixedReceiptShareCents(db, r.occ.bookingId, r.payment, r.occ.id)
          : null;
      let suggestion: VersionSuggestion | null = null;
      if (r.occ.status === 'deviating' && r.occ.bookingId !== null && r.bookingDate !== null) {
        const booked =
          share ??
          bookedAmountIn(
            {
              amountCents: r.bookingAmount!,
              currency: r.bookingCurrency!,
              originalAmountCents: r.bookingOriginalAmount,
              originalCurrency: r.bookingOriginalCurrency,
            },
            currency,
          );
        suggestion = versionSuggestion(
          r.payment.id,
          {
            dueDate: r.occ.dueDate,
            amountCents: r.occ.expectedAmountCents,
            amountMaxCents: null,
            contactShareCents: r.occ.contactShareCents,
          },
          { id: r.occ.bookingId, date: r.bookingDate, amountCents: booked },
        );
      }
      return {
        occurrenceId: r.occ.id,
        paymentId: r.payment.id,
        name: r.payment.name,
        kind: r.payment.kind,
        dueDate: r.occ.dueDate,
        status: r.bookingDate === null && r.occ.bookingId !== null ? 'expected' : r.occ.status,
        amountCents: r.occ.expectedAmountCents,
        currency,
        contactShareCents: r.occ.contactShareCents,
        accountId: r.payment.accountId,
        accountName: r.accountName,
        payeeId: r.payment.payeeId,
        payeeName: r.payeeName,
        contactId: r.payment.contactId,
        contactName: r.contactName,
        categoryId: r.payment.categoryId,
        categoryName: r.categoryName,
        categoryClass: r.categoryClass,
        incomeTypeId: r.payment.incomeTypeId,
        incomeTypeName: r.incomeTypeName,
        bookingId: r.bookingDate === null ? null : r.occ.bookingId,
        bookedAmountCents: r.bookingDate === null ? null : (share ?? r.bookingAmount),
        suggestion,
      };
    });
}

export interface MonthIncomeLine {
  paymentId: string;
  occurrenceId: string;
  name: string;
  incomeTypeId: string | null;
  incomeTypeName: string | null;
  dueDate: string;
  status: OccurrenceRow['status'];
  expectedCents: number;
  receivedCents: number;
  /** The linked booking, if any. */
  bookingId: string | null;
}

export interface MonthIncome {
  month: string;
  expectedCents: number;
  receivedCents: number;
  byIncomeType: Array<{
    incomeTypeId: string | null;
    name: string | null;
    expectedCents: number;
    receivedCents: number;
  }>;
  byPayment: MonthIncomeLine[];
}

/**
 * Income of a month: what the expected inflows promise against what arrived, per income type and
 * per expected payment. Every occurrence due in the month counts as expected (also a missed one,
 * which shows as a gap); received is the amount of the linked booking.
 */
export function monthIncome(db: Executor, month: string): MonthIncome {
  const rows = upcoming(db, `${month}-01`, lastDayOfMonth(month), { kind: 'inflow' });
  const byPayment: MonthIncomeLine[] = rows.map((r) => ({
    paymentId: r.paymentId,
    occurrenceId: r.occurrenceId,
    name: r.name,
    incomeTypeId: r.incomeTypeId,
    incomeTypeName: r.incomeTypeName,
    dueDate: r.dueDate,
    status: r.status,
    expectedCents: r.amountCents,
    receivedCents: r.bookedAmountCents ?? 0,
    bookingId: r.bookingId,
  }));
  const types = new Map<string, MonthIncome['byIncomeType'][number]>();
  for (const line of byPayment) {
    const key = line.incomeTypeId ?? '';
    const entry = types.get(key) ?? {
      incomeTypeId: line.incomeTypeId,
      name: line.incomeTypeName,
      expectedCents: 0,
      receivedCents: 0,
    };
    entry.expectedCents += line.expectedCents;
    entry.receivedCents += line.receivedCents;
    types.set(key, entry);
  }
  return {
    month,
    expectedCents: byPayment.reduce((s, l) => s + l.expectedCents, 0),
    receivedCents: byPayment.reduce((s, l) => s + l.receivedCents, 0),
    byIncomeType: [...types.values()].sort((a, b) => (a.name ?? '￿').localeCompare(b.name ?? '￿')),
    byPayment,
  };
}

/** Occurrences of live payments that deviate, as price-change suggestions (inbox, P3.10). */
export function versionSuggestions(db: Executor, from: string, to: string): VersionSuggestion[] {
  return upcoming(db, from, to)
    .map((r) => r.suggestion)
    .filter((s): s is VersionSuggestion => s !== null);
}
/** Explicit receipt suggestions retain the existing one-booking/one-occurrence contract. */
export function incomeReceiptCandidates(
  db: Executor,
  paymentId: string,
  dueDate: string,
  today: string,
): Array<{ bookingId: string; date: string; amountCents: number; currency: string }> {
  const payment = livePayment(db, paymentId);
  const occurrence = upcoming(db, dueDate, dueDate).find((o) => o.paymentId === paymentId);
  if (
    payment.kind !== 'inflow' ||
    !payment.accountId ||
    !payment.payeeId ||
    !payment.incomeTypeId ||
    !occurrence ||
    occurrence.bookingId !== null ||
    occurrence.currency !== 'EUR'
  )
    return [];
  const claimed = liveClaimedBookings(db);
  const version = versionOn(liveVersions(db, paymentId), dueDate);
  return loadBookings(
    db,
    [payment.accountId],
    addDays(dueDate, -payment.dateWindowDays),
    addDays(dueDate, payment.dateWindowDays),
  )
    .filter((b) => {
      if (
        claimed.has(b.id) ||
        b.date > today ||
        monthOf(b.date) !== monthOf(dueDate) ||
        b.currency !== 'EUR' ||
        b.facts.payeeId !== payment.payeeId ||
        b.amountCents <= 0 ||
        amountGap(
          { ...occurrence, amountMaxCents: version?.amountMaxCents ?? null },
          b.amountCents,
        ) > payment.amountToleranceCents
      )
        return false;
      const splits = db.select().from(bookingSplit).where(eq(bookingSplit.bookingId, b.id)).all();
      return (
        splits.length > 0 &&
        splits.every(
          (s) =>
            s.incomeTypeId === payment.incomeTypeId &&
            s.categoryId === null &&
            s.contactId === null,
        )
      );
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((b) => ({
      bookingId: b.id,
      date: b.date,
      amountCents: b.amountCents,
      currency: b.currency,
    }));
}

/** Revalidate the proposal and reuse the audited occurrence writers in one transaction/group. */
export function acknowledgeIncomeReceipt(
  db: Executor,
  paymentId: string,
  dueDate: string,
  bookingId: string,
  ctx: AuditContext,
  today: string,
): { occurrence: OccurrenceRow; groupId: string } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    if (
      !incomeReceiptCandidates(tx, paymentId, dueDate, today).some((b) => b.bookingId === bookingId)
    )
      throw new ConflictError('Diese Zahlung passt nicht mehr zu diesem Termin. Bitte neu laden.');
    const { occurrence } = skipOccurrence(tx, paymentId, dueDate, grouped, today);
    return linkOccurrence(tx, occurrence.id, bookingId, grouped);
  });
}
