/* eslint-disable @typescript-eslint/no-explicit-any -- Literal ledger assertions. */
import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';
let opened: OpenedDatabase;
let app: ReturnType<typeof createLedgerApi>;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  opened.db
    .insert(schema.account)
    .values({
      id: 'depot',
      name: 'Synthetic depot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      currency: 'EUR',
      openingDate: '2026-01-01',
    })
    .run();
  opened.db
    .insert(schema.security)
    .values({ id: 'fund', name: 'Synthetic fund', kind: 'fund', currency: 'EUR' })
    .run();
  opened.db
    .insert(schema.price)
    .values({
      securityId: 'fund',
      date: '2026-01-01',
      priceMicro: 10000000,
      currency: 'EUR',
      source: 'manual',
    })
    .run();
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-09-17',
    stepUp: async (_c, next) => next(),
  });
});
afterEach(() => opened.close());
async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as any };
}
const buy = {
  securityId: 'fund',
  accountId: 'depot',
  date: '2026-09-15',
  kind: 'buy',
  unitsE8: 1000000000,
  amountCents: 10000,
};
const live = () =>
  opened.db
    .select()
    .from(schema.booking)
    .all()
    .filter((b) => !b.deletedAt);
const cash = () =>
  live()
    .filter((b) => b.accountId === 'depot')
    .reduce((s, b) => s + b.amountCents, 0);
