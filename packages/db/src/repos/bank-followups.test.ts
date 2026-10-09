import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  bankSyncAccount,
  bankSyncCandidate,
  bankSyncConsent,
  inboxItem,
  booking,
  account,
  auditLog,
} from '../schema';
import { seedBasics } from './test-helpers';
import { createBooking, createTransfer, getBooking, importBooking } from './bookings';
import { undo } from './audit';
import {
  bankBalanceForAccount,
  bankBookingMatches,
  candidateMatches,
  linkBankCandidate,
  linkBookings,
  lockBankBalance,
  mergeBankBooking,
  mergeBankCandidate,
} from './bank-followups';
import { bookedBalance } from './reconciliation';

let opened: OpenedDatabase;
const today = '2026-10-02';
const now = today + 'T10:00:00.000Z';
const ctx = { actor: 'owner' };
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const manual = (amountCents = -1201, accountId = 'giro', date = '2026-09-30') =>
  createBooking(
    opened.db,
    {
      accountId,
      date,
      amountCents,
      memo: 'Handnotiz',
      status: 'pending',
      splits: [{ amountCents, categoryId: 'essen' }],
    },
    ctx,
  );
function candidate(amountCents = -1201) {
  const id = randomUUID();
  opened.db
    .insert(bankSyncCandidate)
    .values({
      id,
      accountId: 'giro',
      dedupeKey: id,
      date: today,
      amountCents,
      currency: 'EUR',
      memo: 'Banktext',
    })
    .run();
  opened.db
    .insert(inboxItem)
    .values({
      id,
      kind: 'import',
      title: 'Bankumsatz prüfen',
      refType: 'bank-sync-candidate',
      refId: id,
    })
    .run();
  return id;
}
function observation(date: string | null = today, amountCents = 100000) {
  const consentId = randomUUID();
  opened.db
    .insert(bankSyncConsent)
    .values({
      id: consentId,
      initiator: 'synthetic',
      stateHash: consentId,
      label: 'Bank A',
      expiresAt: now,
      nextRunAt: now,
      status: 'active',
    })
    .run();
  opened.db
    .insert(bankSyncAccount)
    .values({
      id: randomUUID(),
      consentId,
      secret: 'synthetic',
      label: 'Konto A',
      accountId: 'giro',
      currency: 'EUR',
      balanceCents: amountCents,
      balanceDate: date,
      balanceFetchedAt: now,
    })
    .run();
}

