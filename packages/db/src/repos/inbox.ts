import { and, asc, count, countDistinct, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import { account, booking, bookingSplit, inboxItem, payee } from '../schema';
import { nowIso, updateTracked, withGroup, type AuditContext } from './audit';
import { ConflictError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';
import { readSourceDisplayDetail, readSourceMappings } from './read-source';
import { listReceipts } from './receipts';

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
export type InboxEntry = InboxBooking | InboxStored;

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
  and(isNull(inboxItem.resolvedAt), sql`${inboxItem.kind} <> 'uncategorized'`);

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

/** Legacy stored uncategorized summaries are replaced by actual ledger work, never double counted. */
export function readInbox(db: Executor, today: string) {
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
    const entries: InboxEntry[] = [...bookings, ...stored];
    const unlinkedReceipts = listReceipts(tx);
    return { asOf: today, count: entries.length + unlinkedReceipts.length, entries };
  });
}

/** Header refreshes count IDs in SQL without materializing task titles/details. */
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
    return { asOf: today, count: bookings + stored + listReceipts(tx).length };
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
