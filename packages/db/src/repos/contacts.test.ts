import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { bookingSplit, contactSettlement, expectedOccurrence, expectedPayment } from '../schema';
import { eq } from 'drizzle-orm';
import { history, insertTracked, undo } from './audit';
import { createBooking, deleteBooking, updateBooking } from './bookings';
import { getContactStatement, listContactStatements, settleContact } from './contacts';
import { bookedBalance as accountBalanceAsOf } from './reconciliation';
import { netWorthAsOf } from './portfolio';
import { updateCategory, mergeCategories, splitOffCategory } from './categories';
import { softDeleteEntity } from './entities';
import { account, contact } from '../schema';
import { seedBasics, testCtx } from './test-helpers';
let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const outlay = (amountCents: number, date = '2026-09-01') =>
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date,
      amountCents: -amountCents,
      splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: -amountCents }],
    },
    testCtx,
  );
const receipt = (
  amountCents: number,
  allocations?: { outlaySplitId: string; amountCents: number }[],
) =>
  settleContact(
    opened.db,
    'k1',
    { accountId: 'giro', date: '2026-09-03', amountCents, ...(allocations ? { allocations } : {}) },
    testCtx,
  );
const statement = () => getContactStatement(opened.db, 'k1', '2026-09-17');
describe('atomic contact settlement', () => {
  it('persists oldest-first 30 + 10, retaining 60 open', () => {
    outlay(3000);
    outlay(7000, '2026-09-02');
    const r = receipt(4000);
    expect(r.allocations.map((a) => a.amountCents)).toEqual([3000, 1000]);
    expect(statement().outlays.map((o) => o.remainingCents)).toEqual([0, 6000]);
    expect(statement().balanceCents).toBe(6000);
    expect(
      opened.db.select().from(bookingSplit).where(eq(bookingSplit.bookingId, r.bookingId)).get()
        ?.incomeTypeId,
    ).toBeNull();
  });
  it('persists edited allocation and restores it with whole-action undo/redo', () => {
    outlay(3000);
    const second = outlay(7000, '2026-09-02');
    const target = opened.db
      .select()
      .from(bookingSplit)
      .where(eq(bookingSplit.bookingId, second))
      .get()!.id;
    const r = receipt(4000, [{ outlaySplitId: target, amountCents: 4000 }]);
    expect(statement().outlays.map((o) => o.remainingCents)).toEqual([3000, 3000]);
    const reversed = undo(opened.db, { groupId: r.groupId }, testCtx);
    expect(statement().balanceCents).toBe(10000);
    undo(opened.db, { groupId: reversed.groupId }, testCtx);
    expect(statement().outlays.map((o) => o.remainingCents)).toEqual([3000, 3000]);
  });
  it('saves a valid backdated edited allocation before checking later allocations', () => {
    outlay(3000);
    outlay(7000, '2026-09-02');
    const [a, b] = statement().outlays;
    settleContact(
      opened.db,
      'k1',
      {
        accountId: 'giro',
        date: '2026-09-05',
        amountCents: 3000,
        allocations: [{ outlaySplitId: a!.splitId, amountCents: 3000 }],
      },
      testCtx,
    );
    settleContact(
      opened.db,
      'k1',
      {
        accountId: 'giro',
        date: '2026-09-04',
        amountCents: 4000,
        allocations: [{ outlaySplitId: b!.splitId, amountCents: 4000 }],
      },
      testCtx,
    );
    expect(statement().outlays.map((o) => o.remainingCents)).toEqual([0, 3000]);
    expect(statement().balanceCents).toBe(3000);
  });
  it('retains credit, changes only actual cash/net worth and reverses credit atomically', () => {
    outlay(10000);
    expect(accountBalanceAsOf(opened.db, 'giro', '2026-09-17')).toBe(90000);
    expect(netWorthAsOf(opened.db, '2026-09-17').totalCents).toBe(90000);
    const r = receipt(12000);
    expect(statement()).toMatchObject({ balanceCents: -2000, creditCents: 2000 });
    expect(netWorthAsOf(opened.db, '2026-09-17').totalCents).toBe(102000);
    expect(listContactStatements(opened.db, '2026-09-17')).toHaveLength(1);
    const reversed = undo(opened.db, { groupId: r.groupId }, testCtx);
    expect(statement()).toMatchObject({ balanceCents: 10000, creditCents: 0 });
    expect(netWorthAsOf(opened.db, '2026-09-17').totalCents).toBe(90000);
    undo(opened.db, { groupId: reversed.groupId }, testCtx);
    expect(statement()).toMatchObject({ balanceCents: -2000, creditCents: 2000 });
  });
  it('a 60 cash receipt leaves 40 owed without inventing net worth', () => {
    outlay(10000);
    receipt(6000);
    expect(statement().balanceCents).toBe(4000);
    expect(netWorthAsOf(opened.db, '2026-09-17').totalCents).toBe(96000);
  });
  it('forced undo refuses an earlier amount edit while its outlay is allocated', () => {
    const b = outlay(10000);
    updateBooking(opened.db, b, { amountCents: -8000 }, testCtx);
    const editGroup = history(opened.db, 'booking', b)[0]!.groupId!;
    receipt(4000);
    expect(() => undo(opened.db, { groupId: editGroup }, testCtx, { force: true })).toThrow(
      /allocated outlay/,
    );
    expect(statement().balanceCents).toBe(4000);
  });
  it('hides zero balance but retains history; a new outlay makes it visible', () => {
    outlay(1000);
    receipt(1000);
    expect(listContactStatements(opened.db, '2026-09-17')).toEqual([]);
    expect(listContactStatements(opened.db, '2026-09-17', true)).toHaveLength(1);
    expect(statement().movements).toHaveLength(2);
    outlay(500, '2026-09-04');
    expect(listContactStatements(opened.db, '2026-09-17')[0]?.balanceCents).toBe(500);
  });
  it('rejects dependent editing/deletion, partial and forced outlay undo without changing cash', () => {
    const b = outlay(10000);
    const r = receipt(12000);
    expect(() => updateBooking(opened.db, b, { amountCents: -5000 }, testCtx)).toThrow(
      /contact settlement/,
    );
    expect(() => deleteBooking(opened.db, b, testCtx)).toThrow(/contact settlement/);
    expect(() => deleteBooking(opened.db, r.bookingId, testCtx)).toThrow(/contact settlement/);
    expect(() =>
      undo(opened.db, { auditId: history(opened.db, 'contact_settlement', r.id)[0]!.id }, testCtx, {
        force: true,
      }),
    ).toThrow();
    const groupId = history(opened.db, 'booking', b)[0]!.groupId!;
    expect(() => undo(opened.db, { groupId }, testCtx, { force: true })).toThrow();
    expect(statement()).toMatchObject({ balanceCents: -2000, creditCents: 2000 });
    expect(accountBalanceAsOf(opened.db, 'giro', '2026-09-17')).toBe(102000);
  });
  it('protects settlement account, contact and category against generic changes', () => {
    outlay(10000);
    receipt(4000);
    expect(() => softDeleteEntity(opened.db, account, 'giro', testCtx)).toThrow();
    expect(() => softDeleteEntity(opened.db, contact, 'k1', testCtx)).toThrow();
    expect(() =>
      updateCategory(opened.db, 'auslagen', { kind: 'variable', class: 'need' }, testCtx),
    ).toThrow();
    expect(() => mergeCategories(opened.db, ['auslagen'], 'essen', testCtx)).toThrow();
    expect(() =>
      splitOffCategory(
        opened.db,
        'auslagen',
        [statement().outlays[0]!.splitId],
        { targetId: 'essen' },
        testCtx,
      ),
    ).toThrow();
    expect(statement().balanceCents).toBe(6000);
  });
  it('rolls back invalid allocation and refuses a non-cash account', () => {
    outlay(10000);
    expect(() => receipt(4000, [{ outlaySplitId: 'missing', amountCents: 4000 }])).toThrow();
    expect(() =>
      settleContact(
        opened.db,
        'k1',
        { accountId: 'usd', date: '2026-09-03', amountCents: 1000 },
        testCtx,
      ),
    ).toThrow();
    expect(opened.db.select().from(contactSettlement).all()).toEqual([]);
    expect(accountBalanceAsOf(opened.db, 'giro', '2026-09-17')).toBe(90000);
  });
  it('ignores expected contact shares and counts the actual booking exactly once', () => {
    insertTracked(
      opened.db,
      expectedPayment,
      { id: 'p', name: 'Beitrag', accountId: 'giro', contactId: 'k1', dueDay: 5 },
      testCtx,
    );
    insertTracked(
      opened.db,
      expectedOccurrence,
      {
        id: 'o',
        expectedPaymentId: 'p',
        dueDate: '2026-09-05',
        expectedAmountCents: -10000,
        contactShareCents: -10000,
      },
      testCtx,
    );
    expect(statement().balanceCents).toBe(0);
    outlay(10000);
    expect(statement().balanceCents).toBe(10000);
  });
});
