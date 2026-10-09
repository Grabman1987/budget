import { and, asc, count, countDistinct, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import { cents, formatEuro, monthOf, overspentEnvelopes, summarizeMonth } from '@budget/domain';
import { categoryTree } from './categories';
import { budget } from './queries';
import {
  account,
  booking,
  bookingSplit,
  inboxItem,
  payee,
  bankSyncAccount,
  bankSyncCandidate,
} from '../schema';
import { nowIso, updateTracked, withGroup, type AuditContext } from './audit';
import { ConflictError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';
import { readSourceDisplayDetail, readSourceMappings } from './read-source';
import { listReceipts } from './receipts';
import { savingsExecutionProposals, type SavingsExecutionProposal } from './savings-plans';

export interface InboxBooking {
  type: 'booking';
  id: string;
  bookingId: string;
  kind: 'uncategorized';
  urgent: false;
  date: string;
  accountName: string;
  payeeName: string | null;
  memo: string | null;
  amountCents: number;
  currency: string;
  status: typeof booking.$inferSelect.status;
  source: typeof booking.$inferSelect.source;
  missingSplits: number;
}
export interface InboxStored {
  type: 'stored';
  id: string;
  kind: typeof inboxItem.$inferSelect.kind;
  title: string;
  detail: string | null;
  refType: string | null;
  refId: string | null;
  urgent: boolean;
  createdAt: string;
}
export interface InboxEnvelope {
  type: 'envelope';
  id: string;
  kind: 'overspent';
  categoryId: string;
  month: string;
  title: string;
  detail: string;
  urgent: true;
}
export type InboxEntry = InboxBooking | InboxStored | InboxEnvelope | SavingsExecutionProposal;

/** Shared predicates keep task list and lightweight badge count in agreement. */
const unclassifiedWhere = (today: string) =>
  and(
    isNull(booking.deletedAt),
    isNull(account.deletedAt),
    eq(account.onBudget, true),
    lte(booking.date, today),
    isNull(booking.transferId),
    isNull(bookingSplit.transferId),
    isNull(bookingSplit.categoryId),
    isNull(bookingSplit.incomeTypeId),
    sql`${bookingSplit.amountCents} <> 0`,
  );
const storedWhere = () =>
  and(isNull(inboxItem.resolvedAt), sql`${inboxItem.kind} NOT IN ('uncategorized', 'overspent')`);

/** Stored envelope warnings are superseded by the live ledger, exactly once per category. */
function envelopeTasks(db: Executor, today: string): InboxEnvelope[] {
  const month = monthOf(today);
  const [computed] = budget(db, [month]);
  if (!computed) return [];
  const tree = categoryTree(db);
  return overspentEnvelopes(summarizeMonth(computed, tree.categories)).map((e): InboxEnvelope => ({
    type: 'envelope',
    id: `envelope:${month}:${e.categoryId}`,
    kind: 'overspent',
    categoryId: e.categoryId,
    month,
    title: `${tree.categories.find((c) => c.id === e.categoryId)!.name} ist überzogen`,
    detail: `${formatEuro(cents(e.availableCents))} · im Plan decken`,
    urgent: true,
  }));
}

/** One task per actual booking, regardless of how many splits need classification. */
function uncategorizedBookings(db: Executor, today: string): InboxBooking[] {
  return db
    .select({
      id: booking.id,
      date: booking.date,
      accountName: account.name,
      payeeName: payee.name,
      memo: booking.memo,
      amountCents: booking.amountCents,
      currency: booking.currency,
      status: booking.status,
      source: booking.source,
      missingSplits: sql<number>`count(*)`,
    })
    .from(booking)
    .innerJoin(account, eq(account.id, booking.accountId))
    .innerJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
    .leftJoin(payee, eq(payee.id, booking.payeeId))
    .where(unclassifiedWhere(today))
    .groupBy(booking.id)
    .orderBy(asc(booking.date), asc(booking.id))
    .all()
    .map((row) => ({
      ...row,
      type: 'booking',
      id: `booking:${row.id}`,
      bookingId: row.id,
      kind: 'uncategorized',
      urgent: false,
    }));
}

/** Legacy classification/overspending summaries are replaced by live ledger work. */
export function readInbox(db: Executor, today: string, bankSource?: string) {
  return runInTransaction(db, (tx) => {
    const bookings = uncategorizedBookings(tx, today);
    const mappings = readSourceMappings(tx);
    const stored: InboxStored[] = tx
      .select()
      .from(inboxItem)
      .where(storedWhere())
      .orderBy(desc(inboxItem.urgent), asc(inboxItem.createdAt), asc(inboxItem.id))
      .all()
      .map((row) => ({
        type: 'stored',
        id: row.id,
        kind: row.kind,
        title: row.title,
        detail:
          row.refType === 'read_source' && row.refId === 'crypto'
            ? readSourceDisplayDetail(row.detail, mappings)
            : row.detail,
        refType: row.refType,
        refId: row.refId,
        urgent: row.urgent,
        createdAt: row.createdAt,
      }));
    let entries: InboxEntry[] = [
      ...envelopeTasks(tx, today),
      ...bookings,
      ...savingsExecutionProposals(tx, today),
      ...stored,
    ];
    if (bankSource) entries = filterBankSourceInbox(tx, entries, bankSource);
    const unlinkedReceipts = listReceipts(tx);
    return {
      asOf: today,
      count: entries.length + (bankSource ? 0 : unlinkedReceipts.length),
      entries,
    };
  });
}

/** Source identity, including linked/migrated bookings; never filter by display names. */
export function filterBankSourceInbox(db: Executor, entries: InboxEntry[], sourceId: string) {
  const source = db.select().from(bankSyncAccount).where(eq(bankSyncAccount.id, sourceId)).get();
  if (!source) return [];
  const candidates = db
    .select()
    .from(bankSyncCandidate)
    .where(eq(bankSyncCandidate.sourceId, sourceId))
    .all();
  const candidateIds = new Set(candidates.map((c) => c.id));
  const keys = new Set(candidates.map((c) => 'bank-sync:' + c.dedupeKey));
  const bookingIds = new Set(
    db
      .select()
      .from(booking)
      .where(eq(booking.accountId, source.accountId ?? ''))
      .all()
      .filter((b) => b.bankSourceId === sourceId || (b.importKey && keys.has(b.importKey)))
      .map((b) => 'booking:' + b.id),
  );
  return entries.filter((entry) => {
    if (entry.type === 'booking') return bookingIds.has(entry.id);
    if (entry.type !== 'stored') return false;
    if (candidateIds.has(entry.id)) return true;
    return (
      entry.refType === 'bank-sync' &&
      (candidateIds.has(entry.refId ?? '') ||
        entry.id.startsWith('bank-error:' + sourceId + ':') ||
        entry.id === 'bank-skipped:' + sourceId ||
        (entry.refId === source.accountId && entry.id.startsWith('bank-balance')))
    );
  });
}

/** Booking/stored counts use SQL; derived tasks share the queue's read-only projections. */
export function readInboxCount(db: Executor, today: string) {
  return runInTransaction(db, (tx) => {
    const bookings = tx
      .select({ count: countDistinct(booking.id) })
      .from(booking)
      .innerJoin(account, eq(account.id, booking.accountId))
      .innerJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
      .where(unclassifiedWhere(today))
      .get()!.count;
    const stored = tx.select({ count: count() }).from(inboxItem).where(storedWhere()).get()!.count;
    return {
      asOf: today,
      count:
        envelopeTasks(tx, today).length +
        bookings +
        stored +
        listReceipts(tx).length +
        savingsExecutionProposals(tx, today).length,
    };
  });
}

/** Acknowledgement changes only the stored decision; it does not claim a source repair. */
export function resolveInboxItem(db: Executor, id: string, ctx: AuditContext) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const row = tx.select().from(inboxItem).where(eq(inboxItem.id, id)).get();
    if (!row) throw new EntityNotFoundError('inbox_item', id);
    if (row.kind === 'uncategorized')
      throw new ConflictError('Eine fehlende Kategorie wird in der Buchung ergänzt.');
    if (row.kind === 'overspent') throw new ConflictError('Eine Überziehung wird im Plan gedeckt.');
    if (row.refType === 'payslip-intake')
      throw new ConflictError('Bitte den Gehaltszettel bestätigen oder ablehnen.');
    if (row.resolvedAt !== null) throw new ConflictError('Diese Aufgabe wurde bereits erledigt.');
    updateTracked(
      tx,
      inboxItem,
      [id],
      { resolvedAt: nowIso(), resolution: 'Vom Nutzer als erledigt markiert' },
      grouped,
    );
    return { id, groupId: grouped.groupId };
  });
}