describe('bank matching, transfer linking and reconciliation', () => {
  it('ranks closest manual bookings, excludes linked, locked, protected and out-of-window rows', () => {
    manual(-1201, 'giro', '2026-09-26');
    const farther = manual(-1201, 'giro', '2026-09-27');
    const closest = manual(-1201, 'giro', today);
    const linked = manual();
    opened.db
      .update(booking)
      .set({ importKey: 'already-linked' })
      .where(eq(booking.id, linked))
      .run();
    const locked = manual();
    opened.db.update(booking).set({ status: 'reconciled' }).where(eq(booking.id, locked)).run();
    const id = candidate();
    expect(candidateMatches(opened.db, id).merge.map((b) => b.id)).toEqual([closest, farther]);
  });
  it('ties a locked or migrated booking to the bank line without moving its date or key', () => {
    const locked = manual(-1201, 'giro', '2026-09-30');
    opened.db.update(booking).set({ status: 'reconciled' }).where(eq(booking.id, locked)).run();
    const migrated = manual(-1201, 'giro', '2026-09-30');
    opened.db
      .update(booking)
      .set({ source: 'migration', importKey: 'ynab:1' })
      .where(eq(booking.id, migrated))
      .run();
    const bankId = candidate();
    const found = candidateMatches(opened.db, bankId);
    expect(found.merge).toEqual([]);
    expect(found.link.map((b) => b.id).sort()).toEqual([locked, migrated].sort());
    mergeBankCandidate(opened.db, bankId, migrated, ctx, now);
    expect(getBooking(opened.db, migrated)).toMatchObject({
      date: '2026-09-30',
      source: 'migration',
      importKey: 'ynab:1',
      bankRawText: 'Banktext',
    });
    expect(
      opened.db.select().from(inboxItem).where(eq(inboxItem.id, bankId)).get()!.resolution,
    ).toBe('Mit vorhandener Buchung verknüpft: ' + migrated);
    expect(opened.db.select().from(booking).all()).toHaveLength(2);
    expect(() => mergeBankCandidate(opened.db, bankId, locked, ctx, now)).toThrow();
  });
  it('merges without a duplicate, keeps exact splits and memo, and supports undo/redo', () => {
    const id = manual();
    const before = getBooking(opened.db, id)!;
    const bankId = candidate();
    const result = mergeBankCandidate(opened.db, bankId, id, ctx, now);
    expect(getBooking(opened.db, id)).toMatchObject({
      date: today,
      source: 'bank',
      status: 'confirmed',
      memo: 'Handnotiz',
      splits: before.splits,
    });
    expect(getBooking(opened.db, id)!.importKey).toBe('bank-sync:' + bankId);
    expect(opened.db.select().from(booking).all()).toHaveLength(1);
    expect(bookedBalance(opened.db, 'giro', today)).toBe(98799);
    expect(() => mergeBankCandidate(opened.db, bankId, id, ctx, now)).toThrow();
    const reverted = undo(opened.db, { groupId: result.groupId }, ctx);
    expect(getBooking(opened.db, id)).toMatchObject({
      date: '2026-09-30',
      source: 'manual',
      status: 'pending',
      importKey: null,
      splits: before.splits,
    });
    expect(candidateMatches(opened.db, bankId).merge[0]?.id).toBe(id);
    undo(opened.db, { groupId: reverted.groupId }, ctx);
    expect(bookedBalance(opened.db, 'giro', today)).toBe(98799);
  });
  it('merges an existing manual transfer without moving its other leg', () => {
    const transfer = createTransfer(
      opened.db,
      { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-09-30', amountCents: 1201 },
      ctx,
    );
    const id = candidate();
    expect(candidateMatches(opened.db, id).merge[0]?.id).toBe(transfer.fromBookingId);
    const result = mergeBankCandidate(opened.db, id, transfer.fromBookingId, ctx, now);
    expect(getBooking(opened.db, transfer.toBookingId)!.date).toBe('2026-09-30');
    expect(getBooking(opened.db, transfer.fromBookingId)).toMatchObject({
      date: today,
      transferId: transfer.transferId,
      source: 'bank',
    });
    undo(opened.db, { groupId: result.groupId }, ctx);
    expect(getBooking(opened.db, transfer.fromBookingId)!.date).toBe('2026-09-30');
  });
  it('rolls back the booking and audit if the inbox decision fails', () => {
    const id = manual();
    const bankId = candidate();
    const count = opened.db.select().from(auditLog).all().length;
    opened.sqlite.exec(
      "CREATE TRIGGER fail_bank_decision BEFORE UPDATE ON inbox_item BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    expect(() => mergeBankCandidate(opened.db, bankId, id, ctx, now)).toThrow('synthetic failure');
    expect(getBooking(opened.db, id)).toMatchObject({
      source: 'manual',
      status: 'pending',
      importKey: null,
    });
    expect(opened.db.select().from(auditLog).all()).toHaveLength(count);
  });
  it('preserves multiple split identities and allocations in a merge', () => {
    const id = createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: today,
        amountCents: -1201,
        memo: 'Splitnotiz',
        splits: [
          { amountCents: -700, categoryId: 'essen', memo: 'Anteil A' },
          { amountCents: -501, categoryId: 'reise', memo: 'Anteil B' },
        ],
      },
      ctx,
    );
    const before = getBooking(opened.db, id)!.splits;
    mergeBankCandidate(opened.db, candidate(), id, ctx, now);
    expect(getBooking(opened.db, id)!.splits).toEqual(before);
  });
  it('refuses a stale match and leaves no audit or decision behind', () => {
    const id = manual(-1202);
    const bankId = candidate();
    const count = opened.db.select().from(auditLog).all().length;
    expect(() => mergeBankCandidate(opened.db, bankId, id, ctx, now)).toThrow();
    expect(opened.db.select().from(auditLog).all()).toHaveLength(count);
    expect(
      opened.db.select().from(inboxItem).where(eq(inboxItem.id, bankId)).get()!.resolvedAt,
    ).toBeNull();
  });
  it('links original bookings on different days, removes categories, and undoes/redoes the pair', () => {
    const a = manual();
    const b = manual(1201, 'spar', today);
    const before = getBooking(opened.db, a)!.splits;
    const result = linkBookings(opened.db, [a, b], ctx);
    expect(getBooking(opened.db, a)).toMatchObject({
      transferId: result.transferId,
      date: '2026-09-30',
      splits: [{ categoryId: null }],
    });
    expect(getBooking(opened.db, b)).toMatchObject({ transferId: result.transferId, date: today });
    const reverted = undo(opened.db, { groupId: result.groupId }, ctx);
    expect(getBooking(opened.db, a)).toMatchObject({ transferId: null, splits: before });
    undo(opened.db, { groupId: reverted.groupId }, ctx);
    expect(getBooking(opened.db, b)!.transferId).toBe(result.transferId);
  });
  it('requires different accounts, opposite nonzero amounts, same currency and five days', () => {
    const a = manual();
    for (const b of [
      manual(1201),
      manual(1202, 'spar'),
      manual(1201, 'spar', '2026-10-06'),
      manual(1201, 'usd'),
    ])
      expect(() => linkBookings(opened.db, [a, b], ctx)).toThrow();
    const b = manual(1201, 'spar');
    opened.db.update(booking).set({ status: 'reconciled' }).where(eq(booking.id, b)).run();
    expect(() => linkBookings(opened.db, [a, b], ctx)).toThrow();
    expect(getBooking(opened.db, a)!.transferId).toBeNull();
  });
  it('suggests a mirror, creates only the missing bank leg, and permits re-confirmation after undo', () => {
    const b = manual(1201, 'spar');
    const id = candidate();
    expect(candidateMatches(opened.db, id).transfers.map((b) => b.id)).toEqual([b]);
    const result = linkBankCandidate(opened.db, id, b, ctx, now);
    expect(bookedBalance(opened.db, 'giro', today)).toBe(98799);
    expect(getBooking(opened.db, b)!.splits[0]!.categoryId).toBeNull();
    undo(opened.db, { groupId: result.groupId }, ctx);
    expect(bookedBalance(opened.db, 'giro', today)).toBe(100000);
    expect(getBooking(opened.db, b)!.transferId).toBeNull();
    linkBankCandidate(opened.db, id, b, ctx, now);
    expect(opened.db.select().from(booking).all()).toHaveLength(2);
  });
  it('exposes dated bank balance and locks via existing reconciliation with undo', () => {
    observation();
    expect(bankBalanceForAccount(opened.db, 'giro', today)).toEqual({
      amountCents: 100000,
      date: today,
      fetchedAt: now,
      reconciledThrough: null,
      canLock: true,
    });
    const result = lockBankBalance(opened.db, 'giro', today, ctx);
    expect(bankBalanceForAccount(opened.db, 'giro', today)!.reconciledThrough).toBe(today);
    undo(opened.db, { groupId: result.groupId }, ctx);
    expect(bankBalanceForAccount(opened.db, 'giro', today)!.reconciledThrough).toBeNull();
  });
  it.each([null, '2026-10-01'])('never locks an undated or stale balance (%s)', (date) => {
    observation(date);
    expect(() => lockBankBalance(opened.db, 'giro', today, ctx)).toThrow();
  });
  it('rejects mismatches, open candidates, pending bookings and closed accounts', () => {
    observation(today, 99999);
    expect(() => lockBankBalance(opened.db, 'giro', today, ctx)).toThrow();
    opened.db.update(bankSyncAccount).set({ balanceCents: 100000 }).run();
    const id = candidate();
    expect(() => lockBankBalance(opened.db, 'giro', today, ctx)).toThrow();
    opened.db.update(inboxItem).set({ resolvedAt: now }).where(eq(inboxItem.id, id)).run();
    manual();
    expect(() => lockBankBalance(opened.db, 'giro', today, ctx)).toThrow();
    opened.db.update(account).set({ closedAt: today }).where(eq(account.id, 'giro')).run();
    expect(() => lockBankBalance(opened.db, 'giro', today, ctx)).toThrow();
  });
});

