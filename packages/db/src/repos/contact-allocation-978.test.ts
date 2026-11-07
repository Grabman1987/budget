import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq, isNull } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { booking, bookingSplit, contact } from '../schema';
import { seedBasics, testCtx } from './test-helpers';
import { createBooking, deleteBooking, getBooking, updateBooking } from './bookings';
import { createEntity } from './entities';
import {
  chooseContactCredit,
  getContactStatement,
  reallocateContactRepayment,
  settleContact,
} from './contacts';
import { history, undo } from './audit';
import { bookedBalance } from './reconciliation';
import { netWorthAsOf } from './portfolio';
import { budgetSummary } from './budget';

let opened: OpenedDatabase;
const today = '2026-09-30';
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const statement = () => getContactStatement(opened.db, 'k1', today);
const cash = () => ({
  balance: bookedBalance(opened.db, 'giro', today),
  wealth: netWorthAsOf(opened.db, today),
});
function outlay(categoryId: string, amountCents: number, date: string) {
  const id = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date,
      amountCents: -amountCents,
      splits: [{ categoryId, contactId: 'k1', amountCents: -amountCents }],
    },
    testCtx,
    { contactModel: true },
  );
  return getBooking(opened.db, id)!.splits[0]!;
}
function receipt(amountCents: number, date = '2026-09-01') {
  const result = settleContact(opened.db, 'k1', { accountId: 'giro', date, amountCents }, testCtx);
  return { ...result, splitId: getBooking(opened.db, result.bookingId)!.splits[0]!.id };
}
function categoryTotal(id: string) {
  return opened.db
    .select({ amount: bookingSplit.amountCents, categoryId: bookingSplit.categoryId })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .where(isNull(booking.deletedAt))
    .all()
    .filter((s) => s.categoryId === id)
    .reduce((s, r) => s + r.amount, 0);
}

it.each(['category', 'gift', 'free'] as const)(
  'releases only the needed latest automatic cents for %s, with grouped Undo/redo',
  (choice) => {
    const paid = receipt(1001);
    const first = outlay('essen', 600, '2026-09-02');
    const second = outlay('reise', 701, '2026-09-03');
    const before = cash();
    const budgetBefore = budgetSummary(opened.db, '2026-09').summary.toBeAssignedCents;
    expect(statement().creditCents).toBe(0);
    const chosen = chooseContactCredit(
      opened.db,
      'k1',
      {
        receiptSplitId: paid.splitId,
        amountCents: 501,
        date: today,
        choice,
        ...(choice === 'category' ? { categoryId: 'miete' } : {}),
      },
      testCtx,
      today,
    );
    expect(cash()).toEqual(before);
    expect(
      statement()
        .outlays.filter((o) => [first.id, second.id].includes(o.splitId))
        .map((o) => o.remainingCents),
    ).toEqual([100, 701]);
    expect(categoryTotal('essen')).toBe(-100);
    expect(categoryTotal('reise')).toBe(-701);
    expect(statement().creditCents).toBe(choice === 'gift' ? 0 : 501);
    expect(budgetSummary(opened.db, '2026-09').summary.toBeAssignedCents).toBe(
      budgetBefore + (choice === 'gift' ? 501 : 0),
    );
    const undone = undo(opened.db, { groupId: chosen.groupId }, testCtx);
    expect(statement().outlays.map((o) => o.remainingCents)).toEqual([0, 300]);
    expect(categoryTotal('essen')).toBe(0);
    expect(categoryTotal('reise')).toBe(-300);
    undo(opened.db, { groupId: undone.groupId }, testCtx);
    expect(
      statement()
        .outlays.filter((o) => [first.id, second.id].includes(o.splitId))
        .map((o) => o.remainingCents),
    ).toEqual([100, 701]);
    expect(cash()).toEqual(before);
  },
);

