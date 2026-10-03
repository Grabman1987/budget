/* eslint-disable @typescript-eslint/no-explicit-any -- Literal API boundary assertions. */
import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { eq, isNull } from 'drizzle-orm';
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
      name: 'Testdepot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-01-01',
    })
    .run();
  opened.db.insert(schema.security).values({ id: 'fund', name: 'Testfonds', kind: 'fund' }).run();
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
const input = { securityId: 'fund', accountId: 'depot', date: '2026-09-01' };
const live = () =>
  opened.db.select().from(schema.booking).where(isNull(schema.booking.deletedAt)).all();

describe('all owner-captured trade kinds and audited removal', () => {
  it.each([
    ['dividend', 0, 10000, 100, 2750, 7150, 'capital'],
    ['interest', 0, 10000, 100, 2750, 7150, 'capital'],
    ['fee', 0, 500, 0, 0, -500, null],
    ['tax', 0, 750, 0, 0, -750, null],
    ['delivery_in', 200000000, 12000, 0, 0, 0, null],
    ['delivery_out', -100000000, 6000, 0, 0, 0, null],
    ['split', 200000000, 0, 0, 0, 0, null],
    ['split', -100000000, 0, 0, 0, 0, null],
  ])(
    '%s preserves literal cash and unit effects through delete/undo/redo',
    async (kind, unitsE8, amountCents, feeCents, taxCents, cash, income) => {
      const created = await call('POST', '/trades', {
        ...input,
        kind,
        unitsE8,
        amountCents,
        feeCents,
        taxCents,
      });
      expect(created.status).toBe(201);
      expect(created.body.trade.unitsE8).toBe(unitsE8);
      expect(live().map((b) => b.amountCents)).toEqual(cash ? [cash] : []);
      if (cash) {
        const split = opened.db
          .select()
          .from(schema.bookingSplit)
          .where(eq(schema.bookingSplit.bookingId, created.body.bookingId))
          .get()!;
        expect(split.incomeTypeId).toBe(income ? schema.INCOME_TYPES.capital.id : null);
      }
      const removed = await call('DELETE', `/trades/${created.body.trade.id}`);
      expect(removed.status).toBe(200);
      expect((await call('GET', '/trades')).body.trades).toEqual([]);
      expect(live()).toEqual([]);
      expect(opened.db.select().from(schema.trade).all()).toHaveLength(1);
      const undo = await call('POST', '/undo', { groupId: removed.body.groupId });
      expect(undo.status).toBe(200);
      expect((await call('GET', '/trades')).body.trades).toHaveLength(1);
      expect(live().map((b) => b.amountCents)).toEqual(cash ? [cash] : []);
      expect((await call('POST', '/undo', { groupId: undo.body.groupId })).status).toBe(200);
      expect(live()).toEqual([]);
    },
  );
  it('edits income into a delivery and restores its settlement with undo', async () => {
    const created = await call('POST', '/trades', {
      ...input,
      kind: 'dividend',
      amountCents: 10000,
    });
    const edited = await call('PATCH', `/trades/${created.body.trade.id}`, {
      kind: 'delivery_in',
      unitsE8: 100000000,
      amountCents: 12000,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.bookingId).toBeNull();
    expect(live()).toEqual([]);
    expect((await call('POST', '/undo', { groupId: edited.body.groupId })).status).toBe(200);
    expect(live().map((b) => b.amountCents)).toEqual([10000]);
  });
  it('rolls back trade deletion when a linked settlement is reconciled', async () => {
    const created = await call('POST', '/trades', {
      ...input,
      kind: 'dividend',
      amountCents: 10000,
    });
    opened.db
      .update(schema.booking)
      .set({ status: 'reconciled' })
      .where(eq(schema.booking.id, created.body.bookingId))
      .run();
    const auditBefore = opened.db.select().from(schema.auditLog).all().length;
    expect((await call('DELETE', `/trades/${created.body.trade.id}`)).status).toBe(409);
    expect((await call('GET', '/trades')).body.trades).toHaveLength(1);
    expect(live()).toHaveLength(1);
    expect(opened.db.select().from(schema.auditLog).all()).toHaveLength(auditBefore);
  });
});
