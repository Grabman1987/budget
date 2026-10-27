import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  account,
  auditLog,
  bankSyncCandidate,
  booking,
  bookingSplit,
  contactAllocation,
  contactSettlement,
  expectedOccurrence,
  payee,
  payslip,
  statementBonus,
  statementSettlement,
  trade,
} from '../schema';
import { statementAutomationRow } from '../schema/statement-automation';
import { hasStatementAutomation } from './statement-automation-invariants';
import { hasStatementSettlementFamily } from './statement-settlement-invariants';
import { runInTransaction, type Executor } from './types';
import { assertContactBookingWrite } from './contact-invariants';
import { BookingInvariantError } from './errors';

export type BookingBulkReason =
  | 'not_found'
  | 'reconciled_locked'
  | 'linked_transfer'
  | 'linked_contact'
  | 'linked_expected'
  | 'linked_trade'
  | 'linked_payroll'
  | 'linked_statement'
  | 'linked_document'
  | 'linked_bank'
  | 'invalid';
export interface BookingBulkItem {
  id: string;
  date: string;
  description: string;
  accountId: string;
  accountName: string;
  amountCents: number | null;
  currency: string;
  projectId: string | null;
  reason: BookingBulkReason | null;
}
export interface BookingBulkSelection {
  selectedCount: number;
  items: BookingBulkItem[];
  missingIds: string[];
  totals: {
    currency: string;
    count: number;
    cents: number | null;
    unavailable: 'unsafe_total' | null;
  }[];
}