/** Decision 41: booked bank rows are already unchecked bookings, not open candidates. */
describe('merging an already posted (unchecked) bank booking into a manual booking', () => {
  function posted(amountCents = -1201, status: 'pending' | 'confirmed' = 'pending') {
    const key = randomUUID();
    const id = candidate(amountCents);
    opened.db
      .update(bankSyncCandidate)
      .set({ dedupeKey: key })
      .where(eq(bankSyncCandidate.id, id))
      .run();
    opened.db
      .update(inboxItem)
      .set({ resolvedAt: now, resolution: 'Kontowirksam übernommen' })
      .where(eq(inboxItem.id, id))
      .run();
    const bookingId = createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: today,
        amountCents,
        memo: 'Banktext',
        source: 'bank',
        importKey: 'bank-sync:' + key,
        status,
        splits: [{ amountCents }],
      },
      ctx,
    );
    return { id, key, bookingId };
  }
  it('counts the money once, keeps the manual identity and survives the next bank fetch', () => {
    const own = manual();
    const before = getBooking(opened.db, own)!;
    const bank = posted();
    expect(bankBookingMatches(opened.db, bank.bookingId).merge.map((b) => b.id)).toEqual([own]);
    const result = mergeBankBooking(opened.db, bank.bookingId, own, ctx);
    expect(getBooking(opened.db, own)).toMatchObject({
      date: today,
      source: 'bank',
      status: 'confirmed',
      memo: 'Handnotiz',
      importKey: 'bank-sync:' + bank.key,
      splits: before.splits,
    });
    expect(getBooking(opened.db, bank.bookingId)).toBeUndefined();
    expect(bookedBalance(opened.db, 'giro', today)).toBe(98799);
    expect(
      opened.db.select().from(inboxItem).where(eq(inboxItem.id, bank.id)).get()!.resolution,
    ).toBe('Zusammengeführt: ' + own);
    // A later fetch of the same bank row finds the manual booking by its key: no duplicate.
    expect(
      importBooking(
        opened.db,
        {
          accountId: 'giro',
          date: today,
          amountCents: -1201,
          source: 'bank',
          importKey: 'bank-sync:' + bank.key,
          splits: [{ amountCents: -1201 }],
        },
        ctx,
      ),
    ).toEqual({ created: false, id: own });
    const reverted = undo(opened.db, { groupId: result.groupId }, ctx);
    expect(getBooking(opened.db, bank.bookingId)).toMatchObject({
      source: 'bank',
      status: 'pending',
      importKey: 'bank-sync:' + bank.key,
    });
    expect(getBooking(opened.db, own)).toMatchObject({
      source: 'manual',
      status: 'pending',
      importKey: null,
    });
    undo(opened.db, { groupId: reverted.groupId }, ctx);
    expect(getBooking(opened.db, bank.bookingId)).toBeUndefined();
  });
  it('refuses checked, reconciled, mismatching and non-bank bookings', () => {
    const own = manual();
    expect(() => bankBookingMatches(opened.db, own)).toThrow();
    const checked = posted(-1201, 'confirmed');
    expect(() => bankBookingMatches(opened.db, checked.bookingId)).toThrow();
    const other = posted(-5000);
    expect(() => mergeBankBooking(opened.db, other.bookingId, own, ctx)).toThrow();
    expect(getBooking(opened.db, own)!.source).toBe('manual');
    expect(bankBookingMatches(opened.db, other.bookingId).merge).toEqual([]);
  });
});
