import { afterEach, beforeEach, expect, it } from 'vitest';
import { bookingLineShares } from '@budget/domain';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { booking, bookingSplit } from '../schema';
import { and, eq, isNull } from 'drizzle-orm';
import { seedBasics, testCtx } from './test-helpers';
import { createBooking, getBooking, updateBooking } from './bookings';
import { chooseContactCredit, getContactStatement, settleContact } from './contacts';
import { history, undo } from './audit';
import { budgetSummary } from './budget';
import { previewContactRepayments } from './contact-repayment-preview';
import { convertContactOutlayToGift, listContactStatements } from './contacts';
import { deleteBooking } from './bookings';
import { createEntity } from './entities';
import { contact } from '../schema';
import { appSetting, contactAllocation, contactSettlement, payee } from '../schema';
import { overviewData } from './report-ledger';
import { accounts } from './entities';
import { bookedBalance } from './reconciliation';
import { netWorthAsOf } from './portfolio';

let opened: OpenedDatabase;
const date = '2026-09-10';
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const statement = () => getContactStatement(opened.db, 'k1', date);
const cash = () => ({
  balance: bookedBalance(opened.db, 'giro', date),
  wealth: netWorthAsOf(opened.db, date),
});
const totals = () => {
  const result: Record<string, number> = {};
  for (const s of opened.db
    .select({ categoryId: bookingSplit.categoryId, amountCents: bookingSplit.amountCents })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .where(isNull(booking.deletedAt))
    .all()) {
    const key = s.categoryId ?? 'rta';
    result[key] = (result[key] ?? 0) + s.amountCents;
  }
  return result;
};
function purchase(categoryId: string, amountCents: number, day = '2026-09-02') {
  const share = bookingLineShares(amountCents, [{ mode: 'percent', value: 5000 }]);
  return createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: day,
      amountCents: -amountCents,
      splits: [
        { categoryId, amountCents: -share.categoryCents },
        { categoryId, contactId: 'k1', amountCents: -share.contactCents[0]! },
      ],
    },
    testCtx,
    { contactModel: true },
  );
}
function receipt(
  amountCents: number,
  day = '2026-09-03',
  allocations?: { outlaySplitId: string; amountCents: number }[],
) {
  return settleContact(
    opened.db,
    'k1',
    { accountId: 'giro', date: day, amountCents, ...(allocations ? { allocations } : {}) },
    testCtx,
  );
}

it('returns exact largest-remainder shares to their original categories with no RTA or cash adjustment', () => {
  purchase('essen', 10001);
  purchase('reise', 3001);
  expect(totals()).toEqual({ essen: -10001, reise: -3001 });
  const before = cash();
  const paid = receipt(6500);
  expect(totals()).toMatchObject({ essen: -5001, reise: -1501, auslagen: 0 });
  expect(totals().rta).toBeUndefined();
  expect(bookedBalance(opened.db, 'giro', date)).toBe(93498);
  const after = cash();
  // Compare to the same cash receipt before any category return; valuation is category-neutral.
  const parts = getBooking(opened.db, paid.bookingId)!.splits;
  expect(parts.reduce((sum, s) => sum + s.amountCents, 0)).toBe(6500);
  expect(statement().balanceCents).toBe(0);
  undo(opened.db, { groupId: paid.groupId }, testCtx);
  expect(cash()).toEqual(before);
  expect(totals()).toMatchObject({ essen: -10001, reise: -3001 });
  expect(after.balance).toBe(before.balance + 6500);
  expect(after.wealth.totalCents).toBe(before.wealth.totalCents! + 6500);
});

it('honours explicit allocation, leaves excess as credit and restores the whole receipt on Undo/redo', () => {
  purchase('essen', 2000);
  purchase('reise', 4000);
  const target = statement().outlays[1]!;
  const partial = receipt(1500, '2026-09-03', [
    { outlaySplitId: target.splitId, amountCents: 1500 },
  ]);
  expect(totals()).toMatchObject({ essen: -2000, reise: -2500 });
  const before = cash();
  const paid = receipt(2500, '2026-09-04');
  expect(statement().creditCents).toBe(1000);
  expect(totals()).toMatchObject({ essen: -1000, reise: -2000, auslagen: 1000 });
  const reverted = undo(opened.db, { groupId: paid.groupId }, testCtx);
  expect(cash()).toEqual(before);
  undo(opened.db, { groupId: reverted.groupId }, testCtx);
  expect(statement().creditCents).toBe(1000);
  expect(() =>
    updateBooking(opened.db, partial.bookingId, { amountCents: 1400 }, testCtx),
  ).toThrow();
});

