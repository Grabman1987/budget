import { createHash } from 'node:crypto';
import { assertContactBookingWrite } from './contact-invariants';
import { assertStatementBookingWrite } from './statement-settlement-invariants';
import { assertTradeSettlementBookingWrite, relatedTransferBookings } from './invariants';
import { BookingInvariantError, ConflictError } from './errors';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { account, auditLog, bankSyncCandidate, booking, bookingSplit, contactAllocation, contactSettlement,
  expectedOccurrence, expectedPayment, payee, payslip, statementBonus, statementSettlement, trade } from '../schema';
import { statementAutomationRow } from '../schema/statement-automation';
import { hasStatementAutomation } from './statement-automation-invariants';
import { hasStatementSettlementFamily } from './statement-settlement-invariants';
import { runInTransaction, type Executor } from './types';

export type BookingBulkReason = 'not_found' | 'reconciled_locked' | 'linked_transfer' | 'linked_contact' |
  'linked_expected' | 'linked_trade' | 'linked_payroll' | 'linked_statement' | 'linked_document' | 'linked_bank' | 'invalid';
export interface BookingBulkItem {
  id: string; date: string; description: string; accountId: string; accountName: string;
  amountCents: number | null; currency: string; projectId: string | null; reason: BookingBulkReason | null;
}
export interface BookingBulkSelection {
  selectedCount: number;
  items: BookingBulkItem[];
  missingIds: string[];
  totals: { currency: string; count: number; cents: number | null; unavailable: 'unsafe_total' | null }[];
}

