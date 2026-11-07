import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { appSetting, auditLog, booking, bookingSplit } from '../schema';
import { seedBasics, testCtx } from './test-helpers';
import { createBooking, getBooking, updateBooking } from './bookings';
import {
  adoptContactRepayment,
  chooseContactCredit,
  getContactStatement,
  reallocateContactRepayment,
  settleContact,
  waiveContactOutlay,
} from './contacts';
import { undo } from './audit';
import { bookedBalance } from './reconciliation';
import { budgetSummary } from './budget';

let opened: OpenedDatabase;
const today = '2026-09-30';
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const statement = () => getContactStatement(opened.db, 'k1', today);

it('pins later floating receipts at the credit decision date, including historical statements', () => {
  const paid = settleContact(
    opened.db,
    'k1',
    { accountId: 'giro', date: '2026-09-01', amountCents: 1001 },
    testCtx,
  );
  const paidId = getBooking(opened.db, paid.bookingId)!.splits[0]!.id;
  outlay(1001, 'essen', '2026-09-02');
  outlay(501, 'auslagen', '2026-09-03');
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-04',
      amountCents: 501,
      splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: 501 }],
    },
    testCtx,
  );
  const changed = chooseContactCredit(
    opened.db,
    'k1',
    { receiptSplitId: paidId, amountCents: 501, date: '2026-09-05', choice: 'gift' },
    testCtx,
    today,
  );
  expect(
    statement()
      .outlays.filter((o) => !o.creditSourceSplitId)
      .map((o) => o.remainingCents),
  ).toEqual([501, 0]);
  expect(
    getContactStatement(opened.db, 'k1', '2026-09-05')
      .outlays.filter((o) => !o.creditSourceSplitId)
      .map((o) => o.remainingCents),
  ).toEqual([501, 0]);
  expect(
    getContactStatement(opened.db, 'k1', '2026-09-04').outlays.map((o) => o.remainingCents),
  ).toEqual([0, 0]);
  undo(opened.db, { groupId: changed.groupId }, testCtx);
  expect(statement().outlays.map((o) => o.remainingCents)).toEqual([0, 0]);
});
function outlay(amountCents = 1001, categoryId = 'essen', date = '2026-09-01') {
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
function receipt(amountCents = 701) {
  const result = settleContact(
    opened.db,
    'k1',
    {
      accountId: 'giro',
      date: '2026-09-02',
      amountCents,
    },
    testCtx,
  );
  return getBooking(opened.db, result.bookingId)!.splits[0]!;
}

it('does not reverse an invented category inflow when adopting a legacy receipt for a category outlay', () => {
  const first = outlay();
  const floating = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-02',
      amountCents: 701,
      splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: 701 }],
    },
    testCtx,
  );
  const paid = getBooking(opened.db, floating)!.splits[0]!;
  const activity = () =>
    opened.db
      .select()
      .from(bookingSplit)
      .all()
      .filter(
        (s) =>
          s.categoryId === 'essen' &&
          !getBooking(opened.db, s.bookingId, { includeDeleted: true })?.deletedAt,
      )
      .reduce((sum, s) => sum + s.amountCents, 0);
  expect(activity()).toBe(-1001);
  adoptContactRepayment(opened.db, 'k1', paid.id, testCtx, today);
  expect(activity()).toBe(-1001);
  const reopened = reallocateContactRepayment(
    opened.db,
    'k1',
    paid.id,
    { allocations: [] },
    testCtx,
    today,
  );
  expect(activity()).toBe(-1001);
  expect(statement().creditCents).toBe(701);
  const restored = reallocateContactRepayment(
    opened.db,
    'k1',
    paid.id,
    { allocations: [{ outlaySplitId: first.id, amountCents: 701 }] },
    testCtx,
    today,
  );
  expect(activity()).toBe(-300);
  undo(opened.db, { groupId: restored.groupId }, testCtx);
  expect(activity()).toBe(-1001);
  undo(opened.db, { groupId: reopened.groupId }, testCtx);
  expect(activity()).toBe(-1001);
});

it('reopens a settled outlay into exact free credit without changing bank facts or RTA', () => {
  outlay();
  const paid = receipt();
  const before = getBooking(opened.db, paid.bookingId);
  const balance = bookedBalance(opened.db, 'giro', today);
  const rta = budgetSummary(opened.db, '2026-09').summary.toBeAssignedCents;
  const changed = reallocateContactRepayment(
    opened.db,
    'k1',
    paid.id,
    { allocations: [] },
    testCtx,
    today,
  );
  expect(statement().outlays.map((o) => o.remainingCents)).toEqual([1001]);
  expect(statement().creditCents).toBe(701);
  expect(getBooking(opened.db, paid.bookingId)).toEqual(before);
  expect(bookedBalance(opened.db, 'giro', today)).toBe(balance);
  expect(budgetSummary(opened.db, '2026-09').summary.toBeAssignedCents).toBe(rta);
  undo(opened.db, { groupId: changed.groupId }, testCtx);
  expect(statement().outlays.map((o) => o.remainingCents)).toEqual([300]);
});

