/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect JSON boundary answers. */
import {
  accounts,
  categories,
  createBooking,
  createTestDatabase,
  createTransfer,
  INCOME_TYPES,
  type OpenedDatabase,
} from '@budget/db';
import type { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLedgerApi } from './index';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';

const ctx = { actor: 'test' };
let opened: OpenedDatabase;
let app: Hono;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  accounts.create(
    opened.db,
    {
      id: 'depot',
      name: 'Depot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingDate: '2023-10-01',
    },
    ctx,
  );
  categories.create(opened.db, { id: 'etf', name: 'ETF', groupId: 'g', class: 'future' }, ctx);
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-09-17',
    stepUp: async (_c, next) => next(),
  });
});
afterEach(() => opened.close());

async function get(path: string) {
  const response = await app.request(path);
  return { status: response.status, body: (await response.json()) as any };
}
const inflow = (
  date: string,
  amountCents: number,
  split: Record<string, unknown> = {},
  accountId = 'giro',
) =>
  createBooking(
    opened.db,
    { accountId, date, amountCents, splits: [{ amountCents, ...split }] },
    ctx,
  );
const spend = (date: string, amountCents: number, categoryId: string) =>
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date,
      amountCents: -amountCents,
      splits: [{ categoryId, amountCents: -amountCents }],
    },
    ctx,
  );

function seedJune() {
  inflow('2026-06-30', 300_000, { incomeTypeId: INCOME_TYPES.salary.id });
  inflow('2026-06-05', 80_000, { incomeTypeId: INCOME_TYPES.contribution.id });
  // never income: a refund, a contact repayment (Auslagen), a transfer
  inflow('2026-06-06', 1_500, { incomeTypeId: INCOME_TYPES.refund.id });
  inflow('2026-06-07', 4_000, { categoryId: 'auslagen', contactId: 'k1' });
  createTransfer(
    opened.db,
    { fromAccountId: 'depot', toAccountId: 'giro', date: '2026-06-08', amountCents: 20_000 },
    ctx,
  );
  // Kapitalerträge: on the budget account and on the depot, separate from the income
  inflow('2026-06-10', 5_000, { incomeTypeId: INCOME_TYPES.capital.id });
  inflow('2026-06-12', 2_000, { incomeTypeId: INCOME_TYPES.capital.id }, 'depot');
  spend('2026-06-02', 90_000, 'miete');
  spend('2026-06-03', 20_000, 'reise');
  spend('2026-06-04', 50_000, 'etf');
  // the running month is not part of any window
  inflow('2026-09-01', 999_999, { incomeTypeId: INCOME_TYPES.salary.id });
}

describe('GET /cashflow', () => {
  it('household income, consumption and net cashflow; Kapitalerträge only on their own line', async () => {
    seedJune();
    const { status, body } = await get('/cashflow?period=1J');
    expect(status).toBe(200);
    const june = body.months.find((m: any) => m.month === '2026-06');
    expect(june).toMatchObject({
      incomeCents: 380_000,
      needCents: 90_000,
      wantCents: 20_000,
      futureCents: 50_000,
      consumptionCents: 110_000,
      netCents: 270_000,
      capitalCents: 7_000,
      inWindow: true,
    });
    expect(body.months.some((m: any) => m.month === '2026-09')).toBe(false);
    expect(body.months.at(-1).month).toBe('2026-08');
    expect(body.windowMonths).toHaveLength(12);
  });

  it('totals add up from the months of the window', async () => {
    seedJune();
    const { body } = await get('/cashflow?period=1J');
    const inWindow = body.months.filter((m: any) => m.inWindow);
    const sum = (k: string) => inWindow.reduce((a: number, m: any) => a + m[k], 0);
    expect(body.totals).toMatchObject({
      months: 12,
      incomeCents: sum('incomeCents'),
      netCents: sum('netCents'),
      capitalCents: sum('capitalCents'),
      futureCents: sum('futureCents'),
      positiveMonths: 1,
    });
    expect(body.totals.incomeCents - body.totals.consumptionCents).toBe(body.totals.netCents);
  });

  it('a short Zeitraum shows the last 12 months in the chart but totals only its own', async () => {
    seedJune();
    const { body } = await get('/cashflow?period=3M');
    expect(body.windowMonths).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(body.months).toHaveLength(12);
    expect(body.months.filter((m: any) => m.inWindow)).toHaveLength(3);
    expect(body.totals.months).toBe(3);
    expect(body.totals.netCents).toBe(270_000 - 0);
    expect(body.totals.capitalCents).toBe(7_000);
  });

  it('Alles starts at the first budget month; an empty ledger is an empty answer', async () => {
    const { body } = await get('/cashflow?period=Alles');
    expect(body.firstMonth).toBe('2023-10');
    expect(body.windowMonths[0]).toBe('2023-10');
    expect(body.windowMonths.at(-1)).toBe('2026-08');
    expect(body.totals.netCents).toBe(0);
    const fresh = createTestDatabase();
    try {
      const other = createLedgerApi({
        db: fresh.db,
        today: () => '2026-09-17',
        stepUp: async (_c, next) => next(),
      });
      const r = await (await other.request('/cashflow')).json();
      expect(r).toMatchObject({ firstMonth: null, months: [], windowMonths: [] });
    } finally {
      fresh.close();
    }
  });

  it('rejects an unknown period', async () => {
    expect((await get('/cashflow?period=7J')).status).toBe(400);
  });
});