/** Stricter BULK-only ownership policy. Ordinary metadata writers keep their existing exceptions. */
export function readBookingBulkSelection(db: Executor, requested: readonly string[]): BookingBulkSelection {
  const ids = [...new Set(requested)];
  if (ids.length > 500) throw new RangeError('At most500 selected bookings');
  return runInTransaction(db, (tx) => {
    const items: BookingBulkItem[] = [];
    const settlementFamily = hasStatementSettlementFamily(tx), automationFamily = hasStatementAutomation(tx);
    // Bounded SQL parameters, minimal audit identity projections, no private history snapshots returned.
    for (let at = 0; at < ids.length; at += 200) {
      const part = ids.slice(at, at + 200), wanted = new Set(part);
      const rows = tx.select({ b: booking, a: account, p: payee }).from(booking)
        .innerJoin(account, eq(account.id, booking.accountId)).leftJoin(payee, eq(payee.id, booking.payeeId))
        .where(and(inArray(booking.id, part), isNull(booking.deletedAt), isNull(account.deletedAt))).all();
      const splits = tx.select({ bookingId: bookingSplit.bookingId, transferId: bookingSplit.transferId, contactId: bookingSplit.contactId })
        .from(bookingSplit).where(inArray(bookingSplit.bookingId, part)).all();
      const contacts = new Set(tx.select({ id: contactSettlement.bookingId }).from(contactSettlement)
        .where(inArray(contactSettlement.bookingId, part)).all().map((r) => r.id));
      for (const row of tx.select({ id: bookingSplit.bookingId }).from(contactAllocation)
        .innerJoin(contactSettlement, eq(contactSettlement.id, contactAllocation.settlementId))
        .innerJoin(bookingSplit, eq(bookingSplit.id, contactAllocation.outlaySplitId))
        .where(and(inArray(bookingSplit.bookingId, part), isNull(contactAllocation.deletedAt), isNull(contactSettlement.deletedAt))).all()) contacts.add(row.id);
      const expected = new Set(tx.select({ id: expectedOccurrence.bookingId }).from(expectedOccurrence)
        .where(and(inArray(expectedOccurrence.bookingId, part), isNull(expectedOccurrence.deletedAt))).all().map((r) => r.id));
      const trades = new Set(tx.select({ id: trade.bookingId }).from(trade).where(inArray(trade.bookingId, part)).all().map((r) => r.id));
      const before = sql<string | null>`json_extract(${auditLog.beforeJson}, '$.booking_id')`, after = sql<string | null>`json_extract(${auditLog.afterJson}, '$.booking_id')`;
      for (const row of tx.select({ before, after }).from(auditLog).where(and(eq(auditLog.entityType, 'trade'), or(inArray(before, part), inArray(after, part)))).all()) {
        if (row.before && wanted.has(row.before)) trades.add(row.before);
        if (row.after && wanted.has(row.after)) trades.add(row.after);
      }
      const payroll = new Set(tx.select({ id: payslip.bookingId }).from(payslip)
        .where(and(inArray(payslip.bookingId, part), isNull(payslip.deletedAt))).all().map((r) => r.id));
      const statements = new Set<string>(), documents = new Set<string>();
      if (settlementFamily) {
        for (const row of tx.select({ from: statementSettlement.fromBookingId, to: statementSettlement.toBookingId }).from(statementSettlement)
          .where(and(isNull(statementSettlement.deletedAt), eq(statementSettlement.state, 'represented'),
            or(inArray(statementSettlement.fromBookingId, part), inArray(statementSettlement.toBookingId, part)))).all()) {
          if (row.from && wanted.has(row.from)) statements.add(row.from);
          if (row.to && wanted.has(row.to)) statements.add(row.to);
        }
        for (const row of tx.select({ id: statementBonus.bookingId }).from(statementBonus)
          .where(and(isNull(statementBonus.deletedAt), sql`${statementBonus.state} NOT IN ('withdrawn','superseded')`, inArray(statementBonus.bookingId, part))).all())
          if (row.id) statements.add(row.id);
        const parameters = sql.join(part.map((id) => sql`${id}`), sql`, `);
        for (const row of tx.all<{ id: string }>(sql`SELECT json_extract(j.value,'$.bookingId') AS id FROM statement_bonus sb, json_each(sb.evidence_json,'$.selectedOriginals') j WHERE sb.deleted_at IS NULL AND sb.state NOT IN ('withdrawn','superseded') AND json_extract(j.value,'$.bookingId') IN (${parameters})`)) statements.add(row.id);
      }
      if (automationFamily) {
        for (const row of tx.select({ id: statementAutomationRow.bookingId, original: statementAutomationRow.originalBookingId }).from(statementAutomationRow)
          .where(and(isNull(statementAutomationRow.deletedAt), or(inArray(statementAutomationRow.bookingId, part), inArray(statementAutomationRow.originalBookingId, part)))).all()) {
          if (wanted.has(row.id)) documents.add(row.id);
          if (row.original && wanted.has(row.original)) documents.add(row.original);
        }
      }
      const bank = new Set(tx.select({ id: booking.id }).from(booking).innerJoin(bankSyncCandidate,
        and(eq(bankSyncCandidate.accountId, booking.accountId), sql`${booking.importKey} = 'bank-sync:' || ${bankSyncCandidate.dedupeKey}`))
        .where(inArray(booking.id, part)).all().map((r) => r.id));
      for (const { b, a, p } of rows) {
        const own = splits.filter((s) => s.bookingId === b.id);
        const reason: BookingBulkReason | null = b.status === 'reconciled' ? 'reconciled_locked'
          : b.transferId || own.some((s) => s.transferId) ? 'linked_transfer'
          : contacts.has(b.id) || own.some((s) => s.contactId) ? 'linked_contact'
          : expected.has(b.id) ? 'linked_expected' : trades.has(b.id) ? 'linked_trade'
          : payroll.has(b.id) ? 'linked_payroll' : documents.has(b.id) ? 'linked_document'
          : statements.has(b.id) ? 'linked_statement' : bank.has(b.id) ? 'linked_bank'
          : !Number.isSafeInteger(b.amountCents) ? 'invalid' : null;
        items.push({ id: b.id, date: b.date, description: b.bankRawPayee || (p && !p.deletedAt ? p.name : '') || b.memo || 'Buchung',
          accountId: b.accountId, accountName: a.name, amountCents: Number.isSafeInteger(b.amountCents) ? b.amountCents : null,
          currency: b.currency, projectId: b.projectId, reason });
      }
    }
    const byId = new Map(items.map((r) => [r.id, r]));
    const groups = new Map<string, { count: number; total: bigint; unsafe: boolean }>();
    for (const item of items) {
      const group = groups.get(item.currency) ?? { count: 0, total: 0n, unsafe: false };
      group.count += 1;
      if (item.amountCents === null) group.unsafe = true; else group.total += BigInt(item.amountCents);
      groups.set(item.currency, group);
    }
    const bound = BigInt(Number.MAX_SAFE_INTEGER);
    return { selectedCount: ids.length, items: ids.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []), missingIds: ids.filter((id) => !byId.has(id)),
      totals: [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]) => {
        const unsafe = value.unsafe || value.total > bound || value.total < -bound;
        return { currency, count: value.count, cents: unsafe ? null : Number(value.total), unavailable: unsafe ? 'unsafe_total' as const : null };
      }) };
  });
}

