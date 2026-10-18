import { createBooking, createTestDatabase, INCOME_TYPES, type CashflowReport } from '@budget/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { cashflowRoutes } from './cashflow-report';

let opened: ReturnType<typeof createTestDatabase>;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  const ctx = { actor: 'test' };
  for (const [date, amountCents] of [
    ['2026-12-31', 70_000],
    ['2027-01-01', 10_000],
    ['2027-01-15', 20_000],
    ['2027-01-16', 90_000],
  ] as const) {
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date,
        amountCents,
        splits: [{ amountCents, incomeTypeId: INCOME_TYPES.salary.id }],
      },
      ctx,
    );
  }
  for (const [date, amountCents] of [
    ['2027-01-01', -500],
    ['2027-01-15', -1_000],
    ['2027-01-16', -9_000],
  ] as const) {
    createBooking(
      opened.db,
      { accountId: 'giro', date, amountCents, splits: [{ amountCents, categoryId: 'essen' }] },
      ctx,
    );
  }
  for (const [date, amountCents] of [
    ['2027-01-15', 100],
    ['2027-01-16', 500],
  ] as const) {
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date,
        amountCents,
        splits: [{ amountCents, incomeTypeId: INCOME_TYPES.capital.id }],
      },
      ctx,
    );
  }
});
afterEach(() => opened.close());

async function report(today: string, period = 'YTD') {
  const response = await cashflowRoutes(opened.db, () => today).request(`/?period=${period}`);
  expect(response.status).toBe(200);
  return (await response.json()) as CashflowReport;
}

describe('cashflow YTD at the year boundary', () => {
  it('includes January 1 through today, excluding December and future bookings', async () => {
    const data = await report('2027-01-15');
    expect(data.period).toBe('YTD');
    expect(data.asOf).toBe('2027-01-15');
    expect(data.windowMonths).toEqual(['2027-01']);
    expect(data.months.map((m) => m.month)).toEqual(['2027-01']);
    expect(data.totals).toMatchObject({
      months: 1,
      incomeCents: 30_000,
      consumptionCents: 1_500,
      netCents: 28_500,
      capitalCents: 100,
    });
  });

  it('includes the current January on the first day of the year', async () => {
    const data = await report('2027-01-01');
    expect(data.windowMonths).toEqual(['2027-01']);
    expect(data.totals).toMatchObject({ incomeCents: 10_000, consumptionCents: 500 });
  });

  it.each(['2027-01-15', '2027-09-17'])(
    'keeps all twelve months of the previous full year reachable on %s',
    async (today) => {
      const data = await report(today, '2026-01..2026-12');
      expect(data.windowMonths).toEqual([
        '2026-01',
        '2026-02',
        '2026-03',
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
        '2026-10',
        '2026-11',
        '2026-12',
      ]);
      expect(data.totals).toMatchObject({ months: 12, incomeCents: 70_000 });
    },
  );

  it('preserves the completed-month window later in the year', async () => {
    const data = await report('2027-09-17');
    expect(data.windowMonths).toEqual([
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
      '2027-05',
      '2027-06',
      '2027-07',
      '2027-08',
    ]);
    expect(data.totals).toMatchObject({ months: 8, incomeCents: 120_000 });
  });

  it('keeps the last-full-month preset unchanged in January', async () => {
    const data = await report('2027-01-15', '1M');
    expect(data.windowMonths).toEqual(['2026-12']);
    expect(data.totals.incomeCents).toBe(70_000);
  });
});