it('earmarks a portion, consumes only matching/free credit, and prevents forced Undo of its source', () => {
  const prepaid = receipt(3000, '2026-09-01');
  const originalCash = cash();
  const source = statement().credits[0]!;
  const chosen = chooseContactCredit(
    opened.db,
    'k1',
    {
      receiptSplitId: source.receiptSplitId,
      amountCents: 2000,
      date: '2026-09-01',
      choice: 'category',
      categoryId: 'reise',
    },
    testCtx,
    date,
  );
  expect(cash()).toEqual(originalCash);
  expect(statement().credits.map((c) => [c.categoryId, c.remainingCents])).toEqual([
    [null, 1000],
    ['reise', 2000],
  ]);
  const food = purchase('essen', 3000);
  expect(totals()).toMatchObject({ essen: -2000, auslagen: 2000 });
  expect(statement().outlays.find((o) => o.bookingId === food)?.remainingCents).toBe(500);
  const trip = purchase('reise', 4000, '2026-09-04');
  expect(totals()).toMatchObject({ reise: -2000, auslagen: 0 });
  expect(statement().creditCents).toBe(0);
  expect(() => undo(opened.db, { groupId: prepaid.groupId }, testCtx, { force: true })).toThrow();
  expect(() => undo(opened.db, { groupId: chosen.groupId }, testCtx, { force: true })).toThrow();
  expect(() => updateBooking(opened.db, trip, { date: '2026-09-05' }, testCtx)).toThrow();
  const groupId = history(opened.db, 'booking', trip)[0]!.groupId!;
  const undone = undo(opened.db, { groupId }, testCtx);
  expect(statement().credits.find((c) => c.categoryId === 'reise')?.remainingCents).toBe(2000);
  undo(opened.db, { groupId: undone.groupId }, testCtx);
  expect(statement().creditCents).toBe(0);
});

it('does not let partial provenance Undo detach credit decisions or uses', () => {
  receipt(3000, '2026-09-01');
  const source = statement().credits[0]!;
  const decision = chooseContactCredit(
    opened.db,
    'k1',
    {
      receiptSplitId: source.receiptSplitId,
      amountCents: 3000,
      date: '2026-09-01',
      choice: 'category',
      categoryId: 'essen',
    },
    testCtx,
    date,
  );
  const id = purchase('essen', 4000);
  for (const bookingId of [decision.bookingId, id]) {
    const auditId = history(opened.db, 'app_setting', `contacts.credit.${bookingId}`)[0]!.id;
    expect(() => undo(opened.db, { auditId }, testCtx, { force: true })).toThrow(/gesamte Aktion/);
  }
});

it('adds credit category returns on edits while unallocated purchases retain ordinary edit/gift/delete paths', () => {
  const original = purchase('essen', 4000);
  updateBooking(opened.db, original, { date: '2026-09-03' }, testCtx);
  const open = statement().outlays.find((o) => o.bookingId === original)!;
  convertContactOutlayToGift(
    opened.db,
    'k1',
    open.splitId,
    { amountCents: 2000, categoryId: 'reise' },
    testCtx,
    date,
  );
  deleteBooking(opened.db, original, testCtx);
  receipt(1000, '2026-09-01');
  const id = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-04',
      amountCents: -4000,
      splits: [{ categoryId: 'essen', amountCents: -4000 }],
    },
    testCtx,
  );
  const before = cash();
  updateBooking(
    opened.db,
    id,
    {
      splits: [
        { categoryId: 'essen', amountCents: -2000 },
        { categoryId: 'essen', contactId: 'k1', amountCents: -2000 },
      ],
    },
    testCtx,
    { contactModel: true },
  );
  expect(cash()).toEqual(before);
  expect(totals()).toMatchObject({ essen: -3000, auslagen: 0 });
});

it('lets legacy edits retain shared-category pairs while adding valid advance shares', () => {
  const id = purchase('essen', 4000);
  const before = cash();
  updateBooking(
    opened.db,
    id,
    {
      splits: [
        { categoryId: 'essen', amountCents: -1000 },
        { categoryId: 'essen', contactId: 'k1', amountCents: -2000 },
        { categoryId: 'auslagen', contactId: 'k1', amountCents: -1000 },
      ],
    },
    testCtx,
  );
  expect(cash()).toEqual(before);
  expect(totals()).toMatchObject({ essen: -3000, auslagen: -1000 });
  expect(statement().balanceCents).toBe(3000);
});