export interface BookingDeletePreview {
  mode: 'bulk' | 'single';
  ids: string[];
  affectedIds: string[];
  selection: BookingBulkSelection;
  eligibleIds: string[];
  skipped: { id: string; reason: BookingBulkReason; booking?: BookingBulkItem }[];
  eligibleTotals: BookingBulkSelection['totals'];
  revision: string;
  protected: boolean;
  requiresUnlock: boolean;
  blocked: 'not_found' | 'invalid' | 'protected_link' | null;
  expectedLinkCount: number;
}

function deleteTotals(items: readonly BookingBulkItem[]): BookingBulkSelection['totals'] {
  const groups = new Map<string, { count: number; total: bigint; unsafe: boolean }>();
  for (const item of items) {
    const g = groups.get(item.currency) ?? { count: 0, total: 0n, unsafe: false };
    g.count++;
    if (item.amountCents === null) g.unsafe = true; else g.total += BigInt(item.amountCents);
    groups.set(item.currency, g);
  }
  const bound = BigInt(Number.MAX_SAFE_INTEGER);
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([currency, g]) => {
    const unsafe = g.unsafe || g.total < -bound || g.total > bound;
    return { currency, count: g.count, cents: unsafe ? null : Number(g.total), unavailable: unsafe ? 'unsafe_total' as const : null };
  });
}

