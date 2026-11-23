import { expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import {
  account,
  auditLog,
  booking,
  expectedOccurrence,
  expectedPayment,
  expectedPaymentVersion,
  fxRate,
  plannedEvent,
} from '../schema';
import { forecastBacktest } from './forecast-backtest';

const known = { createdAt: '2026-01-31T10:00:00Z', updatedAt: '2026-01-31T10:00:00Z' };
const later = { createdAt: '2026-02-28T10:00:00Z', updatedAt: '2026-02-28T10:00:00Z' };

it('replays known plans in cents, scores dated actuals and performs no writes', () => {
  const { db, sqlite, close } = createTestDatabase();
  try {
    db.insert(account)
      .values([
        {
          id: 'a',
          name: 'Synthetic A',
          type: 'checking',
          onBudget: true,
          role: 'budget',
          openingDate: '2026-01-31',
          openingBalanceCents: 10000,
          ...known,
        },
        {
          id: 'b',
          name: 'Synthetic B',
          type: 'cash',
          onBudget: true,
          role: 'budget',
          openingDate: '2026-01-31',
          openingBalanceCents: 5000,
          ...known,
        },
      ])
      .run();
    db.insert(expectedPayment)
      .values({
        id: 'income',
        name: 'Synthetic income',
        kind: 'inflow',
        accountId: 'a',
        dueDay: 5,
        ...known,
      })
      .run();
    db.insert(expectedPaymentVersion)
      .values([
        {
          id: 'v1',
          expectedPaymentId: 'income',
          validFrom: '2026-01-31',
          amountCents: 3000,
          ...known,
        },
        {
          id: 'v2',
          expectedPaymentId: 'income',
          validFrom: '2026-02-02',
          amountCents: 8000,
          ...later,
        },
      ])
      .run();
    db.insert(plannedEvent)
      .values({
        id: 'plan',
        name: 'Synthetic plan',
        date: '2026-02-08',
        accountId: 'a',
        amountCents: -9000,
        ...known,
        updatedAt: later.updatedAt,
      })
      .run();
    db.insert(auditLog)
      .values({
        id: 'edit',
        ts: later.updatedAt,
        action: 'update',
        entityType: 'planned_event',
        entityId: 'plan',
        beforeJson: JSON.stringify({ amount_cents: -1000, updated_at: known.updatedAt }),
        afterJson: JSON.stringify({ amount_cents: -9000, updated_at: later.updatedAt }),
      })
      .run();
    db.insert(booking)
      .values([
        { id: 'planned', accountId: 'a', date: '2026-02-08', amountCents: -1000, ...later },
        { id: 'unplanned', accountId: 'a', date: '2026-02-09', amountCents: -1201, ...later },
        { id: 'received', accountId: 'a', date: '2026-02-15', amountCents: 3000, ...later },
        { id: 'extra', accountId: 'a', date: '2026-02-20', amountCents: 301, ...later },
        { id: 'backdated', accountId: 'b', date: '2026-02-01', amountCents: 501, ...later },
      ])
      .run();
    db.insert(expectedOccurrence)
      .values({
        id: 'occ',
        expectedPaymentId: 'income',
        dueDate: '2026-02-05',
        expectedAmountCents: 3000,
        status: 'received',
        bookingId: 'received',
        ...later,
      })
      .run();
    sqlite.pragma('query_only = ON');

    const report = forecastBacktest(db, '2026-03-12', 1);
    expect(report.months).toEqual(['2026-02']);
    expect(report.meanEndErrorCents).toBe(701);
    expect(report.meanLowErrorCents).toBe(1351);
    expect(report.rows).toMatchObject([
      {
        accountId: 'a',
        end: {
          predictedCents: 12000,
          actualCents: 11100,
          errorCents: -900,
          cause: 'unplanned_expense',
        },
        low: {
          predictedCents: 10000,
          actualCents: 7799,
          errorCents: -2201,
          cause: 'late_income',
          predictedDay: '2026-02-01',
          actualDay: '2026-02-09',
        },
      },
      {
        accountId: 'b',
        end: {
          predictedCents: 5000,
          actualCents: 5501,
          errorCents: 501,
          cause: 'missing_schedule',
        },
        low: {
          predictedCents: 5000,
          actualCents: 5501,
          errorCents: 501,
          cause: 'missing_schedule',
        },
      },
    ]);
    expect(report.largestMisses.map((miss) => miss.errorCents)).toEqual([-2201, -900, 501, 501]);
    expect(forecastBacktest(db, '2026-03-12', 1)).toEqual(report);
  } finally {
    close();
  }
});

it('bounds actuals to month-end and uses only historically knowable forecast inputs', () => {
  const { db, sqlite, close } = createTestDatabase();
  try {
    db.insert(account)
      .values(
        ['late', 'offset', 'fx', 'settled', 'other'].map((id) => ({
          id,
          name: `Synthetic ${id}`,
          type: 'checking' as const,
          onBudget: id !== 'other',
          role: 'budget' as const,
          openingDate: '2026-01-31',
          openingBalanceCents: 1000,
          ...known,
        })),
      )
      .run();
    db.insert(expectedPayment)
      .values([
        {
          id: 'late-income',
          name: 'Synthetic late income',
          kind: 'inflow',
          accountId: 'late',
          dueDay: 5,
          ...known,
        },
        {
          id: 'offset-expense',
          name: 'Synthetic offset expense',
          kind: 'outflow',
          accountId: 'offset',
          dueDay: 10,
          ...known,
        },
        {
          id: 'fx-expense',
          name: 'Synthetic FX expense',
          kind: 'outflow',
          accountId: 'fx',
          dueDay: 6,
          ...known,
        },
        {
          id: 'settled-expense',
          name: 'Synthetic settled expense',
          kind: 'outflow',
          accountId: 'settled',
          dueDay: 1,
          ...known,
        },
      ])
      .run();
    db.insert(expectedPaymentVersion)
      .values([
        {
          id: 'late-v',
          expectedPaymentId: 'late-income',
          validFrom: '2026-01-31',
          amountCents: 501,
          ...known,
        },
        {
          id: 'offset-v',
          expectedPaymentId: 'offset-expense',
          validFrom: '2026-01-31',
          amountCents: 800,
          ...known,
        },
        {
          id: 'fx-v',
          expectedPaymentId: 'fx-expense',
          validFrom: '2026-01-31',
          amountCents: 300,
          currency: 'USD',
          ...known,
        },
        {
          id: 'settled-v',
          expectedPaymentId: 'settled-expense',
          validFrom: '2026-01-31',
          amountCents: 401,
          ...known,
        },
      ])
      .run();
    db.insert(fxRate).values({ date: '2026-01-31', currency: 'USD', rateMicro: 900000 }).run();
    db.insert(booking)
      .values([
        { id: 'late-receipt', accountId: 'late', date: '2026-03-02', amountCents: 501, ...later },
        {
          id: 'offset-receipt',
          accountId: 'offset',
          date: '2026-02-05',
          amountCents: 800,
          ...later,
        },
        {
          id: 'offset-debit',
          accountId: 'offset',
          date: '2026-02-10',
          amountCents: -800,
          ...later,
        },
        {
          id: 'settled-debit',
          accountId: 'other',
          date: '2026-02-01',
          amountCents: -401,
          ...known,
        },
      ])
      .run();
    db.insert(expectedOccurrence)
      .values([
        {
          id: 'late-match',
          expectedPaymentId: 'late-income',
          dueDate: '2026-02-05',
          expectedAmountCents: 501,
          status: 'received',
          bookingId: 'late-receipt',
          ...later,
        },
        {
          id: 'offset-match',
          expectedPaymentId: 'offset-expense',
          dueDate: '2026-02-10',
          expectedAmountCents: -800,
          status: 'received',
          bookingId: 'offset-debit',
          ...later,
        },
        {
          id: 'settled-match',
          expectedPaymentId: 'settled-expense',
          dueDate: '2026-02-01',
          expectedAmountCents: -401,
          status: 'received',
          bookingId: 'settled-debit',
          ...known,
        },
      ])
      .run();
    sqlite.pragma('query_only = ON');

    const report = forecastBacktest(db, '2026-03-12', 1);
    expect(report.incompleteAccounts).toBe(1);
    expect(report.rows).toMatchObject([
      {
        accountId: 'late',
        end: { predictedCents: 1501, actualCents: 1000, errorCents: -501, cause: 'late_income' },
      },
      {
        accountId: 'offset',
        low: { predictedCents: 200, actualCents: 1000, errorCents: 800, cause: 'missing_schedule' },
      },
      {
        accountId: 'settled',
        end: { predictedCents: 1000, actualCents: 1000, errorCents: 0, cause: null },
      },
    ]);
  } finally {
    close();
  }
});
