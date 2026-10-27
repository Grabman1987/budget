import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, auditLog, bankSyncCandidate, booking, inboxItem, transfer } from '../schema';
import { seedBasics, testCtx } from './test-helpers';
import { createEntity } from './entities';
import { createBooking, getBooking } from './bookings';
import {
  bankBookingMatches,
  candidateMatches,
  mergeBankBooking,
  mergeBankCandidate,
} from './bank-followups';
import {
  assertLedgerInvariants,
  relatedTransferBookings,
  connectedTransferBookings,
} from './invariants';
import { undo } from './audit';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const now = '2026-10-15T10:00:00.000Z';
function incoming(accountId: string, date: string, amountCents: number) {
  const id = randomUUID();
  opened.db
    .insert(bankSyncCandidate)
    .values({
      id,
      accountId,
      dedupeKey: id,
      date,
      amountCents,
      currency: 'EUR',
      memo: 'Synthetic component bank row',
    })
    .run();
  opened.db
    .insert(inboxItem)
    .values({
      id,
      kind: 'import',
      title: 'Synthetic bank row',
      refType: 'bank-sync-candidate',
      refId: id,
    })
    .run();
  return id;
}

it.each(['candidate', 'booking'] as const)(
  'matches only direct transfer date neighbours while preserving the full component and exact Undo (%s)',
  (mode) => {
    createEntity(
      opened.db,
      account,
      {
        id: 'second-savings',
        name: 'Second savings',
        type: 'savings',
        role: 'reserve',
        onBudget: true,
        openingDate: '2023-10-01',
      },
      testCtx,
    );
    const parent = createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-10-05',
        amountCents: -3000,
        memo: 'Original component memo',
        splits: [
          {
            categoryId: null,
            amountCents: -1000,
            transferAccountId: 'spar',
            memo: 'First transfer',
          },
          {
            categoryId: null,
            amountCents: -2000,
            transferAccountId: 'second-savings',
            memo: 'Second transfer',
          },
        ],
      },
      testCtx,
    );
    const parts = getBooking(opened.db, parent)!.splits;
    const rows = opened.db.select().from(booking).all();
    const leaf1 = rows.find((row) => row.transferId === parts[0]!.transferId)!.id;
    const leaf2 = rows.find((row) => row.transferId === parts[1]!.transferId)!.id;
    const ids = [parent, leaf1, leaf2];
    expect(relatedTransferBookings(opened.db, leaf1).sort()).toEqual([parent, leaf1].sort());
    expect(connectedTransferBookings(opened.db, leaf1).sort()).toEqual([...ids].sort());
    const second = incoming('second-savings', '2026-10-10', 2000);
    expect(candidateMatches(opened.db, second).merge.map((row) => row.id)).toEqual([leaf2]);
    mergeBankCandidate(opened.db, second, leaf2, testCtx, now);
    expect(ids.map((id) => getBooking(opened.db, id)?.date)).toEqual([
      '2026-10-05',
      '2026-10-05',
      '2026-10-10',
    ]);
    const outside = incoming('spar', '2026-09-29', 1000);
    const outsideBefore = ids.map((id) => getBooking(opened.db, id));
    const outsideAudit = opened.db.select().from(auditLog).all();
    expect(candidateMatches(opened.db, outside).merge).toEqual([]);
    expect(() => mergeBankCandidate(opened.db, outside, leaf1, testCtx, now)).toThrow();
    expect(ids.map((id) => getBooking(opened.db, id))).toEqual(outsideBefore);
    expect(opened.db.select().from(auditLog).all()).toEqual(outsideAudit);
    const first = incoming('spar', '2026-09-30', 1000);
    let bankCopy: string | undefined;
    if (mode === 'booking') {
      opened.db
        .update(inboxItem)
        .set({ resolvedAt: now, resolution: 'Kontowirksam übernommen' })
        .where(eq(inboxItem.id, first))
        .run();
      bankCopy = createBooking(
        opened.db,
        {
          accountId: 'spar',
          date: '2026-09-30',
          amountCents: 1000,
          memo: 'Synthetic component bank row',
          status: 'pending',
          source: 'bank',
          importKey: 'bank-sync:' + first,
          splits: [{ categoryId: null, amountCents: 1000 }],
        },
        testCtx,
      );
    }
    const before = ids.map((id) => getBooking(opened.db, id));
    const copyBefore = bankCopy ? getBooking(opened.db, bankCopy) : undefined;
    const transfersBefore = opened.db.select().from(transfer).all();
    const inboxBefore = opened.db.select().from(inboxItem).all();
    const matches = bankCopy
      ? bankBookingMatches(opened.db, bankCopy)
      : candidateMatches(opened.db, first);
    expect(matches.merge.map((row) => row.id)).toEqual([leaf1]);
    const result = bankCopy
      ? mergeBankBooking(opened.db, bankCopy, leaf1, testCtx)
      : mergeBankCandidate(opened.db, first, leaf1, testCtx, now);
    expect(result.bookingId).toBe(leaf1);
    expect(ids.map((id) => getBooking(opened.db, id)?.date)).toEqual([
      '2026-10-05',
      '2026-09-30',
      '2026-10-10',
    ]);
    expect(ids.map((id) => getBooking(opened.db, id)?.amountCents)).toEqual([-3000, 1000, 2000]);
    expect(ids.map((id) => getBooking(opened.db, id)?.splits)).toEqual(
      before.map((row) => row?.splits),
    );
    expect(getBooking(opened.db, parent)).toEqual(before[0]);
    expect(getBooking(opened.db, leaf2)).toEqual(before[2]);
    if (bankCopy) expect(getBooking(opened.db, bankCopy)).toBeUndefined();
    const group = opened.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.groupId, result.groupId))
      .all();
    expect(group).toHaveLength(mode === 'candidate' ? 2 : 4);
    expect(() => assertLedgerInvariants(opened.db, ids)).not.toThrow();
    undo(opened.db, { groupId: result.groupId }, testCtx);
    expect(ids.map((id) => getBooking(opened.db, id))).toEqual(before);
    if (bankCopy) expect(getBooking(opened.db, bankCopy)).toEqual(copyBefore);
    expect(opened.db.select().from(transfer).all()).toEqual(transfersBefore);
    expect(opened.db.select().from(inboxItem).all()).toEqual(inboxBefore);
    expect(() => assertLedgerInvariants(opened.db, ids)).not.toThrow();
  },
);