it('leaves other receipts and automatic uses unchanged when a released outlay predates them', () => {
  const firstReceipt = receipt(1001);
  const first = outlay('essen', 1001, '2026-09-02');
  const secondReceipt = receipt(1001, '2026-09-03');
  const second = outlay('reise', 1001, '2026-09-04');
  const before = statement();
  const result = chooseContactCredit(
    opened.db,
    'k1',
    { receiptSplitId: firstReceipt.splitId, amountCents: 101, date: today, choice: 'gift' },
    testCtx,
    today,
  );
  expect(statement().outlays.find((o) => o.splitId === first.id)?.remainingCents).toBe(101);
  expect(statement().outlays.find((o) => o.splitId === second.id)?.remainingCents).toBe(0);
  expect(statement().receipts.find((r) => r.receiptSplitId === secondReceipt.splitId)).toEqual(
    before.receipts[1],
  );
  undo(opened.db, { groupId: result.groupId }, testCtx);
  expect(statement()).toEqual(before);
});

it('reallocates previously consumed surplus without disturbing another source or losing cents', () => {
  const paid = receipt(601);
  const other = receipt(401, '2026-09-02');
  const first = outlay('essen', 701, '2026-09-03');
  const second = outlay('reise', 1001, '2026-09-04');
  const before = statement();
  const moneyBefore = cash();
  const result = reallocateContactRepayment(
    opened.db,
    'k1',
    paid.splitId,
    { allocations: [{ outlaySplitId: second.id, amountCents: 601 }] },
    testCtx,
    today,
  );
  expect(statement().outlays.map((o) => o.remainingCents)).toEqual([601, 99]);
  expect(statement().creditUses.filter((u) => u.receiptSplitId === other.splitId)).toEqual(
    before.creditUses.filter((u) => u.receiptSplitId === other.splitId),
  );
  expect(cash()).toEqual(moneyBefore);
  undo(opened.db, { groupId: result.groupId }, testCtx);
  expect(statement().outlays.find((o) => o.splitId === first.id)?.remainingCents).toBe(0);
  expect(statement()).toEqual(before);
});

it('reallocates a repayment to a later outlay without changing cash and restores the exact original allocation', () => {
  const first = outlay('essen', 1001, '2026-09-01');
  const paid = receipt(701, '2026-09-02');
  const later = outlay('reise', 1001, '2026-09-03');
  const before = cash();
  const result = reallocateContactRepayment(
    opened.db,
    'k1',
    paid.splitId,
    { allocations: [{ outlaySplitId: later.id, amountCents: 701 }] },
    testCtx,
    today,
  );
  expect(cash()).toEqual(before);
  expect(statement().outlays.map((o) => o.remainingCents)).toEqual([1001, 300]);
  expect(categoryTotal('essen')).toBe(-1001);
  expect(categoryTotal('reise')).toBe(-300);
  expect(getContactStatement(opened.db, 'k1', '2026-09-02').creditCents).toBe(0);
  const undone = undo(opened.db, { groupId: result.groupId }, testCtx);
  expect(statement().receipts[0]!.allocations).toEqual([
    { outlaySplitId: first.id, amountCents: 701 },
  ]);
  undo(opened.db, { groupId: undone.groupId }, testCtx);
  expect(statement().receipts[0]!.allocations).toEqual([
    { outlaySplitId: later.id, amountCents: 701 },
  ]);
});

it('rolls back the whole credit choice if an affected automatic use is locked', () => {
  const paid = receipt(1001);
  const used = outlay('essen', 1001, '2026-09-02');
  updateBooking(opened.db, used.bookingId, { status: 'reconciled' }, testCtx);
  const before = opened.sqlite.serialize();
  expect(() =>
    chooseContactCredit(
      opened.db,
      'k1',
      { receiptSplitId: paid.splitId, amountCents: 1, date: today, choice: 'gift' },
      testCtx,
      today,
    ),
  ).toThrow(/locked|gesperrt/);
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
  expect(history(opened.db, 'booking', used.bookingId)).not.toHaveLength(0);
});

