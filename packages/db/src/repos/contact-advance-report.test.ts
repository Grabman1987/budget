import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { seedBasics, testCtx } from './test-helpers';
import { createBooking, getBooking, updateBooking } from './bookings';
import { BookingInvariantError } from './errors';
import { getContactStatement, settleContact, waiveContactOutlay } from './contacts';
import { contactAdvanceReport } from './contact-advance-report';
import { undo } from './audit';

let opened: OpenedDatabase;
const today = '2026-11-28';
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const db = () => opened.db;

function advance(amountCents: number, on: string, purposeCategoryId: string | null = null) {
  const id = createBooking(
    db(),
    {
      accountId: 'giro',
      date: on,
      amountCents: -amountCents,
      splits: [
        {
          categoryId: 'auslagen',
          contactId: 'k1',
          amountCents: -amountCents,
          ...(purposeCategoryId ? { purposeCategoryId } : {}),
        },
      ],
    },
    testCtx,
    { contactModel: true },
  );
  return getBooking(db(), id)!.splits[0]!;
}
const repay = (
  amountCents: number,
  on: string,
  allocations: { outlaySplitId: string; amountCents: number }[],
) =>
  settleContact(
    db(),
    'k1',
    { accountId: 'giro', date: on, amountCents, allocations, retainCredit: true },
    testCtx,
  );

it('stores a purpose only on an advance split, as an expense category', () => {
  const split = advance(1000, '2026-10-01', 'essen');
  expect(split.purposeCategoryId).toBe('essen');
  expect(advance(500, '2026-10-02').purposeCategoryId).toBeNull();
  const attempt = (splits: Parameters<typeof createBooking>[1]['splits']) =>
    createBooking(
      db(),
      { accountId: 'giro', date: '2026-10-03', amountCents: -1000, splits },
      testCtx,
      { contactModel: true },
    );
  // Not an advance category.
  expect(() =>
    attempt([
      { categoryId: 'essen', contactId: 'k1', amountCents: -1000, purposeCategoryId: 'reise' },
    ]),
  ).toThrow(BookingInvariantError);
  expect(() =>
    attempt([{ categoryId: 'essen', amountCents: -1000, purposeCategoryId: 'reise' }]),
  ).toThrow(/nur bei der Kategorie/);
  // The purpose itself must be an expense category.
  expect(() =>
    attempt([
      {
        categoryId: 'auslagen',
        contactId: 'k1',
        amountCents: -1000,
        purposeCategoryId: 'auslagen',
      },
    ]),
  ).toThrow(/Ausgabenkategorie/);
  expect(() =>
    attempt([
      {
        categoryId: 'auslagen',
        contactId: 'k1',
        amountCents: -1000,
        purposeCategoryId: 'gibt-es-nicht',
      },
    ]),
  ).toThrow(/Ausgabenkategorie/);
});

it('keeps the purpose through an edit and clears it when the split is replaced without one', () => {
  const split = advance(1000, '2026-10-01', 'essen');
  updateBooking(db(), split.bookingId, { memo: 'neu' }, testCtx, { contactModel: true });
  expect(getBooking(db(), split.bookingId)!.splits[0]!.purposeCategoryId).toBe('essen');
  updateBooking(
    db(),
    split.bookingId,
    {
      splits: [
        { categoryId: 'auslagen', contactId: 'k1', amountCents: -1000, purposeCategoryId: 'reise' },
      ],
    },
    testCtx,
    { contactModel: true },
  );
  expect(getBooking(db(), split.bookingId)!.splits[0]!.purposeCategoryId).toBe('reise');
  const group = 'g-undo';
  updateBooking(
    db(),
    split.bookingId,
    { splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: -1000 }] },
    { ...testCtx, groupId: group },
    { contactModel: true },
  );
  expect(getBooking(db(), split.bookingId)!.splits[0]!.purposeCategoryId).toBeNull();
  // The audit trail is field by field: undo brings the purpose back.
  undo(db(), { groupId: group }, testCtx);
  expect(getBooking(db(), split.bookingId)!.splits[0]!.purposeCategoryId).toBe('reise');
});

it('reports advanced, repaid, waived and open per month with purposes and settlement days', () => {
  const a = advance(10000, '2026-09-10', 'essen');
  const b = advance(5000, '2026-10-05', 'reise');
  advance(3000, '2026-10-20');
  const d = advance(2000, '2026-11-02', 'essen');
  repay(10000, '2026-10-15', [{ outlaySplitId: a.id, amountCents: 10000 }]);
  repay(4000, '2026-11-10', [{ outlaySplitId: b.id, amountCents: 4000 }]);
  waiveContactOutlay(
    db(),
    'k1',
    b.id,
    { amountCents: 1000, categoryId: 'reise', date: '2026-11-11' },
    testCtx,
    today,
  );

  const report = contactAdvanceReport(db(), 'k1', today);
  expect(report.months).toHaveLength(12);
  const [nov, oct, sep] = report.months as [
    (typeof report.months)[number],
    (typeof report.months)[number],
    (typeof report.months)[number],
  ];
  expect([nov.month, nov.advancedCents, nov.repaidCents, nov.waivedCents, nov.openCents]).toEqual([
    '2026-11',
    2000,
    4000,
    1000,
    5000,
  ]);
  expect([oct.advancedCents, oct.repaidCents, oct.openCents]).toEqual([8000, 10000, 8000]);
  expect([sep.advancedCents, sep.openCents]).toEqual([10000, 10000]);
  expect(oct.byPurpose).toEqual([
    { purposeCategoryId: 'reise', cents: 5000 },
    { purposeCategoryId: null, cents: 3000 },
  ]);
  expect(report.purposeNames).toEqual({ essen: 'Essen', reise: 'Reise' });
  expect(report.settledOutlays).toBe(2);
  // a: 35 days (10.09. to 15.10.), b: 37 days (05.10. to the waiver on 11.11.).
  expect(report.averageDaysToSettle).toBe(36);
  expect(report.peakOpenCents).toBe(15000);
  // The report's open amount is the statement's receivable.
  const receivable = getContactStatement(db(), 'k1', today).outlays.reduce(
    (sum, o) => sum + o.remainingCents,
    0,
  );
  expect(nov.openCents).toBe(receivable);
  expect(d.id).toBeTruthy();
});

it('counts an old share that stayed in its expense category with that category as purpose', () => {
  createBooking(
    db(),
    {
      accountId: 'giro',
      date: '2026-11-03',
      amountCents: -4000,
      splits: [
        { categoryId: 'essen', amountCents: -2000 },
        { categoryId: 'essen', contactId: 'k1', amountCents: -2000 },
      ],
    },
    testCtx,
    { contactModel: true },
  );
  const report = contactAdvanceReport(db(), 'k1', today);
  expect(report.months[0]!.byPurpose).toEqual([{ purposeCategoryId: 'essen', cents: 2000 }]);
});

it('puts the purpose name on the statement movement, for the ledger table', () => {
  advance(1000, '2026-11-02', 'essen');
  advance(500, '2026-11-03');
  const movements = getContactStatement(db(), 'k1', today).movements;
  expect(movements.map((m) => m.purposeName)).toEqual(['Essen', null]);
});
