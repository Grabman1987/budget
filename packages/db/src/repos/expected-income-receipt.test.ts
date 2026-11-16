import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import { INCOME_TYPES, auditLog } from '../schema';
import { seedBasics, testCtx } from './test-helpers';
import { createBooking, getBooking, updateBooking } from './bookings';
import { undo } from './audit';
import {
  acknowledgeIncomeReceipt,
  incomeReceiptCandidates,
  createExpectedPayment,
  upcoming,
  linkOccurrence,
} from './expected';
import { forecastInputs, loadFacts } from './rule-inputs';
import { monthIncomeBooked } from './month-reports';

let opened: ReturnType<typeof createTestDatabase>;
let db: ReturnType<typeof createTestDatabase>['db'];
beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
});
afterEach(() => opened.close());

it('offers only an unclaimed same-payer receipt in the window and links it with atomic Undo', () => {
  const payment = createExpectedPayment(
    db,
    {
      name: 'Test income',
      kind: 'inflow',
      accountId: 'giro',
      payeeId: 'p1',
      incomeTypeId: INCOME_TYPES.salary.id,
      dueDay: 20,
      startDate: '2026-03-01',
      dateWindowDays: 3,
    },
    { validFrom: '2026-03-01', amountCents: 10001 },
    testCtx,
    '2026-03-20',
  ).payment;
  const book = (date: string, amountCents: number, payeeId: string | null = 'p1') =>
    createBooking(
      db,
      {
        accountId: 'giro',
        date,
        amountCents,
        payeeId,
        splits: [{ incomeTypeId: INCOME_TYPES.salary.id, amountCents }],
      },
      testCtx,
    );
  book('2026-03-16', 10001);
  book('2026-03-21', 10001);
  book('2026-03-19', 10001, null);
  book('2026-03-19', 5000);
  const receipt = book('2026-03-18', 10001);
  expect(incomeReceiptCandidates(db, payment.id, '2026-03-20', '2026-03-20')).toEqual([
    { bookingId: receipt, date: '2026-03-18', amountCents: 10001, currency: 'EUR' },
  ]);
  const forecast = () =>
    forecastInputs(loadFacts(db, '2026-03-19'), '2026-03-19', { byAccount: {} }).items.filter(
      (i) => i.day === '2026-03-20',
    );
  expect(forecast()).toMatchObject([{ cents: 10001 }]);
  const before = getBooking(db, receipt);
  const expectedBefore = monthIncomeBooked(db, '2026-03-20', '2026-03').expectedCents;
  expect(expectedBefore).toBe(45004);
  const result = acknowledgeIncomeReceipt(
    db,
    payment.id,
    '2026-03-20',
    receipt,
    testCtx,
    '2026-03-20',
  );
  expect(result.occurrence).toMatchObject({ status: 'received', bookingId: receipt });
  expect(forecast()).toEqual([]);
  expect(monthIncomeBooked(db, '2026-03-20', '2026-03')).toMatchObject({
    expectedCents: 35003,
    receivedCents: 35003,
  });
  expect(incomeReceiptCandidates(db, payment.id, '2026-03-20', '2026-03-20')).toEqual([]);
  expect(() =>
    acknowledgeIncomeReceipt(db, payment.id, '2026-03-20', receipt, testCtx, '2026-03-20'),
  ).toThrow();
  expect(getBooking(db, receipt)).toEqual(before);
  undo(db, { groupId: result.groupId }, testCtx);
  expect(forecast()).toMatchObject([{ cents: 10001 }]);
  expect(upcoming(db, '2026-03-20', '2026-03-20')[0]).toMatchObject({
    status: 'expected',
    bookingId: null,
  });
  expect(monthIncomeBooked(db, '2026-03-20', '2026-03').expectedCents).toBe(expectedBefore);
});

it.each(['edited', 'claimed'])(
  'rejects a %s receipt proposal without closing the occurrence',
  (change) => {
    const payment = createExpectedPayment(
      db,
      {
        name: 'Test income',
        kind: 'inflow',
        accountId: 'giro',
        payeeId: 'p1',
        incomeTypeId: INCOME_TYPES.salary.id,
        dueDay: 20,
        startDate: '2026-03-01',
      },
      { validFrom: '2026-03-01', amountCents: 10001 },
      testCtx,
      '2026-03-20',
    ).payment;
    const receipt = createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-20',
        amountCents: 10001,
        payeeId: 'p1',
        splits: [{ incomeTypeId: INCOME_TYPES.salary.id, amountCents: 10001 }],
      },
      testCtx,
    );
    expect(incomeReceiptCandidates(db, payment.id, '2026-03-20', '2026-03-20')).toHaveLength(1);
    if (change === 'edited') updateBooking(db, receipt, { payeeId: null }, testCtx);
    else {
      const other = createExpectedPayment(
        db,
        {
          name: 'Other income',
          kind: 'inflow',
          accountId: 'giro',
          payeeId: 'p1',
          incomeTypeId: INCOME_TYPES.salary.id,
          dueDay: 19,
          startDate: '2026-03-01',
        },
        { validFrom: '2026-03-01', amountCents: 10001 },
        testCtx,
        '2026-03-20',
      ).payment;
      const occurrence = upcoming(db, '2026-03-19', '2026-03-19').find(
        (o) => o.paymentId === other.id,
      )!;
      linkOccurrence(db, occurrence.occurrenceId, receipt, testCtx);
    }
    expect(incomeReceiptCandidates(db, payment.id, '2026-03-20', '2026-03-20')).toEqual([]);
    const auditBefore = db.select().from(auditLog).all();
    expect(() =>
      acknowledgeIncomeReceipt(db, payment.id, '2026-03-20', receipt, testCtx, '2026-03-20'),
    ).toThrow();
    expect(upcoming(db, '2026-03-20', '2026-03-20')[0]).toMatchObject({
      status: 'expected',
      bookingId: null,
    });
    expect(db.select().from(auditLog).all()).toEqual(auditBefore);
  },
);
