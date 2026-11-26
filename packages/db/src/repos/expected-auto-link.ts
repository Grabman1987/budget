import { cents, formatEuro } from '@budget/domain';
import { and, eq, inArray, isNotNull, isNull, like, or, sql } from 'drizzle-orm';
import {
  account,
  auditLog,
  bankSyncCandidate,
  booking,
  expectedOccurrence,
  expectedPayment,
  inboxItem,
  payee,
} from '../schema';
import { suggestedBankPayee } from './assignment-rules';
import { insertTracked, nowIso, updateTracked, type GroupedContext } from './audit';
import type { Executor } from './types';

/**
 * Automatic linking of recurring debits (#1102). A pairing the matching rule calls unambiguous is
 * stored at once, in an audit group of its own (one undo step). Every other pairing becomes a
 * proposal: an open inbox task under Konten › Prüfen that the owner confirms or dismisses. A link
 * the owner removed and a proposal the owner dismissed are remembered through the audit trail and
 * the resolved task, so the same pairing is never stored or proposed again by the system.
 */

type Payment = typeof expectedPayment.$inferSelect;
type OccurrenceRow = typeof expectedOccurrence.$inferSelect;

/** `inbox_item.ref_type` of a link proposal; `ref_id` is the occurrence. */
export const LINK_PROPOSAL_REF = 'expected_occurrence';
const PROPOSAL_PREFIX = 'expected-link:';
const BANK_KEY_PREFIX = 'bank-sync:';
const CHUNK = 400;

const chunks = <T>(values: readonly T[]): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += CHUNK) result.push(values.slice(i, i + CHUNK));
  return result;
};

export const RESOLUTION_LINKED = 'Verknüpft.';
export const RESOLUTION_AUTO = 'Automatisch verknüpft.';
export const RESOLUTION_MISSED = 'Als ausgefallen markiert.';
const RESOLUTION_STALE = 'Zuordnung nicht mehr offen.';
const SYSTEM_RESOLUTIONS = new Set([
  RESOLUTION_LINKED,
  RESOLUTION_AUTO,
  RESOLUTION_MISSED,
  RESOLUTION_STALE,
]);

const pairKey = (occurrenceId: string, bookingId: string) => `${occurrenceId}:${bookingId}`;

export const linkProposalId = (occurrenceId: string, bookingId: string) =>
  PROPOSAL_PREFIX + pairKey(occurrenceId, bookingId);

/** Occurrence and booking of a proposal task, null for any other inbox id. */
export function parseLinkProposalId(
  id: string,
): { occurrenceId: string; bookingId: string } | null {
  if (!id.startsWith(PROPOSAL_PREFIX)) return null;
  const [occurrenceId, bookingId, ...rest] = id.slice(PROPOSAL_PREFIX.length).split(':');
  return occurrenceId && bookingId && rest.length === 0 ? { occurrenceId, bookingId } : null;
}

export interface BankDebitRow {
  id: string;
  accountId: string;
  payeeId: string | null;
  importKey: string | null;
  bankRawPayee: string | null;
  bankRawText: string | null;
  bankSourceId: string | null;
}

/**
 * Payee of a bank line the owner has not reviewed yet. A booking posted by bank sync carries no
 * payee; the learned bank alias (or the one payee with the cleaned bank name) identifies it, the
 * same pattern Prüfen preselects. Bookings that already have a payee are left out.
 */
export function bankPayeeFacts(
  tx: Executor,
  rows: readonly BankDebitRow[],
): Map<string, { payeeId: string; payeeContactId: string | null }> {
  const result = new Map<string, { payeeId: string; payeeContactId: string | null }>();
  const memo = new Map<string, string | null>();
  for (const row of rows) {
    if (row.payeeId !== null) continue;
    let line =
      row.bankSourceId !== null && row.bankRawText !== null
        ? { sourceId: row.bankSourceId, rawPayee: row.bankRawPayee, memo: row.bankRawText }
        : null;
    if (!line && row.importKey?.startsWith(BANK_KEY_PREFIX)) {
      const candidate = tx
        .select()
        .from(bankSyncCandidate)
        .where(
          and(
            eq(bankSyncCandidate.accountId, row.accountId),
            eq(bankSyncCandidate.dedupeKey, row.importKey.slice(BANK_KEY_PREFIX.length)),
          ),
        )
        .get();
      if (candidate?.sourceId)
        line = { sourceId: candidate.sourceId, rawPayee: candidate.rawPayee, memo: candidate.memo };
    }
    if (!line) continue;
    const key = JSON.stringify([line.sourceId, line.rawPayee, line.memo]);
    if (!memo.has(key))
      memo.set(key, suggestedBankPayee(tx, line.sourceId, line.rawPayee, line.memo).payeeId);
    const payeeId = memo.get(key);
    if (payeeId) result.set(row.id, { payeeId, payeeContactId: null });
  }
  const payeeIds = [...new Set([...result.values()].map((fact) => fact.payeeId))];
  const contacts = new Map(
    chunks(payeeIds).flatMap((part) =>
      tx
        .select({ id: payee.id, contactId: payee.contactId })
        .from(payee)
        .where(inArray(payee.id, part))
        .all()
        .map((p) => [p.id, p.contactId] as const),
    ),
  );
  for (const fact of result.values()) fact.payeeContactId = contacts.get(fact.payeeId) ?? null;
  return result;
}

