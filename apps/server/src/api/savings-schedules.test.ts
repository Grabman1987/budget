/* eslint-disable @typescript-eslint/no-explicit-any -- Literal API boundary assertions. */
import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { plannedExecutions, rowAppliesOn } from '@budget/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
      name: 'CHF Depot',
      currency: 'CHF',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-01-01',
    })
    .run();
  opened.db
    .insert(schema.security)
    .values({ id: 'fund', name: 'Unpriced Fund', kind: 'fund', currency: 'CHF' })
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
const input = {
  securityId: 'fund',
  accountId: 'depot',
  sourceAccountId: 'giro',
  amountCents: 10000,
  dayOfMonth: 31,
  validFrom: '2026-01-01',
};
const rows = async () => (await call('GET', '/savings-plans?ended=1')).body.plans;
describe('native savings schedule CRUD without valuation or execution side effects', () => {
  it('retains the existing API-permitted overlap for the UI to show explicitly', async () => {
    const first = await call('POST', '/savings-plans', input);
    expect(
      (await call('POST', `/savings-plans/${first.body.plan.id}/end`, { to: '2026-12-31' })).status,
    ).toBe(200);
    expect(
      (
        await call('POST', '/savings-plans', {
          ...input,
          amountCents: 20000,
          validFrom: '2026-09-17',
        })
      ).status,
    ).toBe(201);
    expect(
      (await rows())
        .filter((r: any) => rowAppliesOn(r, '2026-09-17'))
        .map((r: any) => r.amountCents),
    ).toEqual([10000, 20000]);
  });
  it('creates on a held unpriced instrument, keeps CHF cents and books no new trade/booking', async () => {
    const buy = await call('POST', '/trades', {
      securityId: 'fund',
      accountId: 'depot',
      date: '2026-01-01',
      kind: 'buy',
      units: '1',
      amountCents: 10000,
    });
    expect(buy.status).toBe(201);
    const counts = () => [
      opened.db.select().from(schema.booking).all().length,
      opened.db.select().from(schema.trade).all().length,
      opened.db.select().from(schema.inboxItem).all().length,
    ];
    const before = counts();
    const created = await call('POST', '/savings-plans', input);
    expect(created.status).toBe(201);
    expect(created.body.plan).toMatchObject(input);
    expect(plannedExecutions(await rows(), '2026-02')).toMatchObject([
      { date: '2026-02-28', amountCents: 10000 },
    ]);
    expect((await call('GET', '/portfolio/positions')).body.valueCents).toBeNull();
    const edit = await call('PATCH', `/savings-plans/${created.body.plan.id}`, {
      amountCents: 20000,
    });
    expect(edit.status).toBe(200);
    expect(edit.body.plan.validFrom).toBe('2026-09-30');
    const ended = await call('POST', `/savings-plans/${edit.body.plan.id}/end`, {
      to: '2026-10-31',
    });
    expect(ended.status).toBe(200);
    expect(counts()).toEqual(before);
    expect(opened.db.select().from(schema.price).all()).toEqual([]);
  });
  it('preserves literal version boundaries through change/end undo and redo', async () => {
    const created = await call('POST', '/savings-plans', input);
    const id = created.body.plan.id;
    const edit = await call('PATCH', `/savings-plans/${id}`, {
      amountCents: 20000,
      from: '2026-10-01',
    });
    expect(await rows()).toMatchObject([
      { id, amountCents: 10000, validTo: '2026-09-30' },
      { amountCents: 20000, validFrom: '2026-10-01', validTo: null },
    ]);
    expect(
      (await rows())
        .filter((r: any) => rowAppliesOn(r, '2026-09-30'))
        .map((r: any) => r.amountCents),
    ).toEqual([10000]);
    expect(
      (await rows())
        .filter((r: any) => rowAppliesOn(r, '2026-10-01'))
        .map((r: any) => r.amountCents),
    ).toEqual([20000]);
    const undone = await call('POST', '/undo', { groupId: edit.body.groupId });
    expect(undone.status).toBe(200);
    expect(await rows()).toMatchObject([{ id, amountCents: 10000, validTo: null }]);
    expect((await call('POST', '/undo', { groupId: undone.body.groupId })).status).toBe(200);
    const next = edit.body.plan.id;
    const ended = await call('POST', `/savings-plans/${next}/end`, { to: '2026-10-15' });
    expect((await rows()).filter((r: any) => rowAppliesOn(r, '2026-10-15'))).toHaveLength(1);
    expect((await rows()).filter((r: any) => rowAppliesOn(r, '2026-10-16'))).toHaveLength(0);
    expect((await call('POST', '/undo', { groupId: ended.body.groupId })).status).toBe(200);
    expect((await rows())[1].validTo).toBeNull();
  });
  it('corrects a future row in place without relabelling its real beginning', async () => {
    const created = await call('POST', '/savings-plans', { ...input, validFrom: '2026-11-01' });
    const changed = await call('PATCH', `/savings-plans/${created.body.plan.id}`, {
      amountCents: 25000,
      from: '2026-10-01',
    });
    expect(changed.body.plan).toMatchObject({
      id: created.body.plan.id,
      amountCents: 25000,
      validFrom: '2026-11-01',
    });
    expect(await rows()).toHaveLength(1);
    const before = await rows();
    expect(
      (await call('POST', `/savings-plans/${created.body.plan.id}/end`, { to: '2026-10-31' }))
        .status,
    ).toBe(400);
    expect(await rows()).toEqual(before);
  });
  it('refuses duplicate/invalid/foreign references atomically and undoes creation', async () => {
    const created = await call('POST', '/savings-plans', input);
    const before = await rows();
    expect((await call('POST', '/savings-plans', input)).status).toBe(409);
    for (const patch of [
      { amountCents: 0 },
      { dayOfMonth: 32 },
      { from: '2026-02-30', amountCents: 1 },
      { sourceAccountId: 'depot' },
    ]) {
      expect((await call('PATCH', `/savings-plans/${created.body.plan.id}`, patch)).status).toBe(
        400,
      );
    }
    expect((await call('PATCH', '/savings-plans/foreign-id', { amountCents: 1 })).status).toBe(404);
    expect((await call('POST', '/savings-plans/foreign-id/end', {})).status).toBe(404);
    expect(
      (
        await call('PATCH', `/savings-plans/${created.body.plan.id}`, {
          sourceAccountId: 'foreign-id',
        })
      ).status,
    ).toBe(404);
    expect(await rows()).toEqual(before);
    const undone = await call('POST', '/undo', { groupId: created.body.groupId });
    expect(undone.status).toBe(200);
    expect(await rows()).toEqual([]);
    expect((await call('POST', '/undo', { groupId: undone.body.groupId })).status).toBe(200);
    expect(await rows()).toEqual(before);
  });
});
