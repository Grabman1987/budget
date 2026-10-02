/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import {
  accounts,
  categories,
  createEntity,
  createTestDatabase,
  INCOME_TYPES,
  schema,
  type Db,
} from '@budget/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-03-18';
const webDir = mkdtempSync(join(tmpdir(), 'budget-liquidity-'));
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

beforeEach(async () => {
  db = createTestDatabase().db;
  app = createApp({ webDir, auth: signedIn, ledger: { db, today: () => TODAY } });
});

async function seedBudget() {
  const ctx = { actor: 'tester' };
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
    ctx,
  );
  accounts.create(
    db,
    {
      id: 'tg',
      name: 'Tagesgeld',
      type: 'savings',
      role: 'reserve',
      onBudget: false,
      openingDate: '2026-01-01',
      openingBalanceCents: 500_000,
    },
    ctx,
  );
  createEntity(db, schema.categoryGroup, { id: 'g', name: 'Fixkosten' }, ctx);
  categories.create(db, { id: 'miete', name: 'Miete', groupId: 'g', class: 'need' }, ctx);
  categories.create(db, { id: 'abo', name: 'Streaming', groupId: 'g', class: 'want' }, ctx);
  categories.create(db, { id: 'etf', name: 'ETF', groupId: 'g', class: 'future' }, ctx);
  const base = { accountId: 'giro', rhythm: 'monthly', validFrom: '2026-01-01' };
  await call('POST', '/expected', {
    ...base,
    name: 'Gehalt',
    kind: 'inflow',
    incomeTypeId: INCOME_TYPES.salary.id,
    dueDay: 31,
    amountCents: 300_000,
  });
  for (const [name, categoryId, dueDay, amountCents] of [
    ['Miete', 'miete', 5, 90_000],
    ['Streaming', 'abo', 8, 1_500],
    ['ETF-Sparplan', 'etf', 10, 20_000],
  ] as const)
    await call('POST', '/expected', {
      ...base,
      name,
      kind: 'outflow',
      categoryId,
      dueDay,
      amountCents,
    });
}

describe('GET /liquidity', () => {
  it('without a budget account there is nothing to forecast', async () => {
    const r = await call('GET', '/liquidity');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ available: false, report: null, events: [] });
  });

  it('forecasts the budget accounts from the expected payments, the reserve stays out', async () => {
    await seedBudget();
    const r = await call('GET', '/liquidity?horizon=90d');
    expect(r.status).toBe(200);
    const { report } = r.body;
    expect(report.startCents).toBe(200_000);
    expect(report.horizonDays).toBe(90);
    expect(report.points).toHaveLength(91);
    expect(report.points[0]).toMatchObject({
      day: TODAY,
      balanceCents: 200_000,
      bufferCents: 200_000,
      plainCents: 200_000,
    });
    expect(report.verdictDays).toBe(184);
    expect(report.months.length).toBeGreaterThanOrEqual(6);
    const salaryMonth = report.months.find((m: any) => m.month === '2026-04');
    expect(salaryMonth.incomeCents).toBe(300_000);
    expect(salaryMonth.fixedCents).toBe(-111_500);
    expect(report.levers.map((l: any) => [l.id, l.available])).toEqual([
      ['pause-future', true],
      ['cancel-want', true],
      ['trim-variable', false],
    ]);
  });

  it('planned events are stored, enter the forecast and can be undone', async () => {
    await seedBudget();
    const before = (await call('GET', '/liquidity')).body.report;
    const created = await call('POST', '/liquidity/events', {
      name: '  Neue   Waschmaschine ',
      date: '2026-03-25',
      amountCents: -300_000,
    });
    expect(created.status).toBe(201);
    expect(created.body.event).toMatchObject({
      name: 'Neue Waschmaschine',
      date: '2026-03-25',
      amountCents: -300_000,
      accountId: null,
      enabled: true,
    });
    expect(db.select().from(schema.plannedEvent).all()).toHaveLength(1);

    const after = await call('GET', '/liquidity');
    expect(after.body.events).toMatchObject([
      { name: 'Neue Waschmaschine', status: 'in_horizon', accountName: null },
    ]);
    expect(after.body.report.eventMarks).toEqual([
      { day: '2026-03-25', label: 'Neue Waschmaschine', cents: -300_000 },
    ]);
    expect(after.body.report.low.cents).toBeLessThan(before.low.cents);
    expect(after.body.report.lowPlain).toEqual(before.low);
    const may = after.body.report.movements.find((m: any) => m.month === '2026-03');
    expect(may.rows.find((x: any) => x.planned)).toMatchObject({ cents: -300_000 });

    const patched = await call('PATCH', `/liquidity/events/${created.body.event.id}`, {
      amountCents: 40_000,
      name: 'Bonus',
    });
    expect(patched.body.event).toMatchObject({ name: 'Bonus', amountCents: 40_000 });

    const removed = await call('DELETE', `/liquidity/events/${created.body.event.id}`);
    expect(removed.status).toBe(200);
    expect((await call('GET', '/liquidity')).body.events).toEqual([]);
    const undone = await call('POST', '/undo', { groupId: removed.body.groupId });
    expect(undone.status).toBe(200);
    expect((await call('GET', '/liquidity')).body.events).toHaveLength(1);
  });

  it('marks events that cannot count: past, later than the horizon, disabled, off budget', async () => {
    await seedBudget();
    const add = (name: string, date: string, extra: object = {}) =>
      call('POST', '/liquidity/events', { name, date, amountCents: -1_000, ...extra });
    await add('Vergangen', '2026-03-01');
    await add('Später', '2027-02-01');
    await add('Aus', '2026-04-01', { enabled: false });
    const r = await call('GET', '/liquidity?horizon=90d');
    const status = Object.fromEntries(r.body.events.map((e: any) => [e.name, e.status]));
    expect(status).toEqual({ Vergangen: 'past', Später: 'later', Aus: 'disabled' });
    expect(r.body.report.eventMarks).toEqual([]);
    // an event on a reserve account is refused: it would not move the budget accounts
    const refused = await add('Falsches Konto', '2026-04-01', { accountId: 'tg' });
    expect(refused.status).toBe(422);
  });

  it('levers raise the lowest balance and are echoed back', async () => {
    await seedBudget();
    const off = (await call('GET', '/liquidity')).body.report;
    const on = (await call('GET', '/liquidity?levers=pause-future,cancel-want,nonsense')).body
      .report;
    expect(on.levers.filter((l: any) => l.active).map((l: any) => l.id)).toEqual([
      'pause-future',
      'cancel-want',
    ]);
    const lowOf = (r: any) => Math.min(...r.points.map((p: any) => p.balanceCents));
    expect(lowOf(on)).toBeGreaterThanOrEqual(lowOf(off));
    expect(off.levers.find((l: any) => l.id === 'pause-future').gainCents).toBeGreaterThanOrEqual(
      0,
    );
  });

  it('rejects invalid input', async () => {
    await seedBudget();
    expect((await call('GET', '/liquidity?horizon=5y')).status).toBe(400);
    expect(
      (await call('POST', '/liquidity/events', { name: '', date: '2026-05-01', amountCents: 1 }))
        .status,
    ).toBe(400);
    expect(
      (await call('POST', '/liquidity/events', { name: 'x', date: '2026-05-01', amountCents: 0 }))
        .status,
    ).toBe(400);
    expect(
      (await call('POST', '/liquidity/events', { name: 'x', date: '2026-02-31', amountCents: 5 }))
        .status,
    ).toBe(400);
    expect((await call('DELETE', '/liquidity/events/nope')).status).toBe(404);
  });
});
