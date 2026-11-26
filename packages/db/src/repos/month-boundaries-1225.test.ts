import { nextMonth } from '@budget/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { expectedOccurrence, incomeType } from '../schema';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { createBooking, createTransfer, updateBooking } from './bookings';
import { createExpectedPayment, matchOccurrences } from './expected';
import { setAssigned } from './envelopes';
import { readInbox } from './inbox';
import { accountBalances, budget } from './queries';
import { forecastInputs, loadFacts } from './rule-inputs';
import { seedBasics, testCtx as ctx } from './test-helpers';

/**
 * Cockpit F20 (epic #1225): month boundaries and state transitions. Synthetic data only; every
 * expectation is a literal cent amount worked out by hand. Opening balance of `giro` is 100.000.
 */
let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
  opened.sqlite.exec(`
    INSERT INTO account (id, name, type, role, on_budget, opening_date, sort_order) VALUES
      ('karte', 'Karte', 'credit_card', 'budget', 1, '2023-10-01', 5);
    INSERT INTO category (id, name, group_id, class, kind, card_account_id) VALUES
      ('kz', 'Kartenzahlung', 'g', NULL, 'card_payment', 'karte');`);
});
afterEach(() => opened.close());

const book = (
  accountId: string,
  date: string,
  cents: number,
  categoryId: string | null,
  extra: Partial<Parameters<typeof createBooking>[1]> = {},
) =>
  createBooking(
    db,
    { accountId, date, amountCents: cents, splits: [{ categoryId, amountCents: cents }], ...extra },
    ctx,
  );
const essen = (m: string) => budget(db, [m])[0]!.envelopes['essen'];
const giroOn = (date: string) =>
  accountBalances(db, date).find((b) => b.accountId === 'giro')!.balanceCents;

describe('F20 first and last day of a month', () => {
  it.each([
    ['2026-01', '2026-01-31', '2026-02'],
    ['2026-02', '2026-02-28', '2026-03'], // 28-day month
    ['2024-02', '2024-02-29', '2024-03'], // leap year, 29-day month
    ['2026-04', '2026-04-30', '2026-05'], // 30-day month
    ['2025-12', '2025-12-31', '2026-01'], // year end
  ])('%s: booking on %s stays in the month, the day after opens the next', (month, last, next) => {
    expect(nextMonth(month)).toBe(next);
    book('giro', `${month}-01`, -500, 'essen'); // first day of the month
    book('giro', last, -1000, 'essen'); // last day of the month
    book('giro', `${next}-01`, -2000, 'essen'); // first day of the next month
    expect(essen(month)).toMatchObject({ activityCents: -1500 });
    expect(essen(next)).toMatchObject({ activityCents: -2000 });
    // Cash at the end of each month: opening 100.000 minus what was booked up to that day.
    expect(budget(db, [month])[0]!.cashCents).toBe(98_500);
    expect(budget(db, [next])[0]!.cashCents).toBe(96_500);
    expect(giroOn(last)).toBe(98_500);
    expect(giroOn(`${next}-01`)).toBe(96_500);
  });

  it('assigned money and overspending carry across the last day without loss', () => {
    setAssigned(db, 'essen', '2026-02', 3_000, ctx);
    book('giro', '2026-02-28', -1_000, 'essen');
    book('giro', '2026-03-01', -1_000, 'essen');
    const [feb, mar] = budget(db, ['2026-02', '2026-03']);
    expect(feb!.envelopes['essen']).toMatchObject({ assignedCents: 3_000, availableCents: 2_000 });
    expect(mar!.envelopes['essen']).toMatchObject({
      carryCents: 2_000,
      activityCents: -1_000,
      availableCents: 1_000,
    });
  });
});

