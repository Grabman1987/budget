import { balanceForecast, heuteWindow, nextPayday } from '@budget/domain';
/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import {
  accounts,
  categories,
  createBooking,
  createEntity,
  createTestDatabase,
  ensureDefaultRules,
  ruleInputs,
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
const webDir = mkdtempSync(join(tmpdir(), 'budget-heute-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

let db: Db;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = createTestDatabase().db;
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
  createEntity(db, schema.categoryGroup, { id: 'g', name: 'Fixkosten' }, ctx);
  categories.create(db, { id: 'miete', name: 'Miete', groupId: 'g', class: 'need' }, ctx);
  categories.create(db, { id: 'essen', name: 'Essen', groupId: 'g', class: 'need' }, ctx);
  createEntity(db, schema.payee, { id: 'p1', name: 'Vermieter' }, ctx);
  createBooking(
    db,
    {
      accountId: 'giro',
      date: '2026-03-05',
      amountCents: -12_000,
      payeeId: 'p1',
      splits: [{ categoryId: 'essen', amountCents: -12_000 }],
    },
    ctx,
  );
  ensureDefaultRules(db);
  app = createApp({ webDir, auth: signedIn, ledger: { db, today: () => TODAY } });
  await call('PUT', '/budget/2026-03/assigned', {
    items: [
      { categoryId: 'miete', assignedCents: 100_000 },
      { categoryId: 'essen', assignedCents: 30_000 },
    ],
  });
  const base = { accountId: 'giro', rhythm: 'monthly', validFrom: '2026-01-01' };
  await call('POST', '/expected', {
    ...base,
    name: 'Gehalt',
    kind: 'inflow',
    incomeTypeId: INCOME_TYPES.salary.id,
    dueDay: 31,
    dateShift: 'before',
    amountCents: 300_000,
  });
  await call('POST', '/expected', {
    ...base,
    name: 'Miete',
    kind: 'outflow',
    categoryId: 'miete',
    dueDay: 25,
    startDate: '2026-03-01',
    amountCents: 90_000,
  });
});

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as any };
}

