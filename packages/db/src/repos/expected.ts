import {
  addDays,
  addMonths,
  amountGap,
  assignMatches,
  candidateFits,
  lastDayOfMonth,
  monthOf,
  monthlyEquivalent,
  occurrences,
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
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, ne } from 'drizzle-orm';
import {
  account,
  booking,
  bookingSplit,
  category,
  contact,
  expectedOccurrence,
  expectedPayment,
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
import { runInTransaction, type Executor } from './types';

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

const schedulePayment = (p: Payment): SchedulePayment => ({
  kind: p.kind,
  rhythm: p.rhythm,
  dueDay: p.dueDay,
  dueMonth: p.dueMonth,
  dateShift: p.dateShift,
  startDate: p.startDate,
  endDate: p.endDate,
  contactShareBp: p.contactShareBp,
});

const scheduleVersion = (v: Version): ScheduleVersion => ({
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

/** Amount of a booking in the currency of the payment's version (see the file comment). */
export function bookedAmountIn(
  bookingRow: {
    amountCents: number;
    currency: string;
    originalAmountCents: number | null;
    originalCurrency: string | null;
  },
  currency: string,
): number {
  if (bookingRow.currency === currency) return bookingRow.amountCents;
  if (bookingRow.originalCurrency === currency && bookingRow.originalAmountCents !== null)
    return bookingRow.originalAmountCents;
  return bookingRow.amountCents;
}

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
 * missed and past rows are history and stay as they are. A deleted payment has no plan.
 */
function replanPayment(
  tx: Executor,
  payment: Payment,
  today: string,
  ctx: GroupedContext,
): ReplanResult {
  const result: ReplanResult = { created: 0, updated: 0, removed: 0 };
  const { from, to } = occurrenceHorizon(today);
  const versions = liveVersions(tx, payment.id);
  const desired =
    payment.deletedAt === null
      ? occurrences(schedulePayment(payment), versions.map(scheduleVersion), from, to)
      : [];
  const existing = new Map(
    tx
      .select()
      .from(expectedOccurrence)
      .where(eq(expectedOccurrence.expectedPaymentId, payment.id))
      .all()
      .map((row) => [row.dueDate, row]),
  );
  const wanted = new Set<string>();
  for (const occ of desired) {
    wanted.add(occ.dueDate);
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
    } else if (row.deletedAt !== null) {
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
      row.status === 'expected' &&
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
      row.dueDate >= today &&
      !wanted.has(row.dueDate)
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
    const payments = tx.select().from(expectedPayment).all();
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
      const r = replanPayment(tx, payment, today, grouped);
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
    const clean = patch.name === undefined ? patch : { ...patch, name: cleanName(patch.name) };
    const payment = updateEntity(tx, expectedPayment, id, clean, grouped);
    replanPayment(tx, payment, today, grouped);
    return { payment, groupId: grouped.groupId };
  });
}

/** Soft-delete a payment; its future open occurrences go with it, history stays. */
export function deleteExpectedPayment(
  db: Executor,
  id: string,
  ctx: AuditContext,
  today: string,
): { groupId: string } {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    softDeleteEntity(tx, expectedPayment, id, grouped);
    const payment = getEntity(tx, expectedPayment, id, { includeDeleted: true })!;
    replanPayment(tx, payment, today, grouped);
  });
  return { groupId: grouped.groupId };
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
}

