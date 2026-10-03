/* eslint-disable @typescript-eslint/no-explicit-any -- Literal API boundary assertions. */
import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

let opened: OpenedDatabase;
let app: ReturnType<typeof createLedgerApi>;
let today: string;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  today = '2026-09-17';
  opened.db
    .insert(schema.account)
    .values({
      id: 'depot',
      name: 'Testdepot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      currency: 'CHF',
      openingDate: '2026-01-01',
    })
    .run();
  opened.db
    .insert(schema.security)
    .values({ id: 'fund', name: 'Testfonds', kind: 'fund', currency: 'CHF' })
    .run();
  app = createLedgerApi({ db: opened.db, today: () => today, stepUp: async (_c, next) => next() });
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
const plan = (changes = {}) =>
  call('POST', '/savings-plans', {
    accountId: 'depot',
    securityId: 'fund',
    sourceAccountId: 'giro',
    amountCents: 10000,
    dayOfMonth: 15,
    validFrom: '2026-09-01',
    ...changes,
  });
const proposals = async () =>
  (await call('GET', '/inbox')).body.entries.filter((e: any) => e.type === 'savings');
const confirm = (id: string, changes = {}) =>
  call('POST', `/savings-plans/${id}/confirm-execution`, {
    month: '2026-09',
    plannedAmountCents: 10000,
    plannedDate: '2026-09-15',
    plannedCurrency: 'CHF',
    date: '2026-09-15',
    unitsE8: 200000000,
    amountCents: 9900,
    feeCents: 100,
    note: 'Synthetische Ausführung',
    ...changes,
  });
const counts = () =>
  [schema.trade, schema.booking, schema.auditLog].map(
    (table) => opened.db.select().from(table).all().length,
  );