describe('F20 income marked for the next month', () => {
  it.each([
    ['2026-01-31', '2026-01', '2026-02'],
    ['2026-02-28', '2026-02', '2026-03'],
    ['2025-12-31', '2025-12', '2026-01'],
  ])(
    'salary booked %s with the next-month mark is income of the month after',
    (date, month, next) => {
      book('giro', date, 200_000, null, { incomeNextMonth: true });
      const [m, n] = budget(db, [month, next]);
      expect(m!.incomeCents).toBe(0);
      expect(n!.incomeCents).toBe(200_000);
      // The cash is there on the booking day, the budgeting of it starts next month.
      expect(m!.cashCents).toBe(300_000);
      expect(m!.toBeAssignedCents).toBe(100_000);
      expect(n!.toBeAssignedCents).toBe(300_000);
    },
  );

  it('the same salary without the mark counts in its own month', () => {
    book('giro', '2026-01-31', 200_000, null);
    const [jan, feb] = budget(db, ['2026-01', '2026-02']);
    expect(jan!.incomeCents).toBe(200_000);
    expect(feb!.incomeCents).toBe(0);
    expect(jan!.toBeAssignedCents).toBe(300_000);
    expect(feb!.toBeAssignedCents).toBe(300_000);
  });
});

describe('F20 card statement cycle across the month end with a partial payment', () => {
  it('moves each purchase to Kartenzahlung in its month; the payment lowers it in its month', () => {
    setAssigned(db, 'essen', '2026-05', 40_000, ctx);
    book('karte', '2026-05-28', -25_000, 'essen');
    book('karte', '2026-05-30', -5_000, 'essen');
    book('karte', '2026-06-02', -10_000, 'essen'); // same statement, next month
    createTransfer(
      db,
      { fromAccountId: 'giro', toAccountId: 'karte', date: '2026-06-05', amountCents: 20_000 },
      ctx,
    );
    const [may, june] = budget(db, ['2026-05', '2026-06']);
    expect(may!.envelopes['essen']).toMatchObject({
      activityCents: -30_000,
      availableCents: 10_000,
    });
    expect(may!.envelopes['kz']?.availableCents).toBe(30_000);
    expect(june!.envelopes['essen']).toMatchObject({
      carryCents: 10_000,
      activityCents: -10_000,
      availableCents: 0,
    });
    // 30.000 + 10.000 moved in June, minus the partial payment of 20.000.
    expect(june!.envelopes['kz']?.availableCents).toBe(20_000);
    const balance = accountBalances(db, '2026-06-30').find((b) => b.accountId === 'karte');
    expect(balance?.balanceCents).toBe(-20_000);
    // Funded card debt equals the open debt: nothing is lost or counted twice.
    expect(-balance!.balanceCents).toBe(june!.envelopes['kz']!.availableCents);
    // The paid cash left the giro once.
    expect(june!.cashCents).toBe(80_000);
  });
});

describe('F20 pending booking becomes booked on a later date', () => {
  it('counts once before and after, never twice and never dropped', () => {
    const created = book('giro', '2026-03-31', -3_000, 'essen', { status: 'pending' });
    const activity = () => {
      const [mar, apr] = budget(db, ['2026-03', '2026-04']);
      return [
        mar!.envelopes['essen']?.activityCents ?? 0,
        apr!.envelopes['essen']?.activityCents ?? 0,
      ];
    };
    expect(activity()).toEqual([-3_000, 0]);
    expect(giroOn('2026-04-30')).toBe(97_000);
    updateBooking(db, created, { date: '2026-04-02', status: 'confirmed' }, ctx);
    expect(activity()).toEqual([0, -3_000]);
    expect(budget(db, ['2026-04'])[0]!.cashCents).toBe(97_000);
    expect(giroOn('2026-04-30')).toBe(97_000);
  });
});