/** Read-only intent snapshot. No writer is run or rolled back to determine a preview. */
export function readBookingDeletePreview(db: Executor, requested: readonly string[], mode: 'bulk' | 'single' = 'bulk'): BookingDeletePreview {
  const ids = [...new Set(requested)].sort();
  if (!ids.length || ids.length > 500 || (mode === 'single' && ids.length !== 1))
    throw new RangeError('Invalid delete selection');
  return runInTransaction(db, (tx) => {
    const affectedIds = mode === 'single' ? [...new Set(relatedTransferBookings(tx, ids[0]!))].sort() : ids;
    if (affectedIds.length > 500) throw new RangeError('At most500 affected bookings');
    const selection = readBookingBulkSelection(tx, affectedIds);
    const skipped: BookingDeletePreview['skipped'] = [
      ...selection.items.flatMap((item) => item.reason ? [{ id: item.id, reason: item.reason, booking: item }] : []),
      ...selection.missingIds.map((id) => ({ id, reason: 'not_found' as const })),
    ];
    let blocked: BookingDeletePreview['blocked'] = null;
    if (mode === 'single') {
      if (!selection.items.some((row) => row.id === ids[0])) blocked = 'not_found';
      else if (selection.items.some((row) => row.amountCents === null)) blocked = 'invalid';
      else {
        try {
          // These are the same read-only guards invoked by the ordinary delete writer. Bulk
          // reasons alone do not grant or refuse ordinary single deletion (e.g. expected links).
          for (const id of affectedIds) {
            assertTradeSettlementBookingWrite(tx, id, 'delete');
            assertContactBookingWrite(tx, id, 'delete');
            assertStatementBookingWrite(tx, id, 'delete');
          }
        } catch (error) {
          if (!(error instanceof BookingInvariantError) && !(error instanceof ConflictError)) throw error;
          blocked = 'protected_link';
        }
      }
    }
    const eligible = mode === 'single' ? (blocked ? [] : selection.items) : selection.items.filter((item) => item.reason === null);
    // Retain whole source state only inside this hash: no raw snapshots/audit JSON reach the DTO.
    // Global audit head is a conservative ABA fence, including undo/redo and unrelated writes.
    const head = tx.get<{ ordinal: string; id: string }>(sql`SELECT CAST(rowid AS TEXT) AS ordinal,id FROM audit_log ORDER BY rowid DESC LIMIT 1`) ?? null;
    const source: unknown[] = [];
    let expectedLinkCount = 0;
    for (let at = 0; at < affectedIds.length; at += 200) {
      const part = affectedIds.slice(at, at + 200);
      const rows = tx.select().from(booking).where(inArray(booking.id, part)).orderBy(booking.id).all();
      const splitRows = tx.select().from(bookingSplit).where(inArray(bookingSplit.bookingId, part)).orderBy(bookingSplit.id).all();
      const accountIds = [...new Set(rows.map((row) => row.accountId))];
      const accounts = accountIds.length ? tx.select().from(account).where(inArray(account.id, accountIds)).orderBy(account.id).all() : [];
      const payeeIds = [...new Set(rows.flatMap((row) => row.payeeId ? [row.payeeId] : []))];
      const payees = payeeIds.length ? tx.select({ id: payee.id, name: payee.name, deletedAt: payee.deletedAt }).from(payee).where(inArray(payee.id, payeeIds)).orderBy(payee.id).all() : [];
      const occurrences = tx.select().from(expectedOccurrence).where(inArray(expectedOccurrence.bookingId, part)).orderBy(expectedOccurrence.id).all();
      expectedLinkCount += tx.select({ id: expectedOccurrence.id }).from(expectedOccurrence)
        .innerJoin(expectedPayment, eq(expectedPayment.id, expectedOccurrence.expectedPaymentId))
        .where(and(inArray(expectedOccurrence.bookingId, part), isNull(expectedOccurrence.deletedAt), isNull(expectedPayment.deletedAt))).all().length;
      const bankRows = tx.select({ bookingId: booking.id, candidate: bankSyncCandidate }).from(booking)
        .innerJoin(bankSyncCandidate, and(eq(bankSyncCandidate.accountId, booking.accountId), sql`${booking.importKey} = 'bank-sync:' || ${bankSyncCandidate.dedupeKey}`))
        .where(inArray(booking.id, part)).orderBy(booking.id, bankSyncCandidate.id).all();
      const contactRows = tx.select().from(contactSettlement).where(inArray(contactSettlement.bookingId, part)).orderBy(contactSettlement.id).all();
      const allocations = tx.select({ allocation: contactAllocation, settlement: contactSettlement }).from(contactAllocation)
        .innerJoin(contactSettlement, eq(contactSettlement.id, contactAllocation.settlementId))
        .innerJoin(bookingSplit, eq(bookingSplit.id, contactAllocation.outlaySplitId))
        .where(inArray(bookingSplit.bookingId, part)).orderBy(contactAllocation.id).all();
      const tradeRows = tx.select().from(trade).where(inArray(trade.bookingId, part)).orderBy(trade.id).all();
      const salaryRows = tx.select({ id: payslip.id, bookingId: payslip.bookingId, deletedAt: payslip.deletedAt, updatedAt: payslip.updatedAt })
        .from(payslip).where(inArray(payslip.bookingId, part)).orderBy(payslip.id).all();
      source.push({ rows, splitRows, accounts, payees, occurrences, bankRows, contactRows, allocations, tradeRows, salaryRows });
      if (hasStatementAutomation(tx)) source.push(tx.select({ id: statementAutomationRow.id, runId: statementAutomationRow.runId, bookingId: statementAutomationRow.bookingId, originalBookingId: statementAutomationRow.originalBookingId, accountId: statementAutomationRow.accountId, receiptId: statementAutomationRow.receiptId, actionGroupId: statementAutomationRow.actionGroupId, deletedAt: statementAutomationRow.deletedAt, updatedAt: statementAutomationRow.updatedAt }).from(statementAutomationRow)
        .where(or(inArray(statementAutomationRow.bookingId, part), inArray(statementAutomationRow.originalBookingId, part))).orderBy(statementAutomationRow.id).all());
      if (hasStatementSettlementFamily(tx)) {
        source.push(tx.select({ id: statementSettlement.id, state: statementSettlement.state, fromBookingId: statementSettlement.fromBookingId, toBookingId: statementSettlement.toBookingId, actionGroupId: statementSettlement.actionGroupId, deletedAt: statementSettlement.deletedAt, updatedAt: statementSettlement.updatedAt }).from(statementSettlement).where(or(inArray(statementSettlement.fromBookingId, part), inArray(statementSettlement.toBookingId, part))).orderBy(statementSettlement.id).all());
        // Selected-original identities are already checked by the authoritative read above;
        // audited bonus changes are also covered by head, without copying unrelated history.
        source.push(tx.select({ id: statementBonus.id, state: statementBonus.state, bookingId: statementBonus.bookingId, actionGroupId: statementBonus.actionGroupId, deletedAt: statementBonus.deletedAt, updatedAt: statementBonus.updatedAt }).from(statementBonus).where(inArray(statementBonus.bookingId, part)).orderBy(statementBonus.id).all());
      }
    }
    const revision = createHash('sha256').update(JSON.stringify(['booking-delete-v1', mode, ids, affectedIds, head, source, selection, blocked])).digest('hex');
    return { mode, ids, affectedIds, selection, eligibleIds: eligible.map((item) => item.id), skipped,
      eligibleTotals: deleteTotals(eligible), revision,
      protected: mode === 'single' && (affectedIds.length > 1 || selection.items.some((item) => item.reason !== null) || blocked !== null),
      requiresUnlock: mode === 'single' && selection.items.some((item) => item.reason === 'reconciled_locked'), blocked, expectedLinkCount };
  });
}

