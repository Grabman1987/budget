/* eslint-disable @typescript-eslint/no-explicit-any -- inspect JSON API contracts */
import { categories, createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createApp, type AuthGate } from '../app';

let opened: OpenedDatabase;
let app: ReturnType<typeof createApp>;
let authenticated: boolean;
let today: string;
const origin = 'https://budget.example';
const auth: AuthGate = {
  routes: new Hono(),
  originGuard: async (c, next) =>
    c.req.method === 'GET' || c.req.header('origin') === origin
      ? next()
      : c.json({ error: 'origin_rejected' }, 403),
  requireSession: async (c, next) =>
    authenticated ? next() : c.json({ error: 'unauthorized' }, 401),
  requireStepUp: async (_c, next) => next(),
};
beforeEach(() => {
  authenticated = true;
  today = '2027-02-01';
  opened = createTestDatabase();
  seedBasics(opened.db);
  categories.create(
    opened.db,
    { id: 'salary', name: 'Gehalt', kind: 'income', class: null, groupId: 'g' },
    { actor: 'tester' },
  );
  app = createApp({
    webDir: 'test-results/no-web',
    auth,
    ledger: { db: opened.db, today: () => today, bankSync: null },
  });
});
afterEach(() => opened.close());
async function call(method: string, path: string, body?: unknown, requestOrigin = origin) {
  const res = await app.request('/api' + path, {
    method,
    headers: { origin: requestOrigin, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const salary = (over: Record<string, unknown> = {}) =>
  call('POST', '/bookings', {
    type: 'booking',
    accountId: 'giro',
    date: '2026-12-31',
    amountCents: 200001,
    payeeId: 'p1',
    splits: [{ categoryId: 'salary', incomeTypeId: 'income-salary', amountCents: 200001 }],
    ...over,
  });
const summary = async (month: string) => (await call('GET', '/budget/' + month)).body.summary;
const nextRule = { scope: 'incomeType', targetId: 'income-salary', nextMonth: true };

describe('owner income budget month', () => {
  it('keeps booking-date household income separate from next-month budget income and expected income', async () => {
    today = '2026-09-30';
    const result = await salary({
      date: '2026-09-30',
      amountCents: 100_000,
      incomeNextMonth: true,
      splits: [{ categoryId: 'salary', incomeTypeId: 'income-salary', amountCents: 100_000 }],
    });
    expect(result.status).toBe(201);
    expect(result.body.bookings[0]).toMatchObject({
      date: '2026-09-30',
      incomeNextMonth: true,
      amountCents: 100_000,
    });
    const expected = await call('POST', '/expected', {
      name: 'Expected October income',
      kind: 'inflow',
      accountId: 'giro',
      payeeId: 'p1',
      incomeTypeId: 'income-salary',
      rhythm: 'monthly',
      validFrom: '2026-10-01',
      dueDay: 15,
      dateShift: 'none',
      amountCents: 30_000,
    });
    expect(expected.status).toBe(201);

    today = '2026-09-30';
    expect((await call('GET', '/heute?month=2026-09')).body.monthResult.earnedCents).toBe(100_000);
    today = '2026-10-01';
    expect((await call('GET', '/heute?month=2026-10')).body.monthResult.earnedCents).toBe(0);
    expect((await summary('2026-10')).incomeCents).toBe(100_000);
    expect(await call('GET', '/expected/income?month=2026-10')).toMatchObject({
      status: 200,
      body: { month: '2026-10', expectedCents: 30_000, receivedCents: 0 },
    });
  });

  it('retains date and salary label, makes cash available immediately, and budgets it in January', async () => {
    const result = await salary({ incomeNextMonth: true });
    expect(result.status).toBe(201);
    expect(result.body.bookings[0]).toMatchObject({
      date: '2026-12-31',
      incomeNextMonth: true,
      splits: [{ categoryId: 'salary', incomeTypeId: 'income-salary' }],
    });
    const account = (await call('GET', '/accounts?asOf=2026-12-31')).body.accounts.find(
      (a: any) => a.id === 'giro',
    );
    expect(account.balanceCents).toBe(300001);
    expect(await summary('2026-12')).toMatchObject({ incomeCents: 0, toBeAssignedCents: 100000 });
    expect(await summary('2027-01')).toMatchObject({
      incomeCents: 200001,
      toBeAssignedCents: 300001,
    });
    const cashflow = (await call('GET', '/cashflow?period=Alles')).body.months;
    expect(cashflow.find((m: any) => m.month === '2026-12').incomeCents).toBe(200001);
    expect(cashflow.find((m: any) => m.month === '2027-01').incomeCents).toBe(0);
    const tables = (await call('GET', '/report-tables/months')).body.months;
    expect(tables.find((m: any) => m.month === '2026-12').income['income-salary']).toBe(200001);
    const adherence = (await call('GET', '/reports/spending/adherence?month=2027-01')).body;
    expect(adherence.allocation.find((m: any) => m.month === '2026-12').incomeCents).toBe(0);
    expect(adherence.allocation.find((m: any) => m.month === '2027-01').incomeCents).toBe(200001);
  });
  it('keeps defaults stored but new captures use the booking month unless explicitly overridden', async () => {
    const original = await salary();
    const rule = await call('PUT', '/income-month-rules', { rules: [nextRule] });
    expect(rule.status).toBe(200);
    expect((await call('GET', '/bookings/' + original.body.id)).body.booking.incomeNextMonth).toBe(
      false,
    );
    expect((await salary()).body.bookings[0].incomeNextMonth).toBe(false);
    expect((await salary({ incomeNextMonth: false })).body.bookings[0].incomeNextMonth).toBe(false);
    await call('PUT', '/income-month-rules', {
      rules: [nextRule, { scope: 'payee', targetId: 'p1', nextMonth: false }],
    });
    expect((await salary()).body.bookings[0].incomeNextMonth).toBe(false);
    await call('PUT', '/income-month-rules', {
      rules: [{ scope: 'category', targetId: 'salary', nextMonth: true }],
    });
    expect((await salary()).body.bookings[0].incomeNextMonth).toBe(false);
  });
  it('undoes and redoes date/month changes and rules without changing cash or income labels', async () => {
    const result = await salary({ incomeNextMonth: true });
    const changed = await call('PATCH', '/bookings/' + result.body.id, { incomeNextMonth: false });
    expect(changed.status).toBe(200);
    expect(await summary('2026-12')).toMatchObject({
      incomeCents: 200001,
      toBeAssignedCents: 300001,
    });
    const undone = await call('POST', '/undo', { groupId: changed.body.groupId });
    expect(await summary('2026-12')).toMatchObject({ incomeCents: 0, toBeAssignedCents: 100000 });
    await call('POST', '/undo', { groupId: undone.body.groupId });
    expect(await summary('2026-12')).toMatchObject({ incomeCents: 200001 });
    const moved = await call('PATCH', '/bookings/' + result.body.id, {
      date: '2027-01-31',
      incomeNextMonth: true,
    });
    expect(moved.status).toBe(200);
    expect(await summary('2027-01')).toMatchObject({ incomeCents: 0, toBeAssignedCents: 100000 });
    expect(await summary('2027-02')).toMatchObject({
      incomeCents: 200001,
      toBeAssignedCents: 300001,
    });
    const rule = await call('PUT', '/income-month-rules', { rules: [nextRule] });
    const undoRule = await call('POST', '/undo', { groupId: rule.body.groupId });
    expect((await call('GET', '/income-month-rules')).body.rules).toEqual([]);
    await call('POST', '/undo', { groupId: undoRule.body.groupId });
    expect((await call('GET', '/income-month-rules')).body.rules).toEqual([nextRule]);
  });
  it('rejects spending, contact repayments, transfers, mixed splits and invalid rules atomically', async () => {
    const before = opened.db.select().from(schema.auditLog).all().length;
    const bad = [
      { amountCents: -1, splits: [{ categoryId: 'essen', amountCents: -1 }] },
      { splits: [{ categoryId: 'essen', amountCents: 200001 }] },
      { splits: [{ contactId: 'k1', categoryId: 'auslagen', amountCents: 200001 }] },
      { splits: [{ transferAccountId: 'spar', amountCents: 200001 }] },
      { splits: [{ amountCents: 200002 }, { categoryId: 'essen', amountCents: -1 }] },
    ];
    for (const over of bad)
      expect((await salary({ ...over, incomeNextMonth: true })).status).toBe(422);
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(0);
    expect(opened.db.select().from(schema.auditLog).all()).toHaveLength(before);
    for (const rules of [
      [{ scope: 'category', targetId: 'essen', nextMonth: true }],
      [{ scope: 'payee', targetId: 'missing', nextMonth: true }],
      [nextRule, nextRule],
    ])
      expect((await call('PUT', '/income-month-rules', { rules })).status).toBe(422);
    expect((await call('GET', '/income-month-rules')).body.rules).toEqual([]);
  });
  it('keeps session, origin and bounded JSON validation at the server boundary', async () => {
    authenticated = false;
    expect((await call('GET', '/income-month-rules')).status).toBe(401);
    authenticated = true;
    expect(
      (await call('PUT', '/income-month-rules', { rules: [] }, 'https://other.example')).status,
    ).toBe(403);
    expect((await call('PUT', '/income-month-rules', { rules: [], extra: true })).status).toBe(400);
    expect((await salary({ incomeNextMonth: 'true' })).status).toBe(400);
  });
});
