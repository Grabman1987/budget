import { accounts, createTestDatabase, INCOME_TYPES, type LiquidityReportView } from '@budget/db';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-09-17';
const ACCOUNT = '56800000-0000-4000-8000-000000000001';
// Authentication itself is covered by the existing API suite. These cases exercise real
// SQLite, HTTP query parsing, forecast loading and serialization; no forecast result is mocked.
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
let opened: ReturnType<typeof createTestDatabase>;
let directory: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'budget-35d-568-569-'));
  writeFileSync(join(directory, 'index.html'), '<!doctype html><title>Synthetic forecast</title>');
  opened = createTestDatabase();
  app = createApp({ webDir: directory, auth: signedIn, ledger: { db: opened.db, today: () => TODAY } });
});
afterEach(() => {
  opened.close();
  rmSync(directory, { recursive: true, force: true });
});

async function seed() {
  accounts.create(opened.db, { id: ACCOUNT, name: 'Synthetic budget', type: 'checking',
    role: 'budget', onBudget: true, currency: 'EUR', openingDate: TODAY,
    openingBalanceCents: 100_000 }, { actor: 'synthetic-568-569' });
  // Monthly schedule with identical start/end gives one real occurrence. There is no
  // invented "once" rhythm and no variable category target or historical spending.
  for (const [name, kind, date, dueDay, amountCents] of [
    ['Synthetic payment', 'outflow', '2026-09-27', 27, 12_500],
    ['Synthetic income', 'inflow', '2026-10-07', 7, 9_000],
  ] as const) {
    const response = await app.request('/api/expected', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, kind, accountId: ACCOUNT, rhythm: 'monthly', dueDay,
        startDate: date, endDate: date, validFrom: TODAY, dateShift: 'none', amountCents,
        ...(kind === 'inflow' ? { incomeTypeId: INCOME_TYPES.salary.id } : {}) }),
    });
    expect(response.status, await response.text()).toBe(201);
  }
}

async function readOnly(path: string, expectedStatus = 200) {
  const bytes = opened.sqlite.serialize();
  const changes = opened.sqlite.prepare('SELECT total_changes() AS n').get();
  const response = await app.request(path);
  expect(response.status).toBe(expectedStatus);
  const body: unknown = await response.json();
  expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
  expect(opened.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(changes);
  expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
  return body;
}

async function forecast(query: string) {
  return await readOnly(`/api/liquidity${query}`) as LiquidityReportView;
}

describe('GET /liquidity 35d (#568/#569)', () => {
  it('returns the literal real-ledger day0..35 path and earliest minimum without writing', async () => {
    await seed();
    const view = await forecast('?horizon=35d&levers=');
    expect(view).toMatchObject({ asOf: TODAY, available: true,
      budgetAccounts: [{ id: ACCOUNT, name: 'Synthetic budget' }] });
    expect(view.report).not.toBeNull();
    const report = view.report!;
    expect(report).toMatchObject({ startDay: TODAY, startCents: 100_000,
      horizon: '35d', horizonDays: 35,
      low: { day: '2026-09-27', index: 10, cents: 87_500 },
      lowBuffer: { day: '2026-09-27', index: 10, cents: 87_500 },
      lowPlain: { day: '2026-09-27', index: 10, cents: 87_500 } });
    expect(report.points).toHaveLength(36);
    expect(report.points[0]).toEqual({ day: TODAY, balanceCents: 100_000,
      bufferCents: 100_000, plainCents: 100_000 });
    expect(report.points.slice(10, 20).map((point) => point.balanceCents)).toEqual(Array(10).fill(87_500));
    expect(report.points[20]).toMatchObject({ day: '2026-10-07', balanceCents: 96_500 });
    expect(report.points.at(-1)).toEqual({ day: '2026-10-22', balanceCents: 96_500,
      bufferCents: 96_500, plainCents: 96_500 });
    expect(report.months.every((month) => month.variableCents === 0)).toBe(true);
    expect(opened.sqlite.prepare('SELECT count(*) AS n FROM booking').get()).toEqual({ n: 0 });
  });

  it('preserves the default six months and all existing horizon endpoints without writes', async () => {
    await seed();
    const defaultView = await forecast('');
    const explicit = await forecast('?horizon=6m');
    expect(defaultView).toEqual(explicit);
    for (const [horizon, horizonDays, endDay] of [
      ['90d', 90, '2026-12-16'], ['6m', 181, '2027-03-17'], ['12m', 365, '2027-09-17'],
    ] as const) {
      const view = await forecast(`?horizon=${horizon}`);
      expect(view.report).toMatchObject({ horizon, horizonDays,
        low: { day: '2026-09-27', index: 10, cents: 87_500 } });
      expect(view.report!.points).toHaveLength(horizonDays + 1);
      expect(view.report!.points.at(-1)).toMatchObject({ day: endDay, balanceCents: 96_500 });
    }
  });

  it('returns unavailable rather than invented zero forecasts without a budget account', async () => {
    expect(await forecast('?horizon=35d')).toEqual({ asOf: TODAY, available: false,
      report: null, events: [], incomePauses: [], overdraftLimitCents: 0, budgetAccounts: [] });
  });

  it('rejects unsupported horizon values without changing any ledger bytes or write count', async () => {
    await seed();
    for (const query of ['horizon=34d', 'horizon=36d', 'horizon=', 'horizon=bogus'])
      await readOnly(`/api/liquidity?${query}`, 400);
  });

  it('keeps the existing unknown-lever filtering policy instead of inventing a new error', async () => {
    await seed();
    expect(await forecast('?horizon=35d&levers=unknown')).toEqual(await forecast('?horizon=35d&levers='));
  });
});