it('keeps gross claims and earmarked credit visible even with a zero net contact balance', () => {
  receipt(2000, '2026-09-01');
  chooseContactCredit(
    opened.db,
    'k1',
    {
      receiptSplitId: statement().credits[0]!.receiptSplitId,
      amountCents: 2000,
      date: '2026-09-01',
      choice: 'category',
      categoryId: 'reise',
    },
    testCtx,
    date,
  );
  purchase('essen', 4000);
  expect(statement()).toMatchObject({ balanceCents: 0, creditCents: 2000 });
  expect(listContactStatements(opened.db, date)).toMatchObject([
    { receivableCents: 2000, creditCents: 2000 },
  ]);
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-03',
      amountCents: -1000,
      splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: -1000 }],
    },
    testCtx,
  );
  expect(statement().creditCents).toBe(2000);
});

it('settles several contact credits independently of split/contact ordering', () => {
  createEntity(opened.db, contact, { id: 'k2', name: 'Kontakt Zwei' }, testCtx);
  receipt(1000, '2026-09-01');
  settleContact(
    opened.db,
    'k2',
    { accountId: 'giro', date: '2026-09-01', amountCents: 1000 },
    testCtx,
  );
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-02',
      amountCents: -2000,
      splits: [
        { categoryId: 'essen', contactId: 'k2', amountCents: -1000 },
        { categoryId: 'reise', contactId: 'k1', amountCents: -1000 },
      ],
    },
    testCtx,
    { contactModel: true },
  );
  expect(totals()).toMatchObject({ essen: 0, reise: 0, auslagen: 0 });
});

it('keeps category receipts out of Zu verteilen and previews only legacy mappings without writes', () => {
  purchase('essen', 4000);
  const before = budgetSummary(opened.db, '2026-09').summary.toBeAssignedCents;
  receipt(3000);
  expect(budgetSummary(opened.db, '2026-09').summary.toBeAssignedCents).toBe(before);
  expect(previewContactRepayments(opened.db)).toEqual([]);
  const legacy = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-05',
      amountCents: 500,
      splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: 500 }],
    },
    testCtx,
  );
  const snapshot = opened.sqlite.serialize();
  expect(previewContactRepayments(opened.db)).toMatchObject([
    { bookingId: legacy, status: 'needs-allocation-review', creditCents: 500 },
  ]);
  expect(opened.sqlite.serialize()).toEqual(snapshot);
});

it('allows an existing credit to become free or a gift with no cash or wealth change', () => {
  receipt(3000, '2026-09-01');
  const before = cash();
  const source = statement().credits[0]!;
  const marked = chooseContactCredit(
    opened.db,
    'k1',
    {
      receiptSplitId: source.receiptSplitId,
      amountCents: 2000,
      date: '2026-09-02',
      choice: 'category',
      categoryId: 'reise',
    },
    testCtx,
    date,
  );
  const earmarked = statement().credits.find((c) => c.categoryId === 'reise')!;
  chooseContactCredit(
    opened.db,
    'k1',
    {
      receiptSplitId: earmarked.receiptSplitId,
      amountCents: 500,
      date: '2026-09-03',
      choice: 'free',
    },
    testCtx,
    date,
  );
  const gift = chooseContactCredit(
    opened.db,
    'k1',
    {
      receiptSplitId: earmarked.receiptSplitId,
      amountCents: 1000,
      date: '2026-09-04',
      choice: 'gift',
    },
    testCtx,
    date,
  );
  expect(cash()).toEqual(before);
  expect(totals()).toMatchObject({ auslagen: 2000, rta: 1000 });
  expect(
    overviewData(opened.db).splits.find(
      (s) => s.bookingId === gift.bookingId && s.kind === 'income',
    )?.incomeGroup,
  ).toBe('household');
  expect(statement().creditCents).toBe(2000);
  undo(opened.db, { groupId: gift.groupId }, testCtx);
  expect(statement().creditCents).toBe(3000);
  expect(cash()).toEqual(before);
  expect(() => undo(opened.db, { groupId: marked.groupId }, testCtx, { force: true })).toThrow();
});

it('refuses a gift dated before its selected account opening and permits decisions on closed-source credit', () => {
  receipt(2000, '2026-09-01');
  const source = statement().credits[0]!;
  accounts.create(
    opened.db,
    {
      id: 'later',
      name: 'Späteres Beispielkonto',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-09-05',
    },
    testCtx,
  );
  const before = cash();
  expect(() =>
    chooseContactCredit(
      opened.db,
      'k1',
      {
        receiptSplitId: source.receiptSplitId,
        amountCents: 1000,
        date: '2026-09-02',
        choice: 'gift',
        accountId: 'later',
      },
      testCtx,
      date,
    ),
  ).toThrow();
  expect(cash()).toEqual(before);
  accounts.update(opened.db, 'giro', { closedAt: '2026-09-03' }, testCtx);
  chooseContactCredit(
    opened.db,
    'k1',
    {
      receiptSplitId: source.receiptSplitId,
      amountCents: 1000,
      date: '2026-09-04',
      choice: 'category',
      categoryId: 'reise',
    },
    testCtx,
    date,
  );
  expect(statement().credits.find((c) => c.categoryId === 'reise')?.remainingCents).toBe(1000);
});