describe('F20 planned payment becomes a booking', () => {
  const TODAY = '2026-03-20';
  const AS_OF = '2026-03-24'; // the day the rent is paid, one day before it is due
  const itemsOn = (day: string) =>
    forecastInputs(loadFacts(db, AS_OF), AS_OF, { byAccount: {} }).items.filter(
      (i) => i.day === day,
    );

  const rent = () =>
    createExpectedPayment(
      db,
      {
        name: 'Miete',
        accountId: 'giro',
        categoryId: 'miete',
        payeeId: 'p1',
        dueDay: 25,
        startDate: '2026-01-01',
      },
      { validFrom: '2026-01-01', amountCents: 40_000 },
      ctx,
      TODAY,
    );

  it('an expected income already booked and matched is dropped from the forecast', () => {
    createExpectedPayment(
      db,
      {
        name: 'Gehalt',
        kind: 'inflow',
        accountId: 'giro',
        incomeTypeId: db.select().from(incomeType).all()[0]!.id,
        dueDay: 25,
        startDate: '2026-01-01',
      },
      { validFrom: '2026-01-01', amountCents: 300_000 },
      ctx,
      TODAY,
    );
    expect(itemsOn('2026-03-25')).toEqual([expect.objectContaining({ cents: 300_000 })]);
    createBooking(
      db,
      {
        accountId: 'giro',
        date: AS_OF, // arrives one day early, already in the balance
        amountCents: 300_000,
        splits: [{ amountCents: 300_000, incomeTypeId: db.select().from(incomeType).all()[0]!.id }],
      },
      ctx,
    );
    expect(matchOccurrences(db, AS_OF).received).toBe(1);
    expect(itemsOn('2026-03-25')).toHaveLength(0);
    expect(itemsOn('2026-04-25')).toHaveLength(1); // the next month stays planned
  });

  it('an open expected payment is counted once in the forecast', () => {
    rent();
    expect(itemsOn('2026-03-25')).toEqual([expect.objectContaining({ cents: -40_000 })]);
    expect(itemsOn('2026-04-25')).toHaveLength(1);
  });

  it('an early-paid debit with a matching payee is linked and dropped from this month’s forecast', () => {
    const { payment } = rent();
    const bookingId = book('giro', AS_OF, -40_000, 'miete', { payeeId: 'p1' });
    expect(giroOn(AS_OF)).toBe(60_000);
    expect(matchOccurrences(db, AS_OF)).toMatchObject({ received: 1, proposed: 0 });
    expect(
      db
        .select()
        .from(expectedOccurrence)
        .where(eq(expectedOccurrence.expectedPaymentId, payment.id))
        .all(),
    ).toContainEqual(
      expect.objectContaining({ dueDate: '2026-03-25', status: 'received', bookingId }),
    );
    expect(itemsOn('2026-03-25')).toHaveLength(0);
    expect(itemsOn('2026-04-25')).toEqual([expect.objectContaining({ cents: -40_000 })]);
  });

  it('an early-paid debit without counterparty evidence stays a proposal and is forecast once', () => {
    const { payment } = rent();
    const bookingId = book('giro', AS_OF, -40_000, 'miete');
    expect(giroOn(AS_OF)).toBe(60_000);
    expect(matchOccurrences(db, AS_OF)).toMatchObject({ received: 0, proposed: 1, links: [] });
    const occurrence = db
      .select()
      .from(expectedOccurrence)
      .where(eq(expectedOccurrence.expectedPaymentId, payment.id))
      .all()
      .find((o) => o.dueDate === '2026-03-25')!;
    expect(occurrence).toMatchObject({ status: 'expected', bookingId: null });
    expect(readInbox(db, AS_OF).entries).toContainEqual(
      expect.objectContaining({
        linkProposal: expect.objectContaining({ occurrenceId: occurrence.id, bookingId }),
      }),
    );
    // Without confirmation the forecast conservatively keeps the open occurrence (#1102).
    expect(itemsOn('2026-03-25')).toEqual([expect.objectContaining({ cents: -40_000 })]);
    expect(itemsOn('2026-04-25')).toEqual([expect.objectContaining({ cents: -40_000 })]);
  });
});