/**
 * Pairings the system must not store or propose again for these open occurrences: a booking the
 * occurrence was linked to before (the link was undone or removed) and a proposal that was closed.
 */
export function rejectedLinkPairs(tx: Executor, occurrenceIds: readonly string[]): Set<string> {
  const rejected = new Set<string>();
  for (const part of chunks(occurrenceIds)) {
    for (const row of tx
      .select({ entityId: auditLog.entityId, beforeJson: auditLog.beforeJson })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityType, 'expected_occurrence'),
          inArray(auditLog.entityId, part),
          like(auditLog.beforeJson, '%"booking_id":"%'),
        ),
      )
      .all()) {
      const before = JSON.parse(row.beforeJson ?? 'null') as Record<string, unknown> | null;
      const bookingId = before?.['booking_id'];
      if (typeof bookingId === 'string') rejected.add(pairKey(row.entityId, bookingId));
    }
    for (const row of tx
      .select({ id: inboxItem.id, resolution: inboxItem.resolution })
      .from(inboxItem)
      .where(
        and(
          eq(inboxItem.refType, LINK_PROPOSAL_REF),
          inArray(inboxItem.refId, part),
          isNotNull(inboxItem.resolvedAt),
        ),
      )
      .all()) {
      // Only the owner's dismissal counts; closings by the system are no decision.
      if (row.resolution !== null && SYSTEM_RESOLUTIONS.has(row.resolution)) continue;
      const pair = parseLinkProposalId(row.id);
      if (pair) rejected.add(pairKey(pair.occurrenceId, pair.bookingId));
    }
  }
  return rejected;
}

/**
 * Bookings that were linked to an occurrence before and are not any more (unlinked, undone):
 * the owner revisited that decision, so they are never linked on their own again, only proposed.
 */
