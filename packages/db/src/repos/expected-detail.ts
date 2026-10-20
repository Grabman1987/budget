import {
  addDays,
  addMonths,
  lastDayOfMonth,
  monthOf,
  occurrences,
  versionOn,
  weekInterval,
} from '@budget/domain';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQLWrapper,
} from 'drizzle-orm';
import {
  auditLog,
  booking,
  expectedOccurrence,
  expectedPayment,
  expectedPaymentVersion,
} from '../schema';
import { getEntity } from './entities';
import { EntityNotFoundError } from './errors';
import { listExpectedVersions, schedulePayment, scheduleVersion } from './expected';
import type { Executor } from './types';

const HISTORY_COUNT = 12;
const FUTURE_COUNT = 12;

/** Only the required public predicates are selected; never load private audit snapshots. */
const jsonField = (column: SQLWrapper, key: string) =>
  sql<unknown>`case when json_valid(${column}) then json_extract(${column}, ${`$.${key}`}) else null end`;

/**
 * Currency was not snapshotted on occurrences. Without replaying historical schedules, prove
 * only the conservative case: original occurrence/version CREATE evidence and one currency
 * across all relevant version history, including deletes/undo and legacy before/after edits.
 * Matching numeric amounts is deliberately not evidence of a currency.
 */
function storedCurrencies(
  db: Executor,
  paymentId: string,
  rows: Array<typeof expectedOccurrence.$inferSelect>,
) {
  const result = new Map<string, string | null>();
  if (rows.length === 0) return result;
  const versions = db
    .select({
      id: expectedPaymentVersion.id,
      validFrom: expectedPaymentVersion.validFrom,
      currency: expectedPaymentVersion.currency,
    })
    .from(expectedPaymentVersion)
    .where(eq(expectedPaymentVersion.expectedPaymentId, paymentId))
    .all();
  const events = db
    .select({
      id: auditLog.entityId,
      sequence: sql<number>`${auditLog}.rowid`.mapWith(Number),
      action: auditLog.action,
      beforePresent: sql<number>`${auditLog.beforeJson} is not null`,
      afterPresent: sql<number>`${auditLog.afterJson} is not null`,
      beforeId: jsonField(auditLog.beforeJson, 'id'),
      afterId: jsonField(auditLog.afterJson, 'id'),
      beforePayment: jsonField(auditLog.beforeJson, 'expected_payment_id'),
      afterPayment: jsonField(auditLog.afterJson, 'expected_payment_id'),
      beforeDate: jsonField(auditLog.beforeJson, 'valid_from'),
      afterDate: jsonField(auditLog.afterJson, 'valid_from'),
      beforeCurrency: jsonField(auditLog.beforeJson, 'currency'),
      afterCurrency: jsonField(auditLog.afterJson, 'currency'),
      afterDeletedType: sql<unknown>`case when json_valid(${auditLog.afterJson}) then json_type(${auditLog.afterJson}, '$.deleted_at') else null end`,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, 'expected_payment_version'),
        or(
          eq(jsonField(auditLog.beforeJson, 'expected_payment_id'), paymentId),
          eq(jsonField(auditLog.afterJson, 'expected_payment_id'), paymentId),
          versions.length
            ? inArray(
                auditLog.entityId,
                versions.map((v) => v.id),
              )
            : undefined,
        ),
      ),
    )
    .all();
  const creations = db
    .select({
      id: auditLog.entityId,
      sequence: sql<number>`${auditLog}.rowid`.mapWith(Number),
      createdId: jsonField(auditLog.afterJson, 'id'),
      payment: jsonField(auditLog.afterJson, 'expected_payment_id'),
      day: jsonField(auditLog.afterJson, 'due_date'),
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, 'expected_occurrence'),
        eq(auditLog.action, 'create'),
        inArray(
          auditLog.entityId,
          rows.map((r) => r.id),
        ),
      ),
    )
    .all();
  const originals = new Map(events.filter((e) => e.action === 'create').map((e) => [e.id, e]));
  const versionById = new Map(versions.map((v) => [v.id, v]));
  const createCounts = new Map<string, number>();
  const firstNonCreate = new Map<string, number>();
  for (const event of events) {
    if (event.action === 'create')
      createCounts.set(event.id, (createCounts.get(event.id) ?? 0) + 1);
    else
      firstNonCreate.set(
        event.id,
        Math.min(firstNonCreate.get(event.id) ?? Infinity, event.sequence),
      );
  }
  const validDay = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const milliseconds = Date.parse(`${value}T00:00:00Z`);
    return (
      Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === value
    );
  };
  const validCurrency = (value: unknown): value is string =>
    typeof value === 'string' && /^[A-Z]{3}$/.test(value);
  const invalidSide = (e: (typeof events)[number], side: 'before' | 'after') => {
    if (!e[`${side}Present`]) return false;
    const original = originals.get(e.id);
    return (
      e[`${side}Id`] !== e.id ||
      e[`${side}Payment`] !== paymentId ||
      !validDay(e[`${side}Date`]) ||
      !validCurrency(e[`${side}Currency`]) ||
      !original ||
      e[`${side}Date`] !== original.afterDate ||
      e[`${side}Currency`] !== original.afterCurrency
    );
  };
  for (const row of rows) {
    const originalCreates = creations.filter((e) => e.id === row.id);
    const original =
      originalCreates.length === 1 &&
      originalCreates[0]!.createdId === row.id &&
      originalCreates[0]!.payment === paymentId &&
      originalCreates[0]!.day === row.dueDate;
    const relevant = events.filter(
      (e) =>
        invalidSide(e, 'before') ||
        invalidSide(e, 'after') ||
        (typeof e.beforeDate === 'string' && e.beforeDate <= row.dueDate) ||
        (typeof e.afterDate === 'string' && e.afterDate <= row.dueDate) ||
        (versionById.get(e.id)?.validFrom ?? '9999-12-31') <= row.dueDate,
    );
    const identities = new Set([
      ...versions.filter((v) => v.validFrom <= row.dueDate).map((v) => v.id),
      ...relevant.map((e) => e.id),
    ]);
    let complete =
      original &&
      identities.size > 0 &&
      [...identities].every(
        (id) =>
          createCounts.get(id) === 1 &&
          originals.get(id)?.afterPayment === paymentId &&
          originals.get(id)?.afterId === id,
      );
    // This is only an origin witness, not replay: an untouched applicable version was
    // created before this occurrence. If its state at the origin would need replay, abstain.
    const originSequence = originalCreates[0]?.sequence ?? -1;
    const originWitness = [...identities].some((id) => {
      const created = originals.get(id);
      return (
        created !== undefined &&
        validDay(created.afterDate) &&
        created.afterDate <= row.dueDate &&
        created.sequence < originSequence &&
        created.afterDeletedType === 'null' &&
        (firstNonCreate.get(id) ?? Infinity) >= originSequence
      );
    });
    complete = complete && originWitness;
    const currencies = new Set<string>();
    for (const version of versions.filter((v) => v.validFrom <= row.dueDate)) {
      currencies.add(version.currency);
      const created = originals.get(version.id);
      if (
        !validCurrency(version.currency) ||
        created?.afterDate !== version.validFrom ||
        created?.afterCurrency !== version.currency
      )
        complete = false;
    }
    for (const event of relevant) {
      for (const side of ['before', 'after'] as const) {
        if (!event[`${side}Present`]) continue;
        const date = event[`${side}Date`];
        const currency = event[`${side}Currency`];
        if (invalidSide(event, side)) complete = false;
        else if (typeof date === 'string' && date <= row.dueDate && typeof currency === 'string')
          currencies.add(currency);
      }
    }
    result.set(row.id, complete && currencies.size === 1 ? [...currencies][0]! : null);
  }
  return result;
}