export type ProtectedBulkSet = { date: string } | { memo: string | null } | { payeeId: string | null };
export type ProtectedBulkReason = BookingBulkReason | 'source_effect';
export interface BookingBulkEditPreview {
  ids: string[];
  set: ProtectedBulkSet;
  selection: BookingBulkSelection;
  rows: { id: string; before: string | null; after: string | null; reason: ProtectedBulkReason | null; unchanged: boolean }[];
  eligibleIds: string[];
  revision: string;
}

/** Field-specific conservative preflight. No writer is executed to discover eligibility. */
export function readBookingBulkEditPreview(db: Executor, requested: readonly string[], set: ProtectedBulkSet): BookingBulkEditPreview {
  if (!requested.length || requested.length > 100 || new Set(requested).size !== requested.length)
    throw new RangeError('Select one to100 distinct bookings');
  const ids = [...requested].sort();
  return runInTransaction(db, (tx) => {
    // Reuse only the internal source fingerprint, never its single-delete permission model.
    const source = readBookingDeletePreview(tx, ids, 'bulk');
    const targetPayee = 'payeeId' in set && set.payeeId
      ? tx.select().from(payee).where(eq(payee.id, set.payeeId)).get() ?? null : null;
    if ('payeeId' in set && set.payeeId && (!targetPayee || targetPayee.deletedAt !== null || targetPayee.systemKind !== null))
      throw new BookingInvariantError('Der Empfänger ist nicht mehr verfügbar.');
    const field = 'date' in set ? 'date' : 'memo' in set ? 'memo' : 'payeeId';
    const after = 'date' in set ? set.date : 'memo' in set ? set.memo : set.payeeId;
    const rows = ids.map((id): BookingBulkEditPreview['rows'][number] => {
      const row = tx.select().from(booking).where(eq(booking.id, id)).get();
      const before = row ? row[field] : null;
      const item = source.selection.items.find((r) => r.id === id);
      let reason: ProtectedBulkReason | null = item?.reason ?? (item ? null : 'not_found');
      if (row && reason === null) {
        const currentPayee = row.payeeId ? tx.select().from(payee).where(eq(payee.id, row.payeeId)).get() : null;
        // Existing bank and imported writers can retain raw text, learn mappings or normalise
        // legacy FX fees. A field-only bulk operation does not grant those collateral writes.
        const splits = tx.select().from(bookingSplit).where(eq(bookingSplit.bookingId, id)).all();
        if (row.source !== 'manual' || row.originalAmountCents !== null || currentPayee?.systemKind ||
          (field === 'payeeId' && (row.status === 'pending' || splits.some((s) => !s.categoryId && !s.incomeTypeId && s.amountCents !== 0))))
          reason = 'source_effect';
        try {
          assertStatementBookingWrite(tx, id, 'update', [field]);
          assertTradeSettlementBookingWrite(tx, id, 'update', [field]);
          assertContactBookingWrite(tx, id, 'update', [field]);
        } catch (error) {
          if (!(error instanceof BookingInvariantError) && !(error instanceof ConflictError)) throw error;
          reason = 'invalid';
        }
      }
      return { id, before, after, reason, unchanged: before === after };
    });
    const revision = createHash('sha256').update(JSON.stringify(['booking-bulk-edit-v1', ids, set, source.revision, targetPayee, rows])).digest('hex');
    return { ids, set, selection: source.selection, rows,
      eligibleIds: rows.filter((r) => r.reason === null && !r.unchanged).map((r) => r.id), revision };
  });
}