const auditCount = () => opened.db.select().from(schema.auditLog).all().length;
async function proposal() {
  const result = await call('POST', '/savings-plans', {
    securityId: 'fund',
    accountId: 'depot',
    sourceAccountId: 'giro',
    amountCents: 10000,
    dayOfMonth: 15,
    validFrom: '2026-09-01',
  });
  expect(result.status).toBe(201);
  return result.body.plan;
}
const execution = {
  month: '2026-09',
  plannedDate: '2026-09-15',
  plannedAmountCents: 10000,
  plannedCurrency: 'EUR',
  date: '2026-09-16',
  unitsE8: 1000000000,
  amountCents: 9900,
  feeCents: 100,
  note: null,
};
it('all source kinds preserve literal holdings/basis and cash through edit, delete and undo/redo', async () => {
  const rows = [
    { ...buy, date: '2026-09-12' },
    { ...buy, kind: 'delivery_in', unitsE8: 200000000, amountCents: 2000, date: '2026-09-13' },
    { ...buy, kind: 'split', unitsE8: 1200000000, amountCents: 0, date: '2026-09-14' },
    { ...buy, kind: 'delivery_out', unitsE8: -400000000, amountCents: 3000, date: '2026-09-15' },
    { ...buy, kind: 'dividend', unitsE8: 0, amountCents: 1000, feeCents: 100, taxCents: 200 },
    { ...buy, kind: 'interest', unitsE8: 0, amountCents: 500, feeCents: 50, taxCents: 50 },
    { ...buy, kind: 'fee', unitsE8: 0, amountCents: 100 },
    { ...buy, kind: 'tax', unitsE8: 0, amountCents: 200 },
  ];
  const created = [];
  for (const row of rows) {
    const r = await call('POST', '/trades', row);
    expect(r.status).toBe(201);
    created.push(r.body);
  }
  expect(cash()).toBe(-9200);
  const positions = (await call('GET', '/portfolio/positions')).body.classes.flatMap(
    (g: any) => g.positions,
  );
  expect(positions[0]).toMatchObject({ unitsE8: 2000000000, costCents: 10000, valueCents: 20000 });
  for (const r of created.slice(1, 4)) expect(r.bookingId).toBeNull();
  const dividend = created[4];
  expect(
    opened.db
      .select()
      .from(schema.bookingSplit)
      .all()
      .find((s) => s.bookingId === dividend.bookingId)?.incomeTypeId,
  ).toBe(schema.INCOME_TYPES.capital.id);
  const changed = await call('PATCH', `/trades/${dividend.trade.id}`, { taxCents: 300 });
  expect(changed.status).toBe(200);
  expect(cash()).toBe(-9300);
  const removed = await call('DELETE', `/trades/${dividend.trade.id}`);
  expect(removed.status).toBe(200);
  expect(cash()).toBe(-9900);
  expect((await call('GET', `/trades/${dividend.trade.id}`)).status).toBe(404);
  const undone = await call('POST', '/undo', { groupId: removed.body.groupId });
  expect(undone.status).toBe(200);
  expect(cash()).toBe(-9300);
  expect((await call('POST', '/undo', { groupId: undone.body.groupId })).status).toBe(200);
  expect(cash()).toBe(-9900);
  const removedSplit = await call('DELETE', `/trades/${created[2].trade.id}`);
  expect(removedSplit.status).toBe(200);
  expect((await call('POST', '/undo', { groupId: removedSplit.body.groupId })).status).toBe(200);
});
it('rolls deletion and audit back when linked settlement is missing', async () => {
  const r = await call('POST', '/trades', buy);
  opened.db
    .update(schema.booking)
    .set({ deletedAt: '2026-09-17T00:00:00Z' })
    .where(eq(schema.booking.id, r.body.bookingId))
    .run();
  const before = auditCount();
  expect((await call('DELETE', `/trades/${r.body.trade.id}`)).status).toBeGreaterThanOrEqual(400);
  expect((await call('GET', `/trades/${r.body.trade.id}`)).status).toBe(200);
  expect(auditCount()).toBe(before);
});
it('reads due proposals without writes; confirms actual cents once and restores proposals on undo', async () => {
  const p = await proposal();
  const before = auditCount();
  const queue = await call('GET', '/inbox');
  expect(queue.body.entries.filter((e: any) => e.type === 'savings')).toMatchObject([
    {
      planId: p.id,
      amountCents: 10000,
      currency: 'EUR',
      date: '2026-09-15',
      sourceAccountName: 'Giro',
    },
  ]);
  expect((await call('GET', '/inbox/count')).body.count).toBe(queue.body.count);
  expect(auditCount()).toBe(before);
  expect(live()).toHaveLength(0);
  const [first, repeat] = await Promise.all([
    call('POST', `/savings-plans/${p.id}/confirm-execution`, execution),
    call('POST', `/savings-plans/${p.id}/confirm-execution`, execution),
  ]);
  expect([first.status, repeat.status].sort()).toEqual([201, 409]);
  const confirmed = first.status === 201 ? first : repeat;
  expect(confirmed.body.trade).toMatchObject({
    savingsPlanId: p.id,
    savingsMonth: '2026-09',
    unitsE8: 1000000000,
    amountCents: 9900,
    feeCents: 100,
  });
  expect(cash()).toBe(-10000);
  expect(live()).toHaveLength(1);
  expect((await call('GET', '/savings-plans/execution-proposals')).body.proposals).toEqual([]);
  const undone = await call('POST', '/undo', { groupId: confirmed.body.groupId });
  expect(undone.status).toBe(200);
  expect(cash()).toBe(0);
  expect((await call('GET', '/savings-plans/execution-proposals')).body.proposals).toHaveLength(1);
  expect((await call('POST', '/undo', { groupId: undone.body.groupId })).status).toBe(200);
  expect(cash()).toBe(-10000);
});
it('refuses stale, future, overlapping, closed and already matched proposals without partial writes', async () => {
  const p = await proposal();
  const before = auditCount();
  for (const change of [
    { plannedAmountCents: 20000 },
    { plannedDate: '2026-09-14' },
    { date: '2026-09-18' },
    { date: '2026-09-01' },
    { unitsE8: 0 },
    { amountCents: -1 },
    { taxCents: 1 },
    { accountId: 'giro' },
  ]) {
    expect(
      (await call('POST', `/savings-plans/${p.id}/confirm-execution`, { ...execution, ...change }))
        .status,
    ).toBeGreaterThanOrEqual(400);
  }
  expect(auditCount()).toBe(before);
  expect(live()).toEqual([]);
  await call('POST', '/trades', buy);
  expect((await call('GET', '/savings-plans/execution-proposals')).body.proposals).toEqual([]);
  expect((await call('POST', `/savings-plans/${p.id}/confirm-execution`, execution)).status).toBe(
    409,
  );
});
it('the live monthly unique identity blocks redo after a replacement, preserving cash atomically', async () => {
  const p = await proposal();
  const first = await call('POST', `/savings-plans/${p.id}/confirm-execution`, execution);
  const removed = await call('DELETE', `/trades/${first.body.trade.id}`);
  expect(removed.status).toBe(200);
  expect(cash()).toBe(0);
  expect((await call('POST', `/savings-plans/${p.id}/confirm-execution`, execution)).status).toBe(
    201,
  );
  const before = auditCount();
  expect(
    (await call('POST', '/undo', { groupId: removed.body.groupId })).status,
  ).toBeGreaterThanOrEqual(400);
  expect(auditCount()).toBe(before);
  expect(cash()).toBe(-10000);
});