export interface PaymentDetailRow {
  /** Null for a read-only preview: never pass an invented identity to a write route. */
  occurrenceId: string | null;
  dueDate: string;
  source: 'stored' | 'preview';
  status: typeof expectedOccurrence.$inferSelect.status;
  expectedAmountCents: number;
  /** Unknown without complete, unambiguous stored currency provenance. */
  currency: string | null;
  booking: { id: string; date: string; amountCents: number; currency: string } | null;
  actualComparableCents: number | null;
  deviationCents: number | null;
  unavailableReason:
    'missing_booking' | 'currency_mismatch' | 'missing_currency' | 'unsafe_difference' | null;
}

export interface PaymentDetail {
  paymentId: string;
  asOf: string;
  history: PaymentDetailRow[];
  /** A factual count below twelve must not be replaced by reconstructed past schedules. */
  sparseHistory: boolean;
  hasEarlierRecorded: boolean;
  /** First three by default; at most nine further read-only terms can be disclosed. */
  future: PaymentDetailRow[];
  hasFurtherFuture: boolean;
}

/** Payment-scoped read only. No materialisation, matching, status refresh or history backfill. */
export function readPaymentDetail(db: Executor, paymentId: string, asOf: string): PaymentDetail {
  const payment = getEntity(db, expectedPayment, paymentId);
  if (!payment) throw new EntityNotFoundError('expected_payment', paymentId);
  const versions = listExpectedVersions(db, paymentId);
  const selectStored = () =>
    db
      .select({
        occurrence: expectedOccurrence,
        linked: {
          id: booking.id,
          date: booking.date,
          amountCents: booking.amountCents,
          currency: booking.currency,
          originalAmountCents: booking.originalAmountCents,
          originalCurrency: booking.originalCurrency,
        },
      })
      .from(expectedOccurrence)
      .leftJoin(
        booking,
        and(eq(booking.id, expectedOccurrence.bookingId), isNull(booking.deletedAt)),
      );
  const live = and(
    eq(expectedOccurrence.expectedPaymentId, paymentId),
    isNull(expectedOccurrence.deletedAt),
  );
  const past = selectStored()
    .where(and(live, lte(expectedOccurrence.dueDate, asOf)))
    .orderBy(desc(expectedOccurrence.dueDate), desc(expectedOccurrence.id))
    .limit(HISTORY_COUNT + 1)
    .all();
  const storedFuture = selectStored()
    .where(and(live, gt(expectedOccurrence.dueDate, asOf)))
    .orderBy(asc(expectedOccurrence.dueDate), asc(expectedOccurrence.id))
    .limit(FUTURE_COUNT + 1)
    .all();
  const currencies = storedCurrencies(
    db,
    paymentId,
    [...past, ...storedFuture].map((r) => r.occurrence),
  );

  const storedRow = ({ occurrence: row, linked }: (typeof past)[number]): PaymentDetailRow => {
    const currency = currencies.get(row.id) ?? null;
    const actual =
      linked === null || currency === null
        ? null
        : linked.currency === currency
          ? linked.amountCents
          : linked.originalCurrency === currency
            ? linked.originalAmountCents
            : null;
    const difference = actual === null ? null : actual - row.expectedAmountCents;
    // Preserve exact integer cents even at the safe-integer boundary; no rounded result.
    const deviation = difference !== null && Number.isSafeInteger(difference) ? difference : null;
    return {
      occurrenceId: row.id,
      dueDate: row.dueDate,
      source: 'stored',
      // Same deleted-link normalisation as the existing upcoming read, without a repair write.
      status: linked === null && row.bookingId !== null ? 'expected' : row.status,
      expectedAmountCents: row.expectedAmountCents,
      currency,
      booking:
        linked === null
          ? null
          : {
              id: linked.id,
              date: linked.date,
              amountCents: linked.amountCents,
              currency: linked.currency,
            },
      actualComparableCents: actual,
      deviationCents: deviation,
      unavailableReason:
        currency === null
          ? 'missing_currency'
          : linked === null
            ? 'missing_booking'
            : actual === null
              ? 'currency_mismatch'
              : deviation === null
                ? 'unsafe_difference'
                : null,
    };
  };

  const future = new Map(storedFuture.map((row) => [row.occurrence.dueDate, storedRow(row)]));
  if (versions.length > 0) {
    // Start at the first possible current-rule date, including a far-future first version.
    const from = [addDays(asOf, 1), payment.startDate ?? '', versions[0]!.validFrom].sort().at(-1)!;
    if (payment.endDate === null || from <= payment.endDate) {
      const monthStep = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };
      const months =
        payment.rhythm === 'weekly'
          ? Math.ceil(((FUTURE_COUNT + 1) * 7 * weekInterval(payment.intervalWeeks)) / 28) + 2
          : (FUTURE_COUNT + 1) * monthStep[payment.rhythm] + 2;
      const horizon = lastDayOfMonth(addMonths(monthOf(from), months));
      const to = payment.endDate !== null && payment.endDate < horizon ? payment.endDate : horizon;
      const projected = occurrences(
        schedulePayment(payment),
        versions.map(scheduleVersion),
        from,
        to,
      ).slice(0, FUTURE_COUNT + 1);
      for (const row of projected) {
        // Stored received/deviating/skipped/missed states remain authoritative, even outside
        // the current rule's dates. Only absent identities are labelled nonpersistent previews.
        if (future.has(row.dueDate)) continue;
        future.set(row.dueDate, {
          occurrenceId: null,
          dueDate: row.dueDate,
          source: 'preview',
          status: 'expected',
          expectedAmountCents: row.amountCents,
          currency: versionOn(versions, row.dueDate)!.currency,
          booking: null,
          actualComparableCents: null,
          deviationCents: null,
          unavailableReason: 'missing_booking',
        });
      }
    }
  }
  const orderedFuture = [...future.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    paymentId,
    asOf,
    history: past.slice(0, HISTORY_COUNT).map(storedRow),
    sparseHistory: past.length < HISTORY_COUNT,
    hasEarlierRecorded: past.length > HISTORY_COUNT,
    future: orderedFuture.slice(0, FUTURE_COUNT),
    hasFurtherFuture: orderedFuture.length > FUTURE_COUNT,
  };
}
