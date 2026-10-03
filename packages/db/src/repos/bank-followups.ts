import { randomUUID } from 'node:crypto';
import {
  bankMatches,
  canLinkTransfer,
  addDays,
  withinBankWindow,
  type MatchBooking,
} from '@budget/domain';
import { and, desc, eq, isNull, lte, gte, or } from 'drizzle-orm';
import {
  account,
  bankSyncAccount,
  bankSyncCandidate,
  booking,
  bookingReceipt,
  bookingSplit,
  inboxItem,
  transfer,
  expectedOccurrence,
} from '../schema';
import { insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import {
  createBooking,
  deleteBooking,
  getBooking,
  updateBooking,
  restoreBooking,
} from './bookings';
import { assertContactBookingWrite } from './contact-invariants';
import {
  assertLedgerInvariants,
  assertTradeSettlementBookingWrite,
  relatedTransferBookings,
} from './invariants';
import { expectedLinkPatches } from './expected-links';
import { ConflictError, EntityNotFoundError, ReconciledLockedError } from './errors';
import { bookedBalance, listReconciliations, reconcileAccount } from './reconciliation';
import { runInTransaction, type Executor } from './types';

function openAccount(db: Executor, id: string) {
  const row = db.select().from(account).where(eq(account.id, id)).get();
  if (!row || row.deletedAt || row.closedAt) throw new ConflictError('Konto nicht verfügbar.');
  return row;
}

function openCandidate(db: Executor, id: string) {
  const row = db.select().from(bankSyncCandidate).where(eq(bankSyncCandidate.id, id)).get();
  const item = db.select().from(inboxItem).where(eq(inboxItem.id, id)).get();
  if (!row || !item) throw new EntityNotFoundError('bank_sync_candidate', id);
  if (item.resolvedAt) throw new ConflictError('Dieser Bankumsatz wurde bereits bearbeitet.');
  if (openAccount(db, row.accountId).currency !== row.currency)
    throw new ConflictError('Währung stimmt nicht überein.');
  return row;
}

function mergeable(db: Executor, id: string) {
  const row = getBooking(db, id);
  if (!row) throw new EntityNotFoundError('booking', id);
  openAccount(db, row.accountId);
  if (row.status === 'reconciled') throw new ReconciledLockedError([id]);
  if (row.source !== 'manual' || row.importKey || row.originalCurrency)
    throw new ConflictError('Diese Buchung ist bereits mit einer Quelle verbunden.');
  assertContactBookingWrite(db, id, 'update', ['date', 'source', 'importKey']);
  assertTradeSettlementBookingWrite(db, id, 'update', ['date', 'source', 'importKey']);
  return row;
}

/** Eligibility excludes protected financial relationships, even from the suggestion list. */
function linkable(db: Executor, id: string) {
  const row = getBooking(db, id);
  if (!row) throw new EntityNotFoundError('booking', id);
  openAccount(db, row.accountId);
  if (row.status === 'reconciled') throw new ReconciledLockedError([id]);
  if (row.transferId || row.splits.some((s) => s.transferId || s.contactId) || row.originalCurrency)
    throw new ConflictError('Diese Buchung ist bereits verbunden oder enthält geschützte Anteile.');
  assertContactBookingWrite(db, id, 'update', ['transferId']);
  assertTradeSettlementBookingWrite(db, id, 'update', ['transferId']);
  return row;
}

/** Manual bookings an incoming bank row can be merged into, closest date first. */
function mergeTargets(db: Executor, row: MatchBooking) {
  return bankMatches(
    row,
    db
      .select()
      .from(booking)
      .where(
        and(
          isNull(booking.deletedAt),
          eq(booking.accountId, row.accountId),
          eq(booking.amountCents, row.amountCents),
          eq(booking.source, 'manual'),
          isNull(booking.importKey),
          gte(booking.date, addDays(row.date, -5)),
          lte(booking.date, addDays(row.date, 5)),
        ),
      )
      .all()
      .filter((b) => {
        try {
          mergeable(db, b.id);
          return relatedTransferBookings(db, b.id).every(
            (id) => id === b.id || withinBankWindow(row.date, getBooking(db, id)!.date),
          );
        } catch {
          return false;
        }
      })
      .map((b) => ({ ...b, accountName: openAccount(db, b.accountId).name })),
  );
}

export function candidateMatches(db: Executor, id: string) {
  const row = openCandidate(db, id);
  const rows = db
    .select()
    .from(booking)
    .where(
      and(
        isNull(booking.deletedAt),
        eq(booking.currency, row.currency),
        gte(booking.date, addDays(row.date, -5)),
        lte(booking.date, addDays(row.date, 5)),
        or(eq(booking.amountCents, row.amountCents), eq(booking.amountCents, -row.amountCents)),
      ),
    )
    .all()
    .filter((b) => {
      try {
        linkable(db, b.id);
        return true;
      } catch {
        return false;
      }
    })
    .map((b) => ({ ...b, accountName: openAccount(db, b.accountId).name }));
  return {
    merge: mergeTargets(db, row),
    transfers: bankMatches(row, rows, true),
  };
}

/** The manual booking keeps its identity; it takes over the bank date, source and stable reference. */
function adoptBankReference(
  tx: Executor,
  target: NonNullable<ReturnType<typeof getBooking>>,
  date: string,
  importKey: string,
  grouped: AuditContext,
) {
  const patch = { date, source: 'bank' as const, importKey, status: 'confirmed' as const };
  if (target.transferId || target.splits.some((s) => s.transferId)) {
    updateTracked(tx, booking, [target.id], patch, grouped);
    const touched = relatedTransferBookings(tx, target.id);
    assertLedgerInvariants(tx, touched);
    for (const change of expectedLinkPatches(tx, touched))
      updateTracked(tx, expectedOccurrence, [change.id], change.patch, grouped);
  } else updateBooking(tx, target.id, patch, grouped);
}

/** Keep identities, receipt links, memo and split allocations; attach the stable bank reference. */
export function mergeBankCandidate(
  db: Executor,
  id: string,
  bookingId: string,
  ctx: AuditContext,
  now: string,
) {
  return runInTransaction(db, (tx) => {
    const row = openCandidate(tx, id);
    const target = mergeable(tx, bookingId);
    if (target.source !== 'manual' || target.importKey || !bankMatches(row, [target]).length)
      throw new ConflictError('Die Buchung passt nicht mehr zu diesem Bankumsatz.');
    const grouped = withGroup(ctx);
    adoptBankReference(tx, target, row.date, 'bank-sync:' + row.dedupeKey, grouped);
    updateTracked(
      tx,
      inboxItem,
      [id],
      { resolvedAt: now, resolution: 'Zusammengeführt: ' + bookingId },
      grouped,
    );
    return { groupId: grouped.groupId, bookingId };
  });
}

/**
 * Decision 41 posts booked bank rows as unchecked bookings, so a duplicate of an earlier manual
 * entry is already counted. Only an unchecked, still bank-owned booking may be merged away.
 */
function mergeableBankBooking(db: Executor, id: string) {
  const row = getBooking(db, id);
  if (!row) throw new EntityNotFoundError('booking', id);
  openAccount(db, row.accountId);
  if (row.status === 'reconciled') throw new ReconciledLockedError([id]);
  if (
    row.source !== 'bank' ||
    !row.importKey?.startsWith('bank-sync:') ||
    row.status !== 'pending' ||
    row.transferId ||
    row.originalCurrency ||
    row.splits.some((s) => s.transferId || s.contactId)
  )
    throw new ConflictError('Nur ungeprüfte Bankbuchungen lassen sich zusammenführen.');
  if (
    db
      .select()
      .from(bookingReceipt)
      .where(and(eq(bookingReceipt.bookingId, id), isNull(bookingReceipt.deletedAt)))
      .get()
  )
    throw new ConflictError('Die Bankbuchung hat Belege und bleibt eigenständig.');
  assertContactBookingWrite(db, id, 'delete');
  assertTradeSettlementBookingWrite(db, id, 'delete');
  return row;
}

/** Manual bookings an unchecked bank booking can be merged into; throws when it is not eligible. */
export function bankBookingMatches(db: Executor, id: string) {
  const row = mergeableBankBooking(db, id);
  return { merge: mergeTargets(db, row) };
}

/**
 * Merge an unchecked bank booking into the owner's earlier manual booking: the manual booking
 * keeps identity, notes, receipts and splits and takes the bank date and reference; the bank copy
 * is removed so the money is counted once. One audit group, so one undo.
 */
export function mergeBankBooking(
  db: Executor,
  bankBookingId: string,
  bookingId: string,
  ctx: AuditContext,
) {
  return runInTransaction(db, (tx) => {
    const bank = mergeableBankBooking(tx, bankBookingId);
    const target = mergeable(tx, bookingId);
    if (
      target.id === bank.id ||
      !bankMatches(bank, [target]).length ||
      !relatedTransferBookings(tx, bookingId).every(
        (id) => id === bookingId || withinBankWindow(bank.date, getBooking(tx, id)!.date),
      )
    )
      throw new ConflictError('Die Buchung passt nicht mehr zu diesem Bankumsatz.');
    const grouped = withGroup(ctx);
    const importKey = bank.importKey!;
    // The key is unique per account even for deleted rows: release it before the manual row takes it.
    updateTracked(tx, booking, [bank.id], { importKey: null }, grouped);
    deleteBooking(tx, bank.id, grouped);
    adoptBankReference(tx, target, bank.date, importKey, grouped);
    const candidate = tx
      .select()
      .from(bankSyncCandidate)
      .where(
        and(
          eq(bankSyncCandidate.accountId, bank.accountId),
          eq(bankSyncCandidate.dedupeKey, importKey.slice('bank-sync:'.length)),
        ),
      )
      .get();
    if (candidate)
      updateTracked(
        tx,
        inboxItem,
        [candidate.id],
        { resolution: 'Zusammengeführt: ' + bookingId },
        grouped,
      );
    return { groupId: grouped.groupId, bookingId };
  });
}

/** One transfer, two original dates and identities; categories are removed explicitly. */
export function linkBookings(db: Executor, ids: readonly [string, string], ctx: AuditContext) {
  return runInTransaction(db, (tx) => {
    const rows = ids.map((id) => linkable(tx, id));
    if (!canLinkTransfer(rows[0]!, rows[1]!))
      throw new ConflictError('Für eine Umbuchung müssen Betrag, Währung und Zeitraum passen.');
    const grouped = withGroup(ctx);
    const transferId = randomUUID();
    // Structural rows follow createTransfer: unreferenced rows remain after undo.
    tx.insert(transfer).values({ id: transferId }).run();
    for (const row of rows) {
      for (const split of row.splits)
        updateTracked(
          tx,
          bookingSplit,
          [split.id],
          { categoryId: null, incomeTypeId: null },
          grouped,
        );
      updateTracked(tx, booking, [row.id], { transferId, payeeId: null, projectId: null }, grouped);
      // A categorized payment is no longer an expected payment after it becomes a transfer.
      for (const occurrence of tx
        .select()
        .from(expectedOccurrence)
        .where(eq(expectedOccurrence.bookingId, row.id))
        .all())
        updateTracked(
          tx,
          expectedOccurrence,
          [occurrence.id],
          { bookingId: null, status: 'expected' },
          grouped,
        );
    }
    assertLedgerInvariants(tx, ids);
    return { groupId: grouped.groupId, transferId };
  });
}

export function linkBankCandidate(
  db: Executor,
  id: string,
  bookingId: string,
  ctx: AuditContext,
  now: string,
) {
  return runInTransaction(db, (tx) => {
    const row = openCandidate(tx, id);
    const target = linkable(tx, bookingId);
    if (!canLinkTransfer(row, target))
      throw new ConflictError('Die Gegenbuchung passt nicht mehr.');
    const grouped = withGroup(ctx);
    const existing = tx
      .select()
      .from(booking)
      .where(
        and(
          eq(booking.accountId, row.accountId),
          eq(booking.importKey, 'bank-sync:' + row.dedupeKey),
        ),
      )
      .get();
    if (existing && !existing.deletedAt)
      throw new ConflictError('Dieser Bankumsatz ist bereits gebucht.');
    if (existing) {
      if (!tx.select().from(bookingSplit).where(eq(bookingSplit.bookingId, existing.id)).get())
        insertTracked(
          tx,
          bookingSplit,
          { id: randomUUID(), bookingId: existing.id, amountCents: row.amountCents },
          grouped,
        );
      restoreBooking(tx, existing.id, grouped);
    }
    const createdId =
      existing?.id ??
      createBooking(
        tx,
        {
          accountId: row.accountId,
          date: row.date,
          amountCents: row.amountCents,
          currency: row.currency,
          memo: row.memo,
          source: 'bank',
          importKey: 'bank-sync:' + row.dedupeKey,
          status: 'confirmed',
          splits: [{ amountCents: row.amountCents }],
        },
        grouped,
      );
    linkBookings(tx, [createdId, bookingId], grouped);
    updateTracked(
      tx,
      inboxItem,
      [id],
      { resolvedAt: now, resolution: 'Umbuchung: ' + createdId },
      grouped,
    );
    return { groupId: grouped.groupId, bookingId: createdId };
  });
}

/** Latest dated observation only; undated balances remain visible but cannot authorize a lock. */
export function bankBalanceForAccount(db: Executor, accountId: string, today: string) {
  const row = db
    .select()
    .from(bankSyncAccount)
    .where(eq(bankSyncAccount.accountId, accountId))
    .orderBy(desc(bankSyncAccount.balanceFetchedAt))
    .get();
  if (!row) return null;
  const open = db
    .select()
    .from(bankSyncCandidate)
    .innerJoin(inboxItem, eq(inboxItem.id, bankSyncCandidate.id))
    .where(
      and(
        eq(bankSyncCandidate.accountId, accountId),
        isNull(inboxItem.resolvedAt),
        lte(bankSyncCandidate.date, today),
      ),
    )
    .get();
  const acct = openAccount(db, accountId);
  const pending = db
    .select()
    .from(booking)
    .where(
      and(
        eq(booking.accountId, accountId),
        isNull(booking.deletedAt),
        eq(booking.status, 'pending'),
        lte(booking.date, today),
      ),
    )
    .get();
  return {
    amountCents: row.balanceCents,
    date: row.balanceDate,
    fetchedAt: row.balanceFetchedAt,
    reconciledThrough: listReconciliations(db, accountId)[0]?.date ?? null,
    canLock:
      !acct.closedAt &&
      row.currency === acct.currency &&
      row.balanceDate === today &&
      row.balanceCents !== null &&
      !open &&
      !pending &&
      bookedBalance(db, accountId, today) === row.balanceCents,
  };
}

export function lockBankBalance(db: Executor, accountId: string, today: string, ctx: AuditContext) {
  return runInTransaction(db, (tx) => {
    const balance = bankBalanceForAccount(tx, accountId, today);
    if (!balance?.canLock || balance.amountCents === null)
      throw new ConflictError(
        'Für heute fehlt ein passender Bankstand oder es gibt offene Buchungen.',
      );
    return reconcileAccount(
      tx,
      { accountId, date: today, today, statementBalanceCents: balance.amountCents },
      ctx,
    );
  });
}
