import {
  accounts,
  createBooking,
  createTestDatabase,
  type OpenedDatabase,
  type NetWorthHistory,
  type ReportTables,
} from '@budget/db';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AuthGate } from '../app';

const webDir = mkdtempSync(join(tmpdir(), 'budget-report-ranges-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
let opened: OpenedDatabase;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  opened = createTestDatabase();
  accounts.create(
    opened.db,
    {
      id: 'cash',
      name: 'Giro',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-06-01',
      openingBalanceCents: 100_000,
    },
    { actor: 'test' },
  );
  for (const [date, amount] of [
    ['2026-07-03', 10_000],
    ['2026-08-03', 20_000],
    ['2026-09-03', 30_000],
    ['2026-09-30', 50_000],
  ] as const) {
    createBooking(
      opened.db,
      {
        accountId: 'cash',
        date,
        amountCents: amount,
        splits: [{ categoryId: null, amountCents: amount, incomeTypeId: 'income-salary' }],
      },
      { actor: 'test' },
    );
  }
  app = createApp({ webDir, auth: signedIn, ledger: { db: opened.db, today: () => '2026-09-17' } });
});
afterEach(() => opened.sqlite.close());
describe('report ranges at the API boundary', () => {
  it('historical daily history ends in the selected month, with a conserved chain', async () => {
    const response = await app.request('/api/networth-history?period=2026-07..2026-07');
    expect(response.status).toBe(200);
    const body = (await response.json()) as NetWorthHistory;
    expect(body).toMatchObject({
      from: '2026-06-30',
      to: '2026-07-31',
      chain: { startCents: 100_000, ownCents: 10_000, marketCents: 0, nowCents: 110_000 },
    });
    expect(body.daily.at(-1)).toEqual({ date: '2026-07-31', netWorthCents: 110_000 });
    const wealth = (await (
      await app.request('/api/wealth/networth?period=2026-07..2026-07')
    ).json()) as { chain: NetWorthHistory['chain']; to: string };
    expect(wealth.chain).toEqual(body.chain);
    expect(wealth.to).toBe('2026-07-31');
  });
  it('current-month cashflow and tables exclude later booked dates', async () => {
    const response = await app.request('/api/cashflow?period=2026-09..2026-09');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      windowMonths: ['2026-09'],
      totals: { incomeCents: 30_000, netCents: 30_000 },
    });
    const tables = (await (await app.request('/api/report-tables/months')).json()) as ReportTables;
    expect(tables.months.at(-1)!.income['income-salary']).toBe(30_000);
  });
  it('rejects malformed, reversed and oversized periods consistently', async () => {
    for (const endpoint of [
      'cashflow',
      'networth-history',
      'wealth/networth',
      'portfolio',
      'reports/payees',
      'reports/spending/analysis',
    ]) {
      for (const period of [
        '2026-13..2026-14',
        '2026-09..2026-03',
        '1900-01..9999-12',
        '2026-10..2026-11',
      ]) {
        expect((await app.request(`/api/${endpoint}?period=${period}`)).status, endpoint).toBe(400);
      }
    }
  });
});