it.each(['free', 'category', 'gift'] as const)(
  'preserves past category carry and current RTA for a cross-month %s choice',
  (choice) => {
    const paid = receipt(1001);
    outlay('essen', 1001, '2026-09-02');
    const past = budgetSummary(opened.db, '2026-09').summary;
    const priorStatement = statement();
    const current = budgetSummary(opened.db, '2026-10').summary.toBeAssignedCents;
    const before = cash();
    const result = chooseContactCredit(
      opened.db,
      'k1',
      {
        receiptSplitId: paid.splitId,
        amountCents: 101,
        date: '2026-10-02',
        choice,
        ...(choice === 'category' ? { categoryId: 'reise' } : {}),
      },
      testCtx,
      '2026-10-02',
    );
    expect(budgetSummary(opened.db, '2026-09').summary).toEqual(past);
    expect(statement().outlays.map((o) => o.remainingCents)).toEqual(
      priorStatement.outlays.map((o) => o.remainingCents),
    );
    expect(budgetSummary(opened.db, '2026-10').summary.toBeAssignedCents).toBe(
      current + (choice === 'gift' ? 101 : 0),
    );
    expect(cash()).toEqual(before);
    undo(opened.db, { groupId: result.groupId }, testCtx);
    expect(budgetSummary(opened.db, '2026-10').summary.toBeAssignedCents).toBe(current);
  },
);

it('releases proven standalone Auslagen credit uses without inferring an expense category', () => {
  const paid = receipt(1001);
  const first = outlay('auslagen', 1001, '2026-09-02');
  const next = receipt(501, '2026-09-03');
  const second = outlay('auslagen', 501, '2026-09-04');
  const before = cash();
  expect(
    statement().creditChoices.find((c) => c.receiptSplitId === paid.splitId)?.availableCents,
  ).toBe(1001);
  const result = chooseContactCredit(
    opened.db,
    'k1',
    { receiptSplitId: paid.splitId, amountCents: 101, date: today, choice: 'free' },
    testCtx,
    today,
  );
  expect(statement().outlays.find((o) => o.splitId === first.id)?.remainingCents).toBe(101);
  expect(statement().outlays.find((o) => o.splitId === second.id)?.remainingCents).toBe(0);
  expect(statement().creditUses.find((u) => u.receiptSplitId === next.splitId)?.amountCents).toBe(
    501,
  );
  expect(cash()).toEqual(before);
  undo(opened.db, { groupId: result.groupId }, testCtx);
  expect(statement().creditCents).toBe(0);
});

it('keeps historical category carry and current RTA unchanged for a cross-month reallocation', () => {
  outlay('essen', 1001, '2026-09-01');
  const paid = receipt(701, '2026-09-02');
  const later = outlay('reise', 1001, '2026-09-03');
  const past = budgetSummary(opened.db, '2026-09').summary;
  const current = budgetSummary(opened.db, '2026-10').summary.toBeAssignedCents;
  const changed = reallocateContactRepayment(
    opened.db,
    'k1',
    paid.splitId,
    { allocations: [{ outlaySplitId: later.id, amountCents: 701 }] },
    testCtx,
    '2026-10-02',
  );
  expect(budgetSummary(opened.db, '2026-09').summary).toEqual(past);
  expect(budgetSummary(opened.db, '2026-10').summary.toBeAssignedCents).toBe(current);
  undo(opened.db, { groupId: changed.groupId }, testCtx);
  expect(budgetSummary(opened.db, '2026-10').summary.toBeAssignedCents).toBe(current);
});

it.each([false, true])(
  'cannot undo a choice after its outlay becomes locked (force=%s)',
  (force) => {
    const paid = receipt(1001);
    const used = outlay('essen', 1001, '2026-09-02');
    const changed = chooseContactCredit(
      opened.db,
      'k1',
      { receiptSplitId: paid.splitId, amountCents: 101, date: today, choice: 'gift' },
      testCtx,
      today,
    );
    updateBooking(opened.db, used.bookingId, { status: 'reconciled' }, testCtx);
    const before = opened.sqlite.serialize();
    expect(() => undo(opened.db, { groupId: changed.groupId }, testCtx, { force })).toThrow(
      /locked|gesperrt/,
    );
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
  },
);