it('keeps independent receipt and purchase-credit returns in a mixed manual capture', () => {
  purchase('essen', 2000, '2026-09-01');
  const id = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-02',
      amountCents: 1000,
      splits: [
        { categoryId: 'auslagen', contactId: 'k1', amountCents: 2000 },
        { categoryId: 'reise', contactId: 'k1', amountCents: -1000 },
      ],
    },
    testCtx,
    { contactModel: true },
  );
  expect(totals()).toMatchObject({ essen: -1000, reise: 0, auslagen: 0 });
  expect(statement().balanceCents).toBe(0);
  const groupId = history(opened.db, 'booking', id)[0]!.groupId!;
  undo(opened.db, { groupId }, testCtx);
  expect(totals()).toMatchObject({ essen: -2000 });
});

it.each([0, -1000])(
  'returns a positive repayment split even when the booking net is %i cents',
  (amountCents) => {
    purchase('essen', 2000, '2026-09-01');
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-09-02',
        amountCents,
        splits: [
          { categoryId: 'auslagen', contactId: 'k1', amountCents: 1000 },
          { categoryId: 'reise', amountCents: amountCents - 1000 },
        ],
      },
      testCtx,
      { contactModel: true },
    );
    expect(totals()).toMatchObject({ essen: -1000, reise: amountCents - 1000, auslagen: 0 });
    expect(statement().balanceCents).toBe(0);
    expect(cash().balance).toBe(98000 + amountCents);
  },
);

it('previews recorded destinations and unrecorded RTA candidates with explicit uncertainty', () => {
  purchase('essen', 2000, '2026-09-01');
  purchase('reise', 4000, '2026-09-01');
  const open = statement().outlays;
  const legacy = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-02',
      amountCents: 3000,
      splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: 3000 }],
    },
    testCtx,
  );
  const splitId = getBooking(opened.db, legacy)!.splits[0]!.id;
  opened.db
    .insert(contactSettlement)
    .values({
      id: 'legacy-settlement',
      contactId: 'k1',
      bookingId: legacy,
      receiptSplitId: splitId,
      creditCents: 0,
    })
    .run();
  opened.db
    .insert(contactAllocation)
    .values(
      open.map((o, i) => ({
        id: `legacy-allocation-${i}`,
        settlementId: 'legacy-settlement',
        outlaySplitId: o.splitId,
        amountCents: -o.amountCents,
      })),
    )
    .run();
  purchase('essen', 1000, '2026-09-03');
  createEntity(
    opened.db,
    payee,
    { id: 'repayer', name: 'Beispielempfänger', contactId: 'k1' },
    testCtx,
  );
  const rta = createBooking(
    opened.db,
    {
      accountId: 'giro',
      payeeId: 'repayer',
      date: '2026-09-04',
      amountCents: 700,
      splits: [{ amountCents: 700 }],
    },
    testCtx,
  );
  const before = opened.sqlite.serialize();
  const report = previewContactRepayments(opened.db);
  expect(report.find((r) => r.bookingId === legacy)).toMatchObject({
    status: 'recorded-allocation',
    mappings: [
      { categoryId: 'essen', amountCents: 1000, status: 'original-category' },
      { categoryId: 'reise', amountCents: 2000, status: 'original-category' },
    ],
  });
  expect(report.find((r) => r.bookingId === rta)).toMatchObject({
    status: 'needs-allocation-review',
    creditCents: 200,
    mappings: [{ categoryId: 'essen', amountCents: 500 }],
  });
  expect(opened.sqlite.serialize()).toEqual(before);
  expect(opened.db.select().from(appSetting).all()).not.toEqual([]);
});

it('rolls back invalid/stale choices and retains reconciled locks', () => {
  receipt(1000, '2026-09-01');
  const before = cash();
  const source = statement().credits[0]!;
  expect(() =>
    chooseContactCredit(
      opened.db,
      'k1',
      { receiptSplitId: source.receiptSplitId, amountCents: 1001, date, choice: 'gift' },
      testCtx,
      date,
    ),
  ).toThrow();
  expect(cash()).toEqual(before);
  const id = purchase('essen', 4000);
  updateBooking(opened.db, id, { status: 'reconciled' }, testCtx);
  expect(() => updateBooking(opened.db, id, { date: '2026-09-03' }, testCtx)).toThrow();
  expect(
    opened.db
      .select()
      .from(booking)
      .where(and(eq(booking.id, id), isNull(booking.deletedAt)))
      .get()?.status,
  ).toBe('reconciled');
});