/** Stricter BULK-only ownership policy. Ordinary metadata writers keep their existing exceptions. */
export function readBookingBulkSelection(
  db: Executor,
  requested: readonly string[],
  policy: 'update' | 'delete' = 'update',
): BookingBulkSelection {
  const ids = [...new Set(requested)];
  if (ids.length > 500) throw new RangeError('At most500 selected bookings');
  return runInTransaction(db, (tx) => {
    const items: BookingBulkItem[] = [];
    const settlementFamily = hasStatementSettlementFamily(tx),
      automationFamily = hasStatementAutomation(tx);
    // Bounded SQL parameters, minimal audit identity projections, no private history snapshots returned.
    for (let at = 0; at < ids.length; at += 200) {
      const part = ids.slice(at, at + 200),
        wanted = new Set(part);
      const rows = tx
        .select({ b: booking, a: account, p: payee })
        .from(booking)
        .innerJoin(account, eq(account.id, booking.accountId))
        .leftJoin(payee, eq(payee.id, booking.payeeId))
        .where(and(inArray(booking.id, part), isNull(booking.deletedAt), isNull(account.deletedAt)))
        .all();
      const splits = tx
        .select({
          bookingId: bookingSplit.bookingId,
          transferId: bookingSplit.transferId,
          contactId: bookingSplit.contactId,
        })
        .from(bookingSplit)
        .where(inArray(bookingSplit.bookingId, part))
        .all();
      const contacts = new Set(
        tx
          .select({ id: contactSettlement.bookingId })
          .from(contactSettlement)
          .where(inArray(contactSettlement.bookingId, part))
          .all()
          .map((r) => r.id),
      );
      for (const row of tx
        .select({ id: bookingSplit.bookingId })
        .from(contactAllocation)
        .innerJoin(contactSettlement, eq(contactSettlement.id, contactAllocation.settlementId))
        .innerJoin(bookingSplit, eq(bookingSplit.id, contactAllocation.outlaySplitId))
        .where(
          and(
            inArray(bookingSplit.bookingId, part),
            isNull(contactAllocation.deletedAt),
            isNull(contactSettlement.deletedAt),
          ),
        )
        .all())
        contacts.add(row.id);
      const expected = new Set(
        tx
          .select({ id: expectedOccurrence.bookingId })
          .from(expectedOccurrence)
          .where(
            and(inArray(expectedOccurrence.bookingId, part), isNull(expectedOccurrence.deletedAt)),
          )
          .all()
          .map((r) => r.id),
      );
      const trades = new Set(
        tx
          .select({ id: trade.bookingId })
          .from(trade)
          .where(inArray(trade.bookingId, part))
          .all()
          .map((r) => r.id),
      );
      const before = sql<string | null>`json_extract(${auditLog.beforeJson}, '$.booking_id')`,
        after = sql<string | null>`json_extract(${auditLog.afterJson}, '$.booking_id')`;
      for (const row of tx
        .select({ before, after })
        .from(auditLog)
        .where(
          and(eq(auditLog.entityType, 'trade'), or(inArray(before, part), inArray(after, part))),
        )
        .all()) {
        if (row.before && wanted.has(row.before)) trades.add(row.before);
        if (row.after && wanted.has(row.after)) trades.add(row.after);
      }
      const payroll = new Set(
        tx
          .select({ id: payslip.bookingId })
          .from(payslip)
          .where(and(inArray(payslip.bookingId, part), isNull(payslip.deletedAt)))
          .all()
          .map((r) => r.id),
      );
      const statements = new Set<string>(),
        documents = new Set<string>();
      if (settlementFamily) {
        for (const row of tx
          .select({ from: statementSettlement.fromBookingId, to: statementSettlement.toBookingId })
          .from(statementSettlement)
          .where(
            and(
              isNull(statementSettlement.deletedAt),
              eq(statementSettlement.state, 'represented'),
              or(
                inArray(statementSettlement.fromBookingId, part),
                inArray(statementSettlement.toBookingId, part),
              ),
            ),
          )
          .all()) {
          if (row.from && wanted.has(row.from)) statements.add(row.from);
          if (row.to && wanted.has(row.to)) statements.add(row.to);
        }
        for (const row of tx
          .select({ id: statementBonus.bookingId })
          .from(statementBonus)
          .where(
            and(
              isNull(statementBonus.deletedAt),
              sql`${statementBonus.state} NOT IN ('withdrawn','superseded')`,
              inArray(statementBonus.bookingId, part),
            ),
          )
          .all())
          if (row.id) statements.add(row.id);
        const parameters = sql.join(
          part.map((id) => sql`${id}`),
          sql`, `,
        );
        for (const row of tx.all<{ id: string }>(
          sql`SELECT json_extract(j.value,'$.bookingId') AS id FROM statement_bonus sb, json_each(sb.evidence_json,'$.selectedOriginals') j WHERE sb.deleted_at IS NULL AND sb.state NOT IN ('withdrawn','superseded') AND json_extract(j.value,'$.bookingId') IN (${parameters})`,
        ))
          statements.add(row.id);
      }
      if (automationFamily) {
        for (const row of tx
          .select({
            id: statementAutomationRow.bookingId,
            original: statementAutomationRow.originalBookingId,
          })
          .from(statementAutomationRow)
          .where(
            and(
              isNull(statementAutomationRow.deletedAt),
              or(
                inArray(statementAutomationRow.bookingId, part),
                inArray(statementAutomationRow.originalBookingId, part),
              ),
            ),
          )
          .all()) {
          if (wanted.has(row.id)) documents.add(row.id);
          if (row.original && wanted.has(row.original)) documents.add(row.original);
        }
      }
      const bank = new Set(
        tx
          .select({ id: booking.id })
          .from(booking)
          .innerJoin(
            bankSyncCandidate,
            and(
              eq(bankSyncCandidate.accountId, booking.accountId),
              sql`${booking.importKey} = 'bank-sync:' || ${bankSyncCandidate.dedupeKey}`,
            ),
          )
          .where(inArray(booking.id, part))
          .all()
          .map((r) => r.id),
      );
      for (const { b, a, p } of rows) {
        const own = splits.filter((s) => s.bookingId === b.id);
        let deleteContact = false;
        if (policy === 'delete') {
          try {
            assertContactBookingWrite(tx, b.id, 'delete');
          } catch (error) {
            if (!(error instanceof BookingInvariantError)) throw error;
            deleteContact = true;
          }
        }
        const deleteReason: BookingBulkReason | null =
          b.status === 'reconciled'
            ? 'reconciled_locked'
            : deleteContact
              ? 'linked_contact'
              : trades.has(b.id)
                ? 'linked_trade'
                : documents.has(b.id)
                  ? 'linked_document'
                  : statements.has(b.id)
                    ? 'linked_statement'
                    : !Number.isSafeInteger(b.amountCents)
                      ? 'invalid'
                      : null;
        const reason: BookingBulkReason | null =
          policy === 'delete'
            ? deleteReason
            : b.status === 'reconciled'
              ? 'reconciled_locked'
              : b.transferId || own.some((s) => s.transferId)
                ? 'linked_transfer'
                : contacts.has(b.id) || own.some((s) => s.contactId)
                  ? 'linked_contact'
                  : expected.has(b.id)
                    ? 'linked_expected'
                    : trades.has(b.id)
                      ? 'linked_trade'
                      : payroll.has(b.id)
                        ? 'linked_payroll'
                        : documents.has(b.id)
                          ? 'linked_document'
                          : statements.has(b.id)
                            ? 'linked_statement'
                            : b.bankSourceId !== null || bank.has(b.id)
                              ? 'linked_bank'
                              : !Number.isSafeInteger(b.amountCents)
                                ? 'invalid'
                                : null;
        items.push({
          id: b.id,
          date: b.date,
          description: b.bankRawPayee || (p && !p.deletedAt ? p.name : '') || b.memo || 'Buchung',
          accountId: b.accountId,
          accountName: a.name,
          amountCents: Number.isSafeInteger(b.amountCents) ? b.amountCents : null,
          currency: b.currency,
          projectId: b.projectId,
          reason,
        });
      }
    }
    const byId = new Map(items.map((r) => [r.id, r]));
    const groups = new Map<string, { count: number; total: bigint; unsafe: boolean }>();
    for (const item of items) {
      const group = groups.get(item.currency) ?? { count: 0, total: 0n, unsafe: false };
      group.count += 1;
      if (item.amountCents === null) group.unsafe = true;
      else group.total += BigInt(item.amountCents);
      groups.set(item.currency, group);
    }
    const bound = BigInt(Number.MAX_SAFE_INTEGER);
    return {
      selectedCount: ids.length,
      items: ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
      missingIds: ids.filter((id) => !byId.has(id)),
      totals: [...groups]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, value]) => {
          const unsafe = value.unsafe || value.total > bound || value.total < -bound;
          return {
            currency,
            count: value.count,
            cents: unsafe ? null : Number(value.total),
            unavailable: unsafe ? ('unsafe_total' as const) : null,
          };
        }),
    };
  });
}