it('pins a floating legacy receipt that has no allocation or settlement rows', () => {
  const first = outlay(1001, 'auslagen');
  const later = outlay(1001, 'auslagen', '2026-09-03');
  const id = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-02',
      amountCents: 701,
      splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: 701 }],
    },
    testCtx,
  );
  const paid = getBooking(opened.db, id)!.splits[0]!;
  expect(statement().receipts[0]?.recorded).toBe(false);
  const changed = reallocateContactRepayment(
    opened.db,
    'k1',
    paid.id,
    {
      allocations: [{ outlaySplitId: later.id, amountCents: 701 }],
    },
    testCtx,
    today,
  );
  expect(statement().outlays.map((o) => o.remainingCents)).toEqual([1001, 300]);
  undo(opened.db, { groupId: changed.groupId }, testCtx);
  expect(statement().outlays.find((o) => o.splitId === first.id)?.remainingCents).toBe(300);
  expect(statement().receipts[0]?.recorded).toBe(false);
});

// Legacy fixtures remove only the new provenance; these synthetic rows model pre-974 data.
function removeProvenance(db: OpenedDatabase['db'], bookingId: string) {
  db.delete(appSetting)
    .where(eq(appSetting.id, `contacts.credit.${bookingId}`))
    .run();
}

it('requires explicit legacy adoption and records it without changing ledger figures', () => {
  const first = outlay(1001, 'auslagen');
  const paid = receipt();
  removeProvenance(opened.db, paid.bookingId);
  const before = statement();
  expect(() =>
    reallocateContactRepayment(opened.db, 'k1', paid.id, { allocations: [] }, testCtx, today),
  ).toThrow(/adoption_required/);
  const adopted = adoptContactRepayment(opened.db, 'k1', paid.id, testCtx, today);
  expect(statement()).toEqual(before);
  const changed = reallocateContactRepayment(
    opened.db,
    'k1',
    paid.id,
    { allocations: [] },
    testCtx,
    today,
  );
  expect(statement().outlays.find((o) => o.splitId === first.id)?.remainingCents).toBe(1001);
  expect(statement().creditCents).toBe(701);
  expect(() => undo(opened.db, { groupId: adopted.groupId }, testCtx, { force: true })).toThrow();
  undo(opened.db, { groupId: changed.groupId }, testCtx);
  undo(opened.db, { groupId: adopted.groupId }, testCtx);
  expect(statement()).toEqual(before);
});

it('keeps released repayment credit free instead of silently consuming a later purchase', () => {
  outlay();
  const paid = receipt();
  outlay(501, 'reise', '2026-09-03');
  reallocateContactRepayment(opened.db, 'k1', paid.id, { allocations: [] }, testCtx, today);
  expect(statement().outlays.map((o) => o.remainingCents)).toEqual([1001, 501]);
  expect(statement().creditCents).toBe(701);
  expect(
    getContactStatement(opened.db, 'k1', '2026-09-03').outlays.map((o) => o.remainingCents),
  ).toEqual([300, 501]);
});

it('pins unrelated later floating receipt allocations while reopening an earlier repayment', () => {
  const first = outlay();
  const paid = receipt();
  const second = outlay(501, 'auslagen', '2026-09-03');
  const floating = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-04',
      amountCents: 501,
      splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: 501 }],
    },
    testCtx,
  );
  const floatingId = getBooking(opened.db, floating)!.splits[0]!.id;
  const before = statement();
  expect(before.receipts.find((r) => r.receiptSplitId === floatingId)?.allocations).toEqual([
    { outlaySplitId: first.id, amountCents: 300 },
    { outlaySplitId: second.id, amountCents: 201 },
  ]);
  const changed = reallocateContactRepayment(
    opened.db,
    'k1',
    paid.id,
    { allocations: [] },
    testCtx,
    today,
  );
  expect(statement().outlays.map((o) => o.remainingCents)).toEqual([701, 300]);
  expect(statement().creditCents).toBe(701);
  expect(
    getContactStatement(opened.db, 'k1', '2026-09-29').receipts.find(
      (r) => r.receiptSplitId === floatingId,
    )?.recorded,
  ).toBe(false);
  undo(opened.db, { groupId: changed.groupId }, testCtx);
  expect(statement()).toEqual(before);
});

