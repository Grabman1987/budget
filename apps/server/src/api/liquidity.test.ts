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
import { sql } from 'drizzle-orm';
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
  it('shares paused income and lever dates while excluding the variable household plan', async () => {
    await seedBudget();
    const category = await call('POST', '/categories', {
      name: 'Synthetic variable category',
      groupId: 'g',
      class: 'need',
      kind: 'variable',
      stage: 2,
    });
    expect(category.status).toBe(201);
    expect(
      (
        await call('PUT', `/categories/${category.body.category.id}/target`, {
          validFrom: '2026-03',
          target: { kind: 'monthly', amountCents: 30_000 },
        })
      ).status,
    ).toBe(200);
    const salary = (await call('GET', '/expected')).body.payments.find(
      (p: any) => p.kind === 'inflow',
    );
    expect(
      (
        await call('POST', '/liquidity/income-pauses', {
          sourceId: salary.id,
          startDate: '2026-03-31',
          endDate: '2026-03-31',
        })
      ).status,
    ).toBe(201);
    const preview = (
      await call(
        'GET',
        '/accounts/giro/series?from=2026-03-01&to=2026-03-18&horizon=6m&levers=pause-future',
      )
    ).body;
    expect(preview.previewPoints.find((p: any) => p.date === '2026-03-31').balanceCents).toBe(
      200_000,
    );
    expect(preview.previewPoints.find((p: any) => p.date === '2026-04-10').balanceCents).toBe(
      108_500,
    );
    expect(preview.previewCoverage).toMatchObject({
      partial: true,
      variableMonthlyCents: 30_000,
      endDay: '2026-09-18',
    });
    expect(
      (await call('GET', '/accounts/tg/series?from=2026-03-01&to=2026-03-18&horizon=6m')).status,
    ).toBe(422);
  });
  it('projects one account through the household horizon, discloses exclusions and dates transfers', async () => {
    await seedBudget();
    await call('POST', '/accounts', {
      name: 'Second synthetic cash account',
      type: 'checking',
      openingDate: '2026-01-01',
      openingBalanceCents: 100_000,
    });
    const second = (await call('GET', '/accounts')).body.accounts.find(
      (a: any) => a.name === 'Second synthetic cash account',
    ).id;
    await call('POST', '/liquidity/events', {
      name: 'Assigned expense',
      date: '2026-03-20',
      amountCents: -10_001,
      accountId: 'giro',
    });
    await call('POST', '/liquidity/events', {
      name: 'Unassigned expense',
      date: '2026-03-21',
      amountCents: -20_002,
    });
    await call('POST', '/bookings', {
      type: 'transfer',
      fromAccountId: 'giro',
      toAccountId: second,
      date: '2026-03-22',
      amountCents: 30_003,
    });
    const range = 'from=2026-03-01&to=2026-03-18&horizon=90d';
    const first = await call('GET', `/accounts/giro/series?${range}`);
    expect(first.status).toBe(200);
    expect(first.body.previewPoints?.at(-1).date).toBe('2026-06-16');
    expect(first.body.previewPoints.find((p: any) => p.date === '2026-03-20').balanceCents).toBe(
      189_999,
    );
    expect(first.body.previewPoints.find((p: any) => p.date === '2026-03-22').balanceCents).toBe(
      159_996,
    );
    expect(first.body.previewCoverage).toMatchObject({ unassignedEventCount: 1, partial: true });
    const other = (await call('GET', `/accounts/${second}/series?${range}`)).body;
    expect(other.previewPoints.find((p: any) => p.date === '2026-03-22').balanceCents).toBe(
      130_003,
    );
    const household = (await call('GET', '/liquidity?horizon=90d')).body.report;
    expect(household.points.find((p: any) => p.day === '2026-03-22').balanceCents).toBe(269_997);
    expect(
      (
        await call('GET', `/accounts/giro/series?from=2026-03-01&to=2026-03-18&horizon=12m`)
      ).body.previewPoints.at(-1).date,
    ).toBe('2027-03-18');
    expect(
      (await call('GET', '/accounts/giro/series?from=2026-03-01&to=2026-03-18&horizon=bogus'))
        .status,
    ).toBe(400);
  });

  it('year plans and the liquidity report share recurring dates, category and audited undo/redo', async () => {
    await seedBudget();
    const budgetBefore = (await call('GET', '/budget/2026-12')).body;
    const created = await call('POST', '/liquidity/events', {
      name: 'Versicherung jährlich',
      date: '2025-04-30',
      amountCents: -12_345,
      categoryId: 'miete',
      accountId: 'giro',
      recurrence: 'yearly',
      recurrenceUntil: '2027-04-30',
    });
    expect(created.status).toBe(201);
    const id = created.body.event.id;
    expect((await call('GET', '/liquidity/events')).body.events).toMatchObject([
      {
        id,
        categoryId: 'miete',
        categoryName: 'Miete',
        recurrence: 'yearly',
        status: 'in_horizon',
      },
    ]);
    expect((await call('GET', '/liquidity')).body.report.eventMarks).toEqual([
      { day: '2026-04-30', label: 'Versicherung jährlich', cents: -12_345 },
    ]);
    const updated = await call('PATCH', `/liquidity/events/${id}`, {
      name: '13./14. Gehalt',
      amountCents: 20_001,
      recurrence: 'months',
      recurrenceMonths: [6, 11],
    });
    expect(updated.status).toBe(200);
    expect((await call('GET', '/liquidity?horizon=12m')).body.report.eventMarks).toEqual([
      { day: '2026-06-30', label: '13./14. Gehalt', cents: 20_001 },
      { day: '2026-11-30', label: '13./14. Gehalt', cents: 20_001 },
    ]);
    const undone = await call('POST', '/undo', { groupId: updated.body.groupId });
    expect(undone.status).toBe(200);
    expect((await call('GET', '/liquidity/events')).body.events[0].recurrence).toBe('yearly');
    expect((await call('POST', '/undo', { groupId: undone.body.groupId })).status).toBe(200);
    const off = await call('PATCH', `/liquidity/events/${id}`, { enabled: false });
    expect((await call('GET', '/liquidity')).body.report.eventMarks).toEqual([]);
    expect((await call('POST', '/undo', { groupId: off.body.groupId })).status).toBe(200);
    const removed = await call('DELETE', `/liquidity/events/${id}`);
    expect((await call('GET', '/liquidity/events')).body.events).toEqual([]);
    const restored = await call('POST', '/undo', { groupId: removed.body.groupId });
    expect((await call('GET', '/liquidity/events')).body.events[0].recurrenceMonths).toEqual([
      6, 11,
    ]);
    expect((await call('POST', '/undo', { groupId: restored.body.groupId })).status).toBe(200);
    expect((await call('GET', '/liquidity/events')).body.events).toEqual([]);
    expect((await call('GET', '/budget/2026-12')).body).toEqual(budgetBefore);
    expect(db.select().from(schema.booking).all()).toEqual([]);
  });

  it('rejects inconsistent merged recurrence rules and leaves rows and audit untouched on failure', async () => {
    await seedBudget();
    const base = { name: 'Urlaub', date: '2026-07-31', amountCents: -10_001 };
    for (const extra of [
      { recurrence: 'weekly' },
      { recurrence: 'months', recurrenceMonths: [] },
      { recurrence: 'months', recurrenceMonths: [1, 1] },
      { recurrence: 'months', recurrenceMonths: [13] },
      { recurrenceUntil: '2026-06-01' },
      { categoryId: 'missing' },
      { recurrence: 'yearly', recurrenceMonths: [2] },
    ])
      expect(
        (await call('POST', '/liquidity/events', { ...base, ...extra })).status,
      ).toBeGreaterThanOrEqual(400);
    const created = await call('POST', '/liquidity/events', {
      ...base,
      recurrence: 'months',
      recurrenceMonths: [7],
      recurrenceUntil: '2026-12-31',
    });
    const auditBefore = db.select().from(schema.auditLog).all();
    const rowsBefore = db.select().from(schema.plannedEvent).all();
    expect(
      (await call('PATCH', `/liquidity/events/${created.body.event.id}`, { recurrence: 'monthly' }))
        .status,
    ).toBe(422);
    expect(
      (await call('PATCH', `/liquidity/events/${created.body.event.id}`, { date: '2027-01-01' }))
        .status,
    ).toBe(422);
    expect(db.select().from(schema.auditLog).all()).toEqual(auditBefore);
    expect(db.select().from(schema.plannedEvent).all()).toEqual(rowsBefore);
    db.run(
      sql`CREATE TRIGGER fail_event_audit BEFORE INSERT ON audit_log WHEN NEW.entity_type = 'planned_event' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END`,
    );
    expect(
      (await call('PATCH', `/liquidity/events/${created.body.event.id}`, { amountCents: -20_000 }))
        .status,
    ).toBe(422);
    expect(db.select().from(schema.plannedEvent).all()).toEqual(rowsBefore);
    expect(db.select().from(schema.auditLog).all()).toEqual(auditBefore);
  });

  it('retains legacy once defaults and reads calendar plans without valuing investments', async () => {
    await seedBudget();
    createEntity(
      db,
      schema.plannedEvent,
      { id: 'legacy', name: 'Anschaffung', date: '2026-04-01', amountCents: -1_001 },
      { actor: 'tester' },
    );
    expect((await call('GET', '/liquidity/events')).body.events[0]).toMatchObject({
      recurrence: 'once',
      recurrenceMonths: [],
      recurrenceUntil: null,
      categoryId: null,
    });
  });

  it('requires a session for calendar reads and mutations and applies the origin gate', async () => {
    const denied = createApp({
      webDir,
      ledger: { db, today: () => TODAY },
      auth: {
        ...signedIn,
        requireSession: async (c) => c.json({ error: 'unauthorized' }, 401),
      },
    });
    expect((await denied.request('/api/liquidity/events')).status).toBe(401);
    expect((await denied.request('/api/liquidity/events', { method: 'POST' })).status).toBe(401);
    const wrongOrigin = createApp({
      webDir,
      ledger: { db, today: () => TODAY },
      auth: {
        ...signedIn,
        originGuard: async (c) => c.json({ error: 'forbidden' }, 403),
      },
    });
    expect((await wrongOrigin.request('/api/liquidity/events', { method: 'POST' })).status).toBe(
      403,
    );
  });

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
