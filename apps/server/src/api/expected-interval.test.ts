/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import { accounts, createTestDatabase, INCOME_TYPES, type Db } from '@budget/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-03-18';
const webDir = mkdtempSync(join(tmpdir(), 'budget-expected-interval-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

let db: Db;
let app: ReturnType<typeof createApp>;

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as any };
}

const salary = {
  name: 'Gehalt alle 2 Wochen',
  kind: 'inflow',
  accountId: 'giro',
  incomeTypeId: INCOME_TYPES.salary.id,
  rhythm: 'weekly',
  intervalWeeks: 2,
  dueDay: 1,
  dateShift: 'before',
  startDate: '2026-03-20',
  validFrom: '2026-03-20',
  amountCents: 100_000,
};

beforeEach(() => {
  db = createTestDatabase().db;
  app = createApp({ webDir, auth: signedIn, ledger: { db, today: () => TODAY } });
  accounts.create(
    db,
    {
      id: 'giro',
      name: 'Giro',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 200_000,
    },
    { actor: 'tester' },
  );
});

describe('expected payments: every N weeks', () => {
  it('stores, returns, patches and clears the interval; the equivalents follow it', async () => {
    const created = await call('POST', '/expected', salary);
    expect(created.status).toBe(201);
    expect(created.body.payment.intervalWeeks).toBe(2);
    const id = created.body.payment.id;

    const listed = (await call('GET', '/expected')).body.payments[0];
    expect(listed).toMatchObject({
      intervalWeeks: 2,
      // 52 * 1000 € / 24 and 52 * 1000 € / 2
      monthlyEquivalentCents: 216_667,
      yearlyEquivalentCents: 2_600_000,
    });

    const three = await call('PATCH', `/expected/${id}`, { intervalWeeks: 3 });
    expect(three.body.payment.intervalWeeks).toBe(3);
    expect((await call('GET', '/expected')).body.payments[0]).toMatchObject({
      monthlyEquivalentCents: 144_444,
      yearlyEquivalentCents: 1_733_333,
    });

    const cleared = await call('PATCH', `/expected/${id}`, { intervalWeeks: null });
    expect(cleared.body.payment.intervalWeeks).toBeNull();
    expect((await call('GET', '/expected')).body.payments[0]).toMatchObject({
      monthlyEquivalentCents: 433_333,
      yearlyEquivalentCents: 5_200_000,
    });
  });

  it('refuses an interval outside 1 to 52 or not a whole number', async () => {
    for (const intervalWeeks of [0, 53, 1.5, '2'])
      expect((await call('POST', '/expected', { ...salary, intervalWeeks })).status).toBe(400);
    const id = (await call('POST', '/expected', salary)).body.payment.id;
    expect((await call('PATCH', `/expected/${id}`, { intervalWeeks: 0 })).status).toBe(400);
  });

  it('plans the occurrences every two weeks, with the business-day shift', async () => {
    await call('POST', '/expected', salary);
    const list = await call('GET', '/expected/occurrences?from=2026-03-01&to=2026-06-30');
    // 01.05.2026 (Friday, holiday) moves to Thursday 30.04.
    expect(list.body.occurrences.map((o: any) => o.dueDate)).toEqual([
      '2026-03-20',
      '2026-04-03',
      '2026-04-17',
      '2026-04-30',
      '2026-05-15',
      '2026-05-29',
      '2026-06-12',
      '2026-06-26',
    ]);
  });

  it('the liquidity forecast includes every second-week payment', async () => {
    await call('POST', '/expected', salary);
    const report = (await call('GET', '/liquidity?horizon=6m')).body.report;
    const income = (month: string) => report.months.find((m: any) => m.month === month).incomeCents;
    // April: 03.04., 17.04. and the shifted 30.04.; May: 15.05. and 29.05.
    expect(income('2026-04')).toBe(300_000);
    expect(income('2026-05')).toBe(200_000);
  });
});