describe('owner-confirmed monthly savings proposals', () => {
  it('reads without writes, retains native currency and atomically creates one buy and settlement', async () => {
    const created = await plan();
    const id = created.body.plan.id;
    const before = counts();
    expect(await proposals()).toMatchObject([
      {
        planId: id,
        currency: 'CHF',
        date: '2026-09-15',
        amountCents: 10000,
        sourceAccountName: expect.any(String),
      },
    ]);
    const view = await call('GET', '/inbox');
    expect((await call('GET', '/inbox/count')).body.count).toBe(view.body.count);
    expect(counts()).toEqual(before);
    const result = await confirm(id);
    expect(result.status).toBe(201);
    expect(result.body.trade).toMatchObject({
      kind: 'buy',
      unitsE8: 200000000,
      amountCents: 9900,
      feeCents: 100,
      savingsPlanId: id,
      savingsMonth: '2026-09',
    });
    expect(
      opened.db.select().from(schema.booking).where(isNull(schema.booking.deletedAt)).all(),
    ).toMatchObject([{ accountId: 'depot', currency: 'CHF', amountCents: -10000 }]);
    expect(await proposals()).toEqual([]);
    const after = counts();
    expect((await confirm(id)).status).toBe(409);
    expect(counts()).toEqual(after);
    const undone = await call('POST', '/undo', { groupId: result.body.groupId });
    expect(undone.status).toBe(200);
    expect(await proposals()).toHaveLength(1);
    expect(
      opened.db.select().from(schema.booking).where(isNull(schema.booking.deletedAt)).all(),
    ).toEqual([]);
    expect((await call('POST', '/undo', { groupId: undone.body.groupId })).status).toBe(200);
    expect(await proposals()).toEqual([]);
    today = '2026-10-17';
    expect(await proposals()).toMatchObject([{ month: '2026-10', amountCents: 10000 }]);
  });
  it('rejects stale, invalid and future execution inputs without cash or audit side effects', async () => {
    const id = (await plan()).body.plan.id;
    const before = counts();
    for (const changes of [
      { plannedAmountCents: 10100 },
      { plannedDate: '2026-09-16' },
      { unitsE8: 0 },
      { feeCents: -1 },
      { date: '2026-10-01' },
      { date: '2026-02-30' },
      { month: '2026-08' },
    ]) {
      expect((await confirm(id, changes)).status).toBeGreaterThanOrEqual(400);
      expect(counts()).toEqual(before);
    }
    await call('PATCH', `/savings-plans/${id}`, { amountCents: 20000, from: '2026-09-01' });
    expect((await confirm(id)).status).toBe(409);
    expect(await proposals()).toMatchObject([{ amountCents: 20000 }]);
    expect(opened.db.select().from(schema.trade).all()).toEqual([]);
  });
  it('suppresses a matched existing buy and preserves monthly identity after editing or deletion', async () => {
    const id = (await plan()).body.plan.id;
    const buy = await call('POST', '/trades', {
      accountId: 'depot',
      securityId: 'fund',
      date: '2026-09-16',
      kind: 'buy',
      unitsE8: 200000000,
      amountCents: 9900,
      feeCents: 100,
    });
    expect(await proposals()).toEqual([]);
    await call('DELETE', `/trades/${buy.body.trade.id}`);
    expect(await proposals()).toHaveLength(1);
    const result = await confirm(id);
    await call('PATCH', `/trades/${result.body.trade.id}`, { amountCents: 12000 });
    expect(await proposals()).toEqual([]);
    expect(
      (
        await call('PATCH', `/trades/${result.body.trade.id}`, {
          kind: 'sell',
          unitsE8: -200000000,
        })
      ).status,
    ).toBe(400);
    const deleted = await call('DELETE', `/trades/${result.body.trade.id}`);
    expect(await proposals()).toHaveLength(1);
    expect((await confirm(id)).status).toBe(201);
    const before = counts();
    const refused = await call('POST', '/undo', { groupId: deleted.body.groupId });
    expect(refused).toMatchObject({ status: 422, body: { error: 'constraint' } });
    expect(counts()).toEqual(before);
  });
  it('does not offer future, ended or closed-account executions', async () => {
    const first = await plan({ dayOfMonth: 31 });
    expect(await proposals()).toEqual([]);
    await call('POST', `/savings-plans/${first.body.plan.id}/end`, { to: '2026-09-10' });
    expect(await proposals()).toEqual([]);
    const active = await plan();
    opened.db
      .update(schema.account)
      .set({ closedAt: '2026-09-17' })
      .where(eq(schema.account.id, 'depot'))
      .run();
    expect(await proposals()).toEqual([]);
    expect((await confirm(active.body.plan.id)).status).toBe(409);
  });
  it('retains overdue proposals but refuses overlapping versions and deleted references', async () => {
    const id = (await plan()).body.plan.id;
    today = '2026-10-17';
    expect(await proposals()).toMatchObject([{ month: '2026-09' }, { month: '2026-10' }]);
    opened.db
      .insert(schema.savingsPlan)
      .values({
        id: 'overlap',
        accountId: 'depot',
        securityId: 'fund',
        amountCents: 10000,
        dayOfMonth: 16,
        validFrom: '2026-09-01',
        validTo: '2026-09-30',
      })
      .run();
    expect(await proposals()).toMatchObject([{ month: '2026-10' }]);
    expect(await proposals()).toHaveLength(1);
    const before = counts();
    expect((await confirm(id)).status).toBe(409);
    expect(counts()).toEqual(before);
    opened.db
      .update(schema.security)
      .set({ deletedAt: '2026-10-17T00:00:00Z' })
      .where(eq(schema.security.id, 'fund'))
      .run();
    expect(await proposals()).toEqual([]);
    expect((await confirm(id)).status).toBe(409);
    expect(counts()).toEqual(before);
  });
  it('uses an existing buy only once across adjacent monthly execution windows', async () => {
    const first = await plan({ dayOfMonth: 31 });
    await call('POST', `/savings-plans/${first.body.plan.id}/end`, { to: '2026-09-30' });
    await plan({ dayOfMonth: 1, validFrom: '2026-10-01' });
    today = '2026-10-03';
    await call('POST', '/trades', {
      accountId: 'depot',
      securityId: 'fund',
      date: '2026-09-30',
      kind: 'buy',
      unitsE8: 200000000,
      amountCents: 10000,
    });
    expect(await proposals()).toMatchObject([{ month: '2026-10', date: '2026-10-01' }]);
    expect(await proposals()).toHaveLength(1);
  });
});