/** Payments with current version, next due date and monthly and yearly equivalents. */
export function listExpectedPayments(
  db: Executor,
  today: string,
  options: { includeDeleted?: boolean } = {},
): ExpectedPaymentListing[] {
  const payments = db
    .select()
    .from(expectedPayment)
    .where(options.includeDeleted ? undefined : isNull(expectedPayment.deletedAt))
    .orderBy(asc(expectedPayment.name), asc(expectedPayment.id))
    .all();
  const versions = versionsByPayment(db);
  const horizon = lastDayOfMonth(addMonths(monthOf(today), 13));
  return payments.map((p) => {
    const list = versions.get(p.id) ?? [];
    const current = versionOn(list, today) ?? list[0] ?? null;
    const sign = p.kind === 'outflow' ? -1 : 1;
    const signed = current ? sign * current.amountCents : null;
    const next = occurrences(schedulePayment(p), list.map(scheduleVersion), today, horizon)[0];
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
      monthlyEquivalentCents: signed === null ? null : monthlyEquivalent(p.rhythm, signed),
      yearlyEquivalentCents: signed === null ? null : yearlyEquivalent(p.rhythm, signed),
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
  new Set(
    tx
      .select({ bookingId: expectedOccurrence.bookingId })
      .from(expectedOccurrence)
      .where(and(isNull(expectedOccurrence.deletedAt), isNotNull(expectedOccurrence.bookingId)))
      .all()
      .map((r) => r.bookingId!),
  );

export interface MatchSummary {
  received: number;
  deviating: number;
  missed: number;
}

/**
 * Match open occurrences (`expected`) to bookings and close the ones whose window has passed
 * (`missed`). A booking fits when it is on the payment's account, has the same sign and its payee
 * (or the payee's contact), category or income type is the payment's; nearest day first, then
 * nearest amount. Fits inside the tolerance are assigned before deviating ones, and a booking
 * belongs to at most one occurrence (also enforced by a unique index). Occurrences that were
 * linked, unlinked or marked missed by hand are never touched again by this function.
 */
export function matchOccurrences(
  db: Executor,
  today: string,
  ctx: AuditContext = SYSTEM_ACTOR,
): MatchSummary {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const summary: MatchSummary = { received: 0, deviating: 0, missed: 0 };
    const open = tx
      .select({ occ: expectedOccurrence, payment: expectedPayment })
      .from(expectedOccurrence)
      .innerJoin(expectedPayment, eq(expectedPayment.id, expectedOccurrence.expectedPaymentId))
      .where(
        and(
          isNull(expectedOccurrence.deletedAt),
          isNull(expectedPayment.deletedAt),
          eq(expectedOccurrence.status, 'expected'),
        ),
      )
      .all()
      .filter((r) => addDays(r.occ.dueDate, -r.payment.dateWindowDays) <= today);
    if (open.length === 0) return summary;

    const versions = versionsByPayment(tx, [...new Set(open.map((r) => r.payment.id))]);
    const accountIds = [
      ...new Set(open.map((r) => r.payment.accountId).filter((a): a is string => a !== null)),
    ];
    const dues = open.map((r) => r.occ.dueDate).sort();
    const bookings = loadBookings(tx, accountIds, addDays(dues[0]!, -31), addDays(today, 62));

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
      const candidates: MatchCandidate[] = bookings
        .filter((b) => candidateFits(target, b.facts))
        .map((b) => ({ id: b.id, date: b.date, amountCents: bookedAmountIn(b, currency) }));
      return {
        key: occ.id,
        occurrence: planned,
        candidates,
        toleranceCents: payment.amountToleranceCents,
        windowDays: payment.dateWindowDays,
      };
    });

    const matches = assignMatches(inputs, liveClaimedBookings(tx));
    for (const { occ, payment } of open) {
      const match = matches.get(occ.id);
      if (match) {
        updateTracked(
          tx,
          expectedOccurrence,
          [occ.id],
          { status: match.status, bookingId: match.candidate.id },
          grouped,
        );
        summary[match.status]++;
      } else if (today > addDays(occ.dueDate, payment.dateWindowDays)) {
        updateTracked(tx, expectedOccurrence, [occ.id], { status: 'missed' }, grouped);
        summary.missed++;
      }
    }
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
    const b = tx
      .select()
      .from(booking)
      .where(and(eq(booking.id, bookingId), isNull(booking.deletedAt)))
      .get();
    if (!b) throw new EntityNotFoundError('booking', bookingId);
    const other = tx
      .select({ id: expectedOccurrence.id })
      .from(expectedOccurrence)
      .where(
        and(
          eq(expectedOccurrence.bookingId, bookingId),
          isNull(expectedOccurrence.deletedAt),
          ne(expectedOccurrence.id, occurrenceId),
        ),
      )
      .get();
    if (other) throw new ConflictError('This booking already belongs to another occurrence');
    const version = versionOn(
      versionsByPayment(tx, [payment.id]).get(payment.id) ?? [],
      occ.dueDate,
    );
    const planned = plannedOccurrence(occ, payment, version);
    const booked = bookedAmountIn(b, version?.currency ?? 'EUR');
    const inside =
      Math.sign(booked) === Math.sign(planned.amountCents) &&
      amountGap(planned, booked) <= payment.amountToleranceCents;
    updateTracked(
      tx,
      expectedOccurrence,
      [occurrenceId],
      { status: inside ? 'received' : 'deviating', bookingId },
      grouped,
    );
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
    updateTracked(
      tx,
      expectedOccurrence,
      [occurrenceId],
      { status: 'missed', bookingId: null },
      grouped,
    );
    return { occurrence: liveOccurrence(tx, occurrenceId).occ, groupId: grouped.groupId };
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
    updateTracked(tx, expectedOccurrence, [occurrenceId], { status: 'missed' }, grouped);
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

/** Occurrences due in `from`..`to` of live payments, with everything a list needs. */
export function upcoming(
  db: Executor,
  from: string,
  to: string,
  options: { kind?: Payment['kind'] } = {},
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
    .leftJoin(booking, eq(booking.id, expectedOccurrence.bookingId))
    .where(
      and(
        isNull(expectedOccurrence.deletedAt),
        isNull(expectedPayment.deletedAt),
        gte(expectedOccurrence.dueDate, from),
        lte(expectedOccurrence.dueDate, to),
        options.kind ? eq(expectedPayment.kind, options.kind) : undefined,
      ),
    )
    .orderBy(asc(expectedOccurrence.dueDate), asc(expectedPayment.name), asc(expectedOccurrence.id))
    .all();
  const versions = versionsByPayment(db, [...new Set(rows.map((r) => r.payment.id))]);
  return rows.map((r) => {
    const version = versionOn(versions.get(r.payment.id) ?? [], r.occ.dueDate);
    const currency = version?.currency ?? 'EUR';
    let suggestion: VersionSuggestion | null = null;
    if (r.occ.status === 'deviating' && r.occ.bookingId !== null && r.bookingDate !== null) {
      const booked = bookedAmountIn(
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
      status: r.occ.status,
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
      bookingId: r.occ.bookingId,
      bookedAmountCents: r.bookingAmount,
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