it.each(['essen', 'auslagen'])(
  'preserves another contact sharing the same %s booking',
  (categoryId) => {
    createEntity(opened.db, contact, { id: 'k2', name: 'Beispielkontakt Zwei' }, testCtx);
    const paid = receipt(1001);
    settleContact(
      opened.db,
      'k2',
      { accountId: 'giro', date: '2026-09-01', amountCents: 501 },
      testCtx,
    );
    const id = createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-09-02',
        amountCents: -1502,
        splits: [
          { categoryId, contactId: 'k1', amountCents: -1001 },
          { categoryId, contactId: 'k2', amountCents: -501 },
        ],
      },
      testCtx,
      { contactModel: true },
    );
    const other = getContactStatement(opened.db, 'k2', today);
    const parts = getBooking(opened.db, id)!.splits;
    const changed = chooseContactCredit(
      opened.db,
      'k1',
      { receiptSplitId: paid.splitId, amountCents: 101, date: today, choice: 'free' },
      testCtx,
      today,
    );
    expect(
      getContactStatement(opened.db, 'k2', today).outlays.map((o) => o.remainingCents),
    ).toEqual(other.outlays.map((o) => o.remainingCents));
    expect(getContactStatement(opened.db, 'k2', today).creditCents).toBe(0);
    expect(getContactStatement(opened.db, 'k2', today).creditUses).toEqual(other.creditUses);
    expect(getBooking(opened.db, id)!.splits).toEqual(parts);
    undo(opened.db, { groupId: changed.groupId }, testCtx);
    expect(getContactStatement(opened.db, 'k2', today)).toEqual(other);
  },
);

it('refuses upfront if preserving a later use would involve a locked booking', () => {
  const paid = receipt(1001);
  outlay('essen', 1001, '2026-09-02');
  receipt(501, '2026-09-03');
  const later = outlay('reise', 501, '2026-09-04');
  updateBooking(opened.db, later.bookingId, { status: 'reconciled' }, testCtx);
  const before = opened.sqlite.serialize();
  expect(() =>
    chooseContactCredit(
      opened.db,
      'k1',
      { receiptSplitId: paid.splitId, amountCents: 101, date: today, choice: 'gift' },
      testCtx,
      today,
    ),
  ).toThrow(/locked|gesperrt/);
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
});

it('retains correction dependencies after a source use was fully released', () => {
  const paid = receipt(1001);
  const used = outlay('essen', 1001, '2026-09-02');
  const purchaseGroup = history(opened.db, 'booking', used.bookingId)[0]!.groupId!;
  const changed = chooseContactCredit(
    opened.db,
    'k1',
    { receiptSplitId: paid.splitId, amountCents: 1001, date: today, choice: 'free' },
    testCtx,
    today,
  );
  const before = opened.sqlite.serialize();
  expect(() => deleteBooking(opened.db, used.bookingId, testCtx)).toThrow();
  expect(() => undo(opened.db, { groupId: purchaseGroup }, testCtx, { force: true })).toThrow();
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
  undo(opened.db, { groupId: changed.groupId }, testCtx);
  expect(statement().creditCents).toBe(0);
});

it('reallocates the settled portion while retaining an earlier explicit credit decision', () => {
  const first = outlay('essen', 1001, '2026-09-01');
  const paid = receipt(1502, '2026-09-02');
  const marked = chooseContactCredit(
    opened.db,
    'k1',
    { receiptSplitId: paid.splitId, amountCents: 501, date: '2026-09-02', choice: 'gift' },
    testCtx,
    today,
  );
  const second = outlay('reise', 1001, '2026-09-03');
  const changed = reallocateContactRepayment(
    opened.db,
    'k1',
    paid.splitId,
    { allocations: [{ outlaySplitId: second.id, amountCents: 1001 }] },
    testCtx,
    today,
  );
  expect(statement().outlays.find((o) => o.splitId === first.id)?.remainingCents).toBe(1001);
  expect(statement().outlays.find((o) => o.splitId === second.id)?.remainingCents).toBe(0);
  expect(statement().movements.some((m) => m.bookingId === marked.bookingId)).toBe(true);
  expect(statement().creditCents).toBe(0);
  undo(opened.db, { groupId: changed.groupId }, testCtx);
  expect(statement().outlays.find((o) => o.splitId === first.id)?.remainingCents).toBe(0);
});
