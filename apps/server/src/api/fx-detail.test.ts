/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect synthetic JSON responses. */
import { createTestDatabase, createBooking, schema, undo } from '@budget/db';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-10-02';
const auth: AuthGate = {
  routes: new Hono(),
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
};
let opened: ReturnType<typeof createTestDatabase>;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  opened = createTestDatabase();
  opened.db
    .insert(schema.account)
    .values({
      id: 'native',
      name: 'Synthetic currency account',
      type: 'savings',
      role: 'investment',
      onBudget: false,
      currency: 'USD',
      openingDate: '2026-09-30',
      openingBalanceCents: 10_000,
    })
    .run();
  opened.db
    .insert(schema.fxRate)
    .values([
      { currency: 'USD', date: '2026-10-01', rateMicro: 500_000, source: 'ecb' },
      { currency: 'USD', date: TODAY, rateMicro: 750_000, source: 'ecb' },
      { currency: 'USD', date: '2026-10-03', rateMicro: 900_000, source: 'ecb' },
    ])
    .run();
  for (const [date, amountCents, status] of [
    ['2026-10-01', -101, 'confirmed'],
    [TODAY, 201, 'confirmed'],
    [TODAY, -10, 'pending'],
  ] as const)
    createBooking(
      opened.db,
      { accountId: 'native', date, amountCents, status, splits: [{ amountCents }] },
      { actor: 'test', groupId: `synthetic-${amountCents}` },
    );
  app = createApp({ webDir: 'apps/web/dist', auth, ledger: { db: opened.db, today: () => TODAY } });
});
afterEach(() => opened.close());
async function call(path: string, body?: unknown) {
  const response = await app.request(
    `/api${path}`,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  expect(response.status).toBe(body === undefined || path.endsWith('/preview') ? 200 : 201);
  return (await response.json()) as any;
}

describe('foreign cash detail API', () => {
  it('separates native cash from EUR securities in the shared overview value', async () => {
    opened.db
      .insert(schema.security)
      .values({
        id: 'synthetic-security',
        name: 'Synthetic instrument',
        kind: 'stock',
        currency: 'EUR',
      })
      .run();
    opened.db
      .insert(schema.holding)
      .values({
        id: 'synthetic-holding',
        accountId: 'native',
        securityId: 'synthetic-security',
        asOf: TODAY,
        unitsE8: 100_000_000,
      })
      .run();
    opened.db
      .insert(schema.price)
      .values({
        securityId: 'synthetic-security',
        date: TODAY,
        priceMicro: 20_000_000,
        currency: 'EUR',
        source: 'manual',
      })
      .run();
    const detail = (await call('/accounts/native')).account;
    const overview = (await call('/accounts')).accounts.find((a: any) => a.id === 'native');
    expect(detail).toMatchObject({
      balanceCents: 10_090,
      holdingsCents: 2_000,
      valueEurCents: 9_568,
      cashValuation: { eurCents: 7_568 },
    });
    expect(detail).toEqual(overview);
    const series = await call('/accounts/native/series?from=2026-10-01&to=2026-10-02');
    expect(series.points.at(-1).valuation.eurCents).toBe(7_568);
  });

  it('withholds a movement sum with historical FX gaps while the current value stays known', async () => {
    opened.db.delete(schema.fxRate).where(eq(schema.fxRate.date, '2026-10-01')).run();
    expect((await call('/accounts/native')).account.valueEurCents).toBe(7_568);
    const list = await call('/bookings?accountId=native');
    expect(list.sumEurCents).toBeNull();
    expect(
      list.items.find((b: any) => b.date === '2026-10-01').amountValuation.eurCents,
    ).toBeNull();
    const current = await call('/bookings?accountId=native&from=2026-10-02&status=confirmed');
    expect(current.sumCents).toBe(201);
    expect(current.sumEurCents).toBe(151);
  });

  it('adds identity valuations without changing EUR account cents', async () => {
    opened.db
      .insert(schema.account)
      .values({
        id: 'eur',
        name: 'Synthetic EUR',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        currency: 'EUR',
        openingDate: TODAY,
        openingBalanceCents: 12_345,
      })
      .run();
    expect((await call('/accounts/eur')).account).toMatchObject({
      balanceCents: 12_345,
      valueEurCents: 12_345,
      cashValuation: { eurCents: 12_345, rateMicro: 1_000_000, rateDate: null },
    });
    const preview = (
      await call('/accounts/eur/reconciliation/preview', {
        date: TODAY,
        statementBalanceCents: 12_345,
      })
    ).preview;
    expect(preview.differenceCents).toBe(0);
    expect(preview.valuations.statement.eurCents).toBe(12_345);
  });

  it('keeps native cents and matches overview at today; historical rows use their own rates', async () => {
    const account = (await call('/accounts/native')).account;
    expect(account.balanceCents).toBe(10_090);
    expect(account.valueEurCents).toBe(7_568);
    expect(account.cashValuation.eurCents).toBe(account.valueEurCents);
    expect(account.cashValuation).toMatchObject({
      rateMicro: 750_000,
      rateDate: TODAY,
      rateSource: 'ecb',
    });
    const first = await call('/bookings?accountId=native&from=2026-10-01&to=2026-10-02&limit=1');
    expect(first.sumCents).toBe(90);
    expect(first.sumEurCents).toBe(92);
    const next = await call(
      `/bookings?accountId=native&from=2026-10-01&to=2026-10-02&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`,
    );
    expect(next.sumEurCents).toBe(92);
    const list = await call('/bookings?accountId=native');
    const expense = list.items.find((b: any) => b.amountCents === -101);
    expect(expense.amountValuation).toMatchObject({ eurCents: -51, rateDate: '2026-10-01' });
    expect(expense.balanceAfterCents).toBe(9_899);
    expect(expense.balanceValuation.eurCents).toBe(4_950);
    const series = await call('/accounts/native/series?from=2026-09-30&to=2026-10-02');
    expect(series.currency).toBe('USD');
    expect(series.points.map((p: any) => p.valuation.eurCents)).toEqual([null, 4_950, 7_568]);
    expect(series.points.at(-1).valuation).toEqual(account.cashValuation);
  });

  it('keeps the native check authoritative and adjustment/undo/redo atomic', async () => {
    const auditCount = opened.db.select().from(schema.auditLog).all().length;
    const preview = (
      await call('/accounts/native/reconciliation/preview', {
        date: TODAY,
        statementBalanceCents: 10_200,
      })
    ).preview;
    expect(preview).toMatchObject({
      currency: 'USD',
      bookedBalanceCents: 10_100,
      pendingCents: -10,
      differenceCents: 100,
    });
    expect(preview.valuations.booked.eurCents).toBe(7_575);
    expect(preview.valuations.statement.eurCents).toBe(7_650);
    expect(preview.valuations.difference.eurCents).toBe(75);
    expect(opened.db.select().from(schema.auditLog).all()).toHaveLength(auditCount);
    const refused = await app.request('/api/accounts/native/reconciliation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: TODAY, statementBalanceCents: 10_200 }),
    });
    expect(refused.status).toBe(409);
    expect(opened.db.select().from(schema.auditLog).all()).toHaveLength(auditCount);
    expect((await call('/accounts/native')).account.clearedCents).toBe(10_100);
    const result = (
      await call('/accounts/native/reconciliation', {
        date: TODAY,
        statementBalanceCents: 10_200,
        adjust: true,
      })
    ).result;
    const adjustment = (await call(`/bookings/${result.adjustmentBookingId}`)).booking;
    expect(adjustment).toMatchObject({ amountCents: 100, currency: 'USD', status: 'reconciled' });
    expect((await call('/accounts/native')).account.clearedCents).toBe(10_200);
    const reverted = undo(opened.db, { groupId: result.groupId }, { actor: 'test' });
    expect((await call('/accounts/native')).account.clearedCents).toBe(10_100);
    undo(opened.db, { groupId: reverted.groupId }, { actor: 'test' });
    expect((await call('/accounts/native')).account.clearedCents).toBe(10_200);
  });

  it('does not backfill missing rates from tomorrow and preserves native reads/checks', async () => {
    opened.db.delete(schema.fxRate).run();
    opened.db
      .insert(schema.fxRate)
      .values({ currency: 'USD', date: '2026-10-03', rateMicro: 900_000, source: 'ecb' })
      .run();
    expect((await call('/accounts/native')).account.valueEurCents).toBeNull();
    const list = await call('/bookings?accountId=native');
    expect(list.sumCents).toBe(90);
    expect(list.sumEurCents).toBeNull();
    expect(
      list.items.every(
        (b: any) => b.amountValuation.eurCents === null && b.balanceValuation.eurCents === null,
      ),
    ).toBe(true);
    const preview = (
      await call('/accounts/native/reconciliation/preview', {
        date: TODAY,
        statementBalanceCents: 10_100,
      })
    ).preview;
    expect(preview.differenceCents).toBe(0);
    expect(preview.valuations.difference.eurCents).toBeNull();
    await call('/accounts/native/reconciliation', { date: TODAY, statementBalanceCents: 10_100 });
  });

  it('still requires a session for detail and reconciliation reads', async () => {
    const denied = createApp({
      webDir: 'apps/web/dist',
      auth: { ...auth, requireSession: async (c) => c.json({ error: 'unauthorized' }, 401) },
      ledger: { db: opened.db, today: () => TODAY },
    });
    for (const path of [
      '/accounts/native',
      '/accounts/native/series?from=2026-10-01&to=2026-10-02',
      '/bookings?accountId=native',
    ])
      expect((await denied.request(`/api${path}`)).status).toBe(401);
    expect(
      (
        await denied.request('/api/accounts/native/reconciliation/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ date: TODAY, statementBalanceCents: 10_100 }),
        })
      ).status,
    ).toBe(401);
  });
});