describe('GET /heute', () => {
  it.each([
    ['month', '2026-10-05', '2026-09-21', '2026-11-02'],
    ['payday', '2026-10-05', '2026-09-21', '2026-10-17'],
    ['payday', '2026-10-14', '2026-09-30', '2026-11-15'],
  ] as const)('reads %s boundaries on %s end to end', async (period, today, from, to) => {
    const datedApp = createApp({ webDir, auth: signedIn, ledger: { db, today: () => today } });
    const res = await datedApp.request(`/api/heute?month=2026-10&period=${period}`);
    const result = (await res.json()) as any;
    expect(result.stand).toMatchObject({ from, to, period });
    expect(result.balance.actual[0].day).toBe(from);
    expect(result.balance.actual.at(-1).day).toBe(today);
    expect(result.balance.forecast.at(-1).day).toBe(to);
    expect(result.balance.low.cents).toBe(
      Math.min(
        ...[...result.balance.actual, ...result.balance.forecast].map((d: any) => d.balanceCents),
      ),
    );
  });
  it('keeps every section available while a never-quoted holding is valued at cost and flagged', async () => {
    const before = await call('GET', '/heute');
    db.insert(schema.account)
      .values({
        id: 'depot',
        name: 'Synthetic depot',
        type: 'brokerage',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-01-01',
      })
      .run();
    db.insert(schema.security)
      .values({ id: 'unpriced', name: 'Synthetic instrument', kind: 'stock', currency: 'EUR' })
      .run();
    db.insert(schema.holding)
      .values({
        id: 'held',
        accountId: 'depot',
        securityId: 'unpriced',
        asOf: '2026-01-01',
        unitsE8: 100_000_000,
        costBasisCents: 10000,
      })
      .run();
    let result = await call('GET', '/heute');
    expect(result.status).toBe(200);
    for (const section of [
      'stand',
      'lead',
      'balance',
      'pace',
      'pinned',
      'upcoming14',
      'lastBookings',
      'nextSteps',
    ])
      expect(result.body[section], section).toEqual(before.body[section]);
    expect(result.body.financeCheck.unavailable).toBeUndefined();
    expect(result.body.netWorth.unavailable).toBeUndefined();
    expect(result.body.incomplete).toEqual([
      expect.objectContaining({ securityId: 'unpriced', quality: 'estimated' }),
    ]);
    expect(
      (await call('PUT', `/securities/unpriced/prices/${TODAY}`, { price: '120' })).status,
    ).toBe(200);
    result = await call('GET', '/heute');
    expect(result.status).toBe(200);
    expect(result.body.financeCheck.counts.total).toBe(16);
    // The days before the first quote are estimates, flagged but not unavailable.
    expect(result.body.netWorth.unavailable).toBeUndefined();
    expect(result.body.incomplete).toEqual([
      expect.objectContaining({ securityId: 'unpriced', quality: 'estimated' }),
    ]);
    expect(result.body.balance).toEqual(before.body.balance);
    expect(result.body.lastBookings).toEqual(before.body.lastBookings);
  });
  it('answers every block of the home screen in one request', async () => {
    await call('PATCH', '/categories/essen', { pinned: true });
    const res = await call('GET', '/heute');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'attention',
        'balance',
        'financeCheck',
        'lastBookings',
        'lead',
        'netWorth',
        'nextSteps',
        'pace',
        'pinned',
        'stand',
        'upcoming14',
      ].sort(),
    );
    expect(res.body.stand).toMatchObject({
      today: TODAY,
      month: '2026-03',
      period: 'month',
      from: '2026-03-04',
      to: '2026-04-02',
      payday: { day: '2026-04-15', source: 'payday_rule', daysToPayday: 28 },
      budgetBalanceCents: 188_000,
    });
    // Miete (900 EUR, due the 25th) is the one bill open before the payday (15 April)
    expect(res.body.lead).toMatchObject({ openCents: 90_000, daysToPayday: 28 });
    expect(res.body.lead.freeCents).toBe(
      res.body.lead.needCents + res.body.lead.wantCents - 90_000,
    );
    expect(res.body.lead.items.open).toHaveLength(1);
    expect(res.body.balance.actual.at(-1)).toEqual({ day: TODAY, balanceCents: 188_000 });
    expect(res.body.balance.salary).toEqual({ day: '2026-03-31', cents: 300_000 });
    expect(res.body.balance.forecast[0]).toEqual({
      day: TODAY,
      balanceCents: 188_000,
      items: [],
      variableCents: 0,
    });
    expect(res.body.balance.low.cents).toBeLessThan(188_000);
    expect(res.body.pace.figures).toMatchObject({ spentCents: 12_000, limitCents: 130_000 });
    expect(res.body.pinned).toEqual([
      expect.objectContaining({
        id: 'essen',
        spentCents: 12_000,
        assignedCents: 30_000,
        availableCents: 18_000,
      }),
    ]);
    expect(res.body.upcoming14.map((o: any) => o.name)).toEqual(['Miete', 'Gehalt']);
    expect(res.body.financeCheck.counts.total).toBe(16);
    expect(res.body.financeCheck.keyRules.length).toBeGreaterThan(0); // the evaluable ones of the six
    expect(res.body.netWorth).toMatchObject({ totalCents: 188_000, liquidCents: 188_000 });
    expect(res.body.netWorth.series).toHaveLength(12);
    expect(res.body.lastBookings).toHaveLength(1);
    expect(res.body.nextSteps).toEqual({ items: [], count: 0 });
  });

  it('period=payday includes fourteen actual days and ends two days after payday', async () => {
    const res = await call('GET', '/heute?period=payday');
    expect(res.body.stand).toMatchObject({
      period: 'payday',
      from: '2026-03-04',
      to: '2026-04-17',
    });
    expect(res.body.balance.actual).toHaveLength(15);
    expect(res.body.balance.forecast).toHaveLength(31);
  });

  it('month shows another month; bad parameters are 400', async () => {
    const res = await call('GET', '/heute?month=2026-02');
    expect(res.body.stand).toMatchObject({
      month: '2026-02',
      from: '2026-03-04',
      to: '2026-03-02',
    });
    expect(res.body.balance.forecast).toEqual([]);
    expect((await call('GET', '/heute?period=week')).status).toBe(400);
    expect((await call('GET', '/heute?month=2026-13')).status).toBe(400);
  });

  it('lists an overspent envelope as the next step', async () => {
    await call('PUT', '/budget/2026-03/assigned', {
      items: [{ categoryId: 'essen', assignedCents: 5_000 }],
    });
    const res = await call('GET', '/heute');
    expect(res.body.nextSteps.items).toEqual([
      {
        kind: 'overspent',
        urgent: true,
        categoryId: 'essen',
        categoryName: 'Essen',
        cents: 7_000,
        count: 1,
      },
    ]);
  });
});