export function previouslyLinkedBookingIds(
  tx: Executor,
  bookingIds: readonly string[],
): Set<string> {
  const result = new Set<string>();
  for (const part of chunks(bookingIds))
    for (const row of tx
      .select({ id: sql<string>`json_extract(${auditLog.beforeJson}, '$.booking_id')` })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityType, 'expected_occurrence'),
          sql`json_extract(${auditLog.beforeJson}, '$.booking_id') IN (${sql.join(
            part.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      )
      .all())
      result.add(row.id);
  return result;
}

/** A booking the owner rejected once is never linked on its own again, only proposed. */
export const rejectedBookingIds = (rejected: ReadonlySet<string>): Set<string> =>
  new Set([...rejected].map((pair) => pair.slice(pair.indexOf(':') + 1)));

/** An occurrence the owner rejected a booking for is never linked on its own again. */
export const rejectedOccurrenceIds = (rejected: ReadonlySet<string>): Set<string> =>
  new Set([...rejected].map((pair) => pair.slice(0, pair.indexOf(':'))));

export const isRejectedPair = (
  rejected: ReadonlySet<string>,
  occurrenceId: string,
  bookingId: string,
) => rejected.has(pairKey(occurrenceId, bookingId));

const money = (amountCents: number, currency: string) =>
  currency === 'EUR'
    ? formatEuro(cents(amountCents))
    : `${amountCents < 0 ? '−' : ''}${Math.trunc(Math.abs(amountCents) / 100)},${String(Math.abs(amountCents) % 100).padStart(2, '0')} ${currency}`;

/** Open the proposal task of a pairing unless it exists; returns its id. */
export function ensureLinkProposal(
  tx: Executor,
  input: {
    occurrence: OccurrenceRow;
    payment: Payment;
    currency: string;
    booking: { id: string; date: string; amountCents: number };
    /** Why the owner decides: shown in the task. */
    reason?: string;
  },
  ctx: GroupedContext,
): { id: string; created: boolean } {
  const id = linkProposalId(input.occurrence.id, input.booking.id);
  const existing = tx.select().from(inboxItem).where(eq(inboxItem.id, id)).get();
  if (existing) {
    // Closed by the system (superseded link, stale): the pairing is open again, show it again.
    // Closed by the owner: a dismissal stands.
    if (
      existing.resolvedAt !== null &&
      existing.resolution !== null &&
      SYSTEM_RESOLUTIONS.has(existing.resolution)
    ) {
      updateTracked(tx, inboxItem, [id], { resolvedAt: null, resolution: null }, ctx);
      return { id, created: true };
    }
    return { id, created: false };
  }
  insertTracked(
    tx,
    inboxItem,
    {
      id,
      kind: 'expected_payment',
      title: 'Abbuchung zuordnen',
      detail:
        `${input.payment.name} · fällig ${input.occurrence.dueDate} · erwartet ` +
        `${money(input.occurrence.expectedAmountCents, input.currency)} · Buchung ` +
        `${input.booking.date} · ${money(input.booking.amountCents, input.currency)} · ` +
        (input.reason ?? 'bitte bestätigen'),
      refType: LINK_PROPOSAL_REF,
      refId: input.occurrence.id,
    },
    ctx,
  );
  return { id, created: true };
}

/** Close the open proposals of an occurrence and of a booking (the pairing was decided). */
export function resolveLinkProposals(
  tx: Executor,
  target: { occurrenceId: string; bookingId?: string | null },
  resolution: string,
  ctx: GroupedContext,
): void {
  const ids = tx
    .select({ id: inboxItem.id })
    .from(inboxItem)
    .where(
      and(
        eq(inboxItem.refType, LINK_PROPOSAL_REF),
        isNull(inboxItem.resolvedAt),
        or(
          eq(inboxItem.refId, target.occurrenceId),
          target.bookingId
            ? like(inboxItem.id, `${PROPOSAL_PREFIX}%:${target.bookingId}`)
            : undefined,
        ),
      ),
    )
    .all()
    .map((row) => row.id);
  for (const id of ids)
    updateTracked(tx, inboxItem, [id], { resolvedAt: nowIso(), resolution }, ctx);
}

/**
 * Close proposals that can no longer be confirmed: the occurrence is settled, skipped or gone, or
 * the booking is deleted or belongs to another occurrence. A proposal of an occurrence whose
 * window has passed (`missed`) stays: the owner can still confirm it.
 */
export function closeStaleLinkProposals(
  tx: Executor,
  claimed: ReadonlySet<string>,
  ctx: GroupedContext,
): void {
  const open = tx
    .select({ id: inboxItem.id })
    .from(inboxItem)
    .where(and(eq(inboxItem.refType, LINK_PROPOSAL_REF), isNull(inboxItem.resolvedAt)))
    .all();
  const stale: string[] = [];
  for (const { id } of open) {
    const pair = parseLinkProposalId(id);
    const occurrence =
      pair &&
      tx
        .select({ status: expectedOccurrence.status, bookingId: expectedOccurrence.bookingId })
        .from(expectedOccurrence)
        .innerJoin(expectedPayment, eq(expectedPayment.id, expectedOccurrence.expectedPaymentId))
        .where(
          and(
            eq(expectedOccurrence.id, pair.occurrenceId),
            isNull(expectedOccurrence.deletedAt),
            isNull(expectedPayment.deletedAt),
          ),
        )
        .get();
    const cash =
      pair &&
      tx
        .select({ id: booking.id })
        .from(booking)
        .where(and(eq(booking.id, pair.bookingId), isNull(booking.deletedAt)))
        .get();
    const confirmable =
      pair &&
      occurrence &&
      cash &&
      occurrence.bookingId === null &&
      (occurrence.status === 'expected' || occurrence.status === 'missed') &&
      !claimed.has(pair.bookingId);
    if (!confirmable) stale.push(id);
  }
  for (const id of stale)
    updateTracked(tx, inboxItem, [id], { resolvedAt: nowIso(), resolution: RESOLUTION_STALE }, ctx);
}

/** Structured facts of a proposal for the task table; the stored detail text stays as it was. */
export interface LinkProposalView {
  paymentName: string;
  /** Payee of the payment when it differs from the name. */
  payeeName: string | null;
  dueDate: string;
  expectedAmountCents: number;
  bookingDate: string;
  bookingAmountCents: number;
  currency: string;
  /** Why the owner decides (last part of the stored detail). */
  reason: string;
}

export function linkProposalView(
  tx: Executor,
  pair: { occurrenceId: string; bookingId: string },
  detail: string | null,
): LinkProposalView | undefined {
  const row = tx
    .select({
      paymentName: expectedPayment.name,
      payeeName: payee.name,
      dueDate: expectedOccurrence.dueDate,
      expectedAmountCents: expectedOccurrence.expectedAmountCents,
      bookingDate: booking.date,
      bookingAmountCents: booking.amountCents,
      currency: account.currency,
    })
    .from(expectedOccurrence)
    .innerJoin(expectedPayment, eq(expectedPayment.id, expectedOccurrence.expectedPaymentId))
    .leftJoin(payee, eq(payee.id, expectedPayment.payeeId))
    .innerJoin(booking, eq(booking.id, pair.bookingId))
    .innerJoin(account, eq(account.id, booking.accountId))
    .where(eq(expectedOccurrence.id, pair.occurrenceId))
    .get();
  if (!row) return undefined;
  const reason = detail?.split(' · ').pop()?.trim() || 'bitte bestätigen';
  return {
    ...row,
    payeeName: row.payeeName && row.payeeName !== row.paymentName ? row.payeeName : null,
    reason,
  };
}