it('waives the open remainder of a partly settled category share, preserving gross spending and Undo', () => {
  const first = outlay();
  receipt();
  const source = getBooking(opened.db, first.bookingId);
  const balance = bookedBalance(opened.db, 'giro', today);
  const rta = budgetSummary(opened.db, '2026-09').summary.toBeAssignedCents;
  const waived = waiveContactOutlay(
    opened.db,
    'k1',
    first.id,
    { amountCents: 299 },
    testCtx,
    today,
  );
  expect(statement().outlays.map((o) => o.remainingCents)).toEqual([1]);
  expect(statement().balanceCents).toBe(1);
  expect(getBooking(opened.db, first.bookingId)).toEqual(source);
  expect(
    getBooking(opened.db, waived.bookingId)?.splits.map((s) => [s.categoryId, s.amountCents]),
  ).toEqual([
    ['auslagen', 299],
    ['auslagen', -299],
  ]);
  expect(bookedBalance(opened.db, 'giro', today)).toBe(balance);
  expect(budgetSummary(opened.db, '2026-09').summary.toBeAssignedCents).toBe(rta);
  expect(getContactStatement(opened.db, 'k1', '2026-09-29').balanceCents).toBe(300);
  const undone = undo(opened.db, { groupId: waived.groupId }, testCtx);
  expect(statement().balanceCents).toBe(300);
  undo(opened.db, { groupId: undone.groupId }, testCtx);
  expect(statement().balanceCents).toBe(1);
});

it('waives standalone legacy Auslagen only into an explicitly selected expense category', () => {
  const first = outlay(1001, 'auslagen');
  expect(() =>
    waiveContactOutlay(opened.db, 'k1', first.id, { amountCents: 501 }, testCtx, today),
  ).toThrow(/Ausgabenkategorie/);
  const waived = waiveContactOutlay(
    opened.db,
    'k1',
    first.id,
    { amountCents: 501, categoryId: 'reise' },
    testCtx,
    today,
  );
  expect(statement().balanceCents).toBe(500);
  expect(
    getBooking(opened.db, waived.bookingId)?.splits.map((s) => [s.categoryId, s.amountCents]),
  ).toEqual([
    ['auslagen', 501],
    ['reise', -501],
  ]);
  expect(() =>
    waiveContactOutlay(
      opened.db,
      'k1',
      first.id,
      { amountCents: 501, categoryId: 'reise' },
      testCtx,
      today,
    ),
  ).toThrow();
  undo(opened.db, { groupId: waived.groupId }, testCtx);
  expect(statement().balanceCents).toBe(1001);
});

it('authorizes only allocation changes on locked bank rows and retains the authorization for Undo/redo', () => {
  const first = outlay();
  const paid = receipt();
  updateBooking(opened.db, first.bookingId, { status: 'reconciled' }, testCtx);
  updateBooking(opened.db, paid.bookingId, { status: 'reconciled' }, testCtx);
  const bankFacts = opened.db.select().from(booking).all();
  const snapshot = opened.sqlite.serialize();
  expect(() =>
    reallocateContactRepayment(opened.db, 'k1', paid.id, { allocations: [] }, testCtx, today),
  ).toThrow(/locked|gesperrt/);
  expect(opened.sqlite.serialize().equals(snapshot)).toBe(true);
  const changed = reallocateContactRepayment(
    opened.db,
    'k1',
    paid.id,
    { allocations: [] },
    testCtx,
    today,
    { unlock: true },
  );
  const marker = opened.db
    .select()
    .from(auditLog)
    .where(eq(auditLog.groupId, changed.groupId))
    .all()
    .find((e) => e.entityId.startsWith('contacts.allocation-unlock.'));
  expect(marker).toBeDefined();
  const waived = waiveContactOutlay(
    opened.db,
    'k1',
    first.id,
    { amountCents: 1001 },
    testCtx,
    today,
    { unlock: true },
  );
  expect(statement().balanceCents).toBe(-701);
  undo(opened.db, { groupId: waived.groupId }, testCtx);
  const undone = undo(opened.db, { groupId: changed.groupId }, testCtx);
  expect(statement().outlays.map((o) => o.remainingCents)).toEqual([300]);
  undo(opened.db, { groupId: undone.groupId }, testCtx);
  expect(statement().creditCents).toBe(701);
  for (const original of bankFacts)
    expect(opened.db.select().from(booking).where(eq(booking.id, original.id)).get()).toEqual(
      original,
    );
});