describe('PATCH /categories/:id {pinned}', () => {
  it('pins in the order of pinning, unpins, and one undo reverts the pin', async () => {
    const first = await call('PATCH', '/categories/miete', { pinned: true });
    expect(first.status).toBe(200);
    expect(first.body.category.pinnedAt).toEqual(expect.any(String));
    await new Promise((r) => setTimeout(r, 5));
    const second = await call('PATCH', '/categories/essen', { pinned: true });
    expect((await call('GET', '/heute')).body.pinned.map((p: any) => p.id)).toEqual([
      'miete',
      'essen',
    ]);

    const again = await call('PATCH', '/categories/miete', { pinned: true });
    expect(again.body.category.pinnedAt).toBe(first.body.category.pinnedAt);

    await call('PATCH', '/categories/miete', { pinned: false });
    expect((await call('GET', '/heute')).body.pinned.map((p: any) => p.id)).toEqual(['essen']);

    expect((await call('POST', '/undo', { groupId: second.body.groupId })).status).toBe(200);
    expect((await call('GET', '/heute')).body.pinned).toEqual([]);
    expect((await call('PATCH', '/categories/miete', { pinned: 'yes' })).status).toBe(400);
  });
});

it.each(['month', 'payday'] as const)(
  'shares the exact R07 period read in %s mode',
  async (period) => {
    const response = await call('GET', `/heute?period=${period}`);
    const window = heuteWindow(period, '2026-03', TODAY, nextPayday(TODAY).day);
    const result = balanceForecast(
      ruleInputs(db, TODAY).forecast!,
      window,
      response.body.balance.actual,
    );
    expect(response.body.balance.low).toEqual(result.low);
    expect(response.body.balance.forecast).toEqual(result.forecast);
    expect(response.body.balance.forecast.at(-1).day).toBe(window.to);
  },
);

it('excludes early paid rent from the variable rate and returns a provisional forecast', async () => {
  createBooking(
    db,
    {
      accountId: 'giro',
      date: '2026-03-01',
      amountCents: -90000,
      splits: [{ amountCents: -90000, categoryId: 'miete' }],
    },
    { actor: 'tester' },
  );
  const early = createApp({ webDir, auth: signedIn, ledger: { db, today: () => '2026-03-03' } });
  const response = await early.request('/api/heute');
  expect(response.status).toBe(200);
  const data = (await response.json()) as any;
  expect(data.pace.figures).toMatchObject({
    spentCents: 90000,
    variableSoFarCents: 0,
    openFixedCents: 0,
    forecastEndCents: 130000,
    forecastAvailable: true,
  });
  expect(data.pace.forecast).toHaveLength(29);
  expect(data.pace.forecast[0]).toBe(90000);
  expect(data.pace.forecast.at(-1)).toBe(130000);
});

it('Heute uses the wealth valuation and compares month start and exactly twelve months ago', async () => {
  const today = (await call('GET', '/heute')).body;
  const wealth = (await call('GET', '/wealth/networth?period=1J')).body;
  expect(today.netWorth.totalCents).toBe(188_000);
  expect(today.netWorth.totalCents).toBe(wealth.chain.nowCents);
  expect(today.netWorth.series.at(-1).cents).toBe(wealth.chain.nowCents);
  expect(today.netWorth).toMatchObject({
    previousMonthEndCents: 200_000,
    deltaCents: -12_000,
    yearAgoDay: '2025-03-18',
    yearAgoCents: 0,
    yearDeltaCents: 188_000,
  });
  expect(today.attention).toMatchObject({ pendingCount: 0, pendingBefore: '2026-03-11' });
});

it('attention counts pending bookings at least seven days old, with an inclusive cutoff', async () => {
  for (const date of ['2026-03-10', '2026-03-11', '2026-03-12']) {
    await call('POST', '/bookings', {
      type: 'booking',
      accountId: 'giro',
      date,
      categoryId: 'essen',
      amountCents: -1,
      status: 'pending',
    });
  }
  expect((await call('GET', '/heute')).body.attention).toMatchObject({
    pendingCount: 2,
    pendingBefore: '2026-03-11',
  });
});
