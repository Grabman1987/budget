/* eslint-disable @typescript-eslint/no-explicit-any -- literal JSON contract assertions */
import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { payoffPlan } from '@budget/domain';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';
const TODAY = '2026-10-01';
const webDir = mkdtempSync(join(tmpdir(), 'budget-debt-api-'));
writeFileSync(join(webDir, 'index.html'), '<title>Budget</title>');
let opened: OpenedDatabase;
let app: ReturnType<typeof createApp>;
let signedIn = true;
const auth: AuthGate = {
  originGuard: async (c, next) =>
    c.req.method !== 'GET' && c.req.header('origin') !== 'http://budget.test'
      ? c.json({ error: 'origin' }, 403)
      : next(),
  requireSession: async (c, next) => (signedIn ? next() : c.json({ error: 'unauthorized' }, 401)),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
const input = {
  asOf: TODAY,
  startMonth: '2026-10',
  rateBp: 632,
  paymentCents: 41200,
  extraCents: 30000,
  monthlyFeeCents: 0,
};
beforeEach(() => {
  opened = createTestDatabase();
  signedIn = true;
  opened.db
    .insert(schema.account)
    .values([
      {
        id: 'loan',
        name: 'Synthetic loan',
        type: 'loan',
        role: 'debt',
        onBudget: false,
        openingDate: TODAY,
        openingBalanceCents: -1217600,
        interestRateBp: 632,
      },
      {
        id: 'card',
        name: 'Synthetic card',
        type: 'credit_card',
        role: 'budget',
        onBudget: true,
        openingDate: TODAY,
        openingBalanceCents: -45000,
      },
    ])
    .run();
  app = createApp({ webDir, auth, ledger: { db: opened.db, today: () => TODAY } });
});
afterEach(() => opened.close());
const get = async () => {
  const res = await app.request('/api/wealth/debts');
  return { status: res.status, body: (await res.json()) as any };
};
const post = async (body: unknown = input, id = 'loan', origin = 'http://budget.test') => {
  const res = await app.request(`/api/wealth/debts/${id}/projection`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
};
describe('current debts and native, nonmutating payoff models', () => {
  it('keeps actual loan/card values shared with account valuation and preserves null fees', async () => {
    const { body } = await get();
    expect(body).toMatchObject({ asOf: TODAY, totalEurCents: 1262600 });
    expect(body.accounts.find((a: any) => a.id === 'loan')).toMatchObject({
      balanceCents: -1217600,
      owedEurCents: 1217600,
      interestRateBp: 632,
      monthlyFeeCents: null,
    });
    const accounts = (await (await app.request('/api/accounts')).json()) as any;
    expect(body.accounts.map((a: any) => a.owedEurCents)).toEqual(
      accounts.accounts.map((a: any) => -a.valueEurCents),
    );
  });
  it('returns literal integer-engine results and writes neither balances nor audit groups', async () => {
    const before = opened.db.select().from(schema.account).all();
    const { status, body } = await post();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      accountId: 'loan',
      currency: 'EUR',
      balanceCents: 1217600,
      plan: {
        base: { months: 33, payoffMonth: '2029-06', totalInterestCents: 109405 },
        withExtra: { months: 18, payoffMonth: '2028-03', totalInterestCents: 61726 },
        interestSavedCents: 47679,
        monthsEarlier: 15,
      },
    });
    expect(body.plan.base.rows[0]).toMatchObject({
      interestCents: 6413,
      principalCents: 34787,
      closingCents: 1182813,
    });
    expect(body.plan).toEqual(payoffPlan({ ...input, balanceCents: 1217600 }));
    expect(body.plan.withExtra.rows.at(-1).closingCents).toBe(0);
    expect(body.plan.withExtra.rows.at(-1).paymentCents).toBeLessThan(71200);
    expect(opened.db.select().from(schema.account).all()).toEqual(before);
    expect(opened.db.select().from(schema.auditLog).all()).toEqual([]);
  });
  it('keeps debt reads and native scenarios available without unrelated investment prices or debt FX', async () => {
    opened.db
      .insert(schema.account)
      .values([
        {
          id: 'depot',
          name: 'Synthetic depot',
          type: 'brokerage',
          role: 'investment',
          onBudget: false,
          openingDate: TODAY,
        },
        {
          id: 'usd',
          name: 'Synthetic USD loan',
          type: 'loan',
          role: 'debt',
          onBudget: false,
          currency: 'USD',
          openingDate: TODAY,
          openingBalanceCents: -10000,
        },
      ])
      .run();
    opened.db
      .insert(schema.security)
      .values({ id: 's', name: 'Synthetic share', kind: 'stock', currency: 'EUR' })
      .run();
    opened.db
      .insert(schema.holding)
      .values({ id: 'h', accountId: 'depot', securityId: 's', asOf: TODAY, unitsE8: 100000000 })
      .run();
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.totalEurCents).toBeNull();
    expect(body.accounts.map((a: any) => a.id)).not.toContain('depot');
    expect(body.accounts.find((a: any) => a.id === 'usd')).toMatchObject({
      balanceCents: -10000,
      owedEurCents: null,
      missingFxCurrencies: ['USD'],
      interestRateBp: null,
    });
    const usd = await post({ ...input, rateBp: 0, paymentCents: 4000, extraCents: 0 }, 'usd');
    expect(usd.status).toBe(200);
    expect(usd.body.currency).toBe('USD');
    expect(usd.body.plan.base).toMatchObject({
      months: 3,
      totalInterestCents: 0,
      totalPaidCents: 10000,
    });
  });
  it('returns typed projection failures for insufficient payment, fees, horizon and unsafe sums', async () => {
    for (const patch of [
      { paymentCents: 6413 },
      { rateBp: 0, paymentCents: 500, monthlyFeeCents: 500 },
      { rateBp: 0, paymentCents: 1 },
      { paymentCents: Number.MAX_SAFE_INTEGER, extraCents: 1 },
    ]) {
      const res = await post({ ...input, ...patch });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('invalid_projection');
    }
  });
  it('requires explicit inputs and rejects floats, extra principal, invalid dates and unknown accounts', async () => {
    const withoutFee: Partial<typeof input> = { ...input };
    delete withoutFee.monthlyFeeCents;
    for (const body of [
      withoutFee,
      { ...input, rateBp: null },
      { ...input, extraCents: 0.5 },
      { ...input, paymentCents: -1 },
      { ...input, balanceCents: 1 },
      { ...input, startMonth: '2026-13' },
      { ...input, startMonth: '2026-09' },
      { ...input, startMonth: '9900-01' },
      { ...input, asOf: '2027-01-01' },
    ])
      expect((await post(body)).status).toBe(400);
    expect((await post(input, 'unknown')).status).toBe(404);
    expect((await post(input, 'card')).status).toBe(422);
  });
  it('keeps empty/paid states honest and marks unsafe EUR rows and totals unavailable', async () => {
    opened.db.update(schema.account).set({ openingBalanceCents: 0 }).run();
    expect((await get()).body).toMatchObject({ accounts: [], totalEurCents: 0 });
    expect((await post()).body.error).toBe('invalid_projection');
    opened.db
      .update(schema.account)
      .set({ openingBalanceCents: -4503599627370497, currency: 'USD' })
      .where(eq(schema.account.id, 'loan'))
      .run();
    opened.db
      .insert(schema.fxRate)
      .values({ currency: 'USD', date: TODAY, rateMicro: 3000000 })
      .run();
    const row = (await get()).body;
    expect(row.totalEurCents).toBeNull();
    expect(row.accounts[0]).toMatchObject({
      balanceCents: -4503599627370497,
      owedEurCents: null,
      unavailableReason: 'calculation_limit',
      missingFxCurrencies: [],
    });
    opened.db
      .update(schema.account)
      .set({ currency: 'EUR', openingBalanceCents: -Number.MAX_SAFE_INTEGER })
      .where(eq(schema.account.id, 'loan'))
      .run();
    opened.db
      .update(schema.account)
      .set({ openingBalanceCents: -1 })
      .where(eq(schema.account.id, 'card'))
      .run();
    expect((await get()).body).toMatchObject({
      totalEurCents: null,
      unavailableReason: 'calculation_limit',
    });
  });
  it('refuses unsafe native current principal with a typed German read error', async () => {
    opened.db.update(schema.account).set({ openingBalanceCents: -4503599627370497 }).run();
    // Every stored amount is safe; their exact sum is not: -9007199254740994.
    opened.db
      .insert(schema.booking)
      .values({
        id: 'b',
        accountId: 'loan',
        date: TODAY,
        amountCents: -4503599627370497,
        status: 'confirmed',
      })
      .run();
    const res = await get();
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: 'valuation_unavailable',
      reason: 'calculation_limit',
      message: 'Die aktuelle Restschuld überschreitet die sichere Rechengrenze.',
    });
  });
  it('follows shared net account value when investment cash is offset by holdings', async () => {
    opened.db
      .insert(schema.account)
      .values({
        id: 'broker',
        name: 'Synthetic broker',
        type: 'brokerage',
        role: 'investment',
        onBudget: false,
        openingDate: TODAY,
        openingBalanceCents: -5000,
      })
      .run();
    opened.db
      .insert(schema.security)
      .values({ id: 's', name: 'Synthetic share', kind: 'stock', currency: 'EUR' })
      .run();
    opened.db
      .insert(schema.holding)
      .values({ id: 'h', accountId: 'broker', securityId: 's', asOf: TODAY, unitsE8: 100000000 })
      .run();
    opened.db
      .insert(schema.price)
      .values({
        securityId: 's',
        date: TODAY,
        priceMicro: 10000000,
        currency: 'EUR',
        source: 'manual',
      })
      .run();
    const negative = (await get()).body;
    expect(negative.accounts.find((a: any) => a.id === 'broker')).toMatchObject({
      balanceCents: -5000,
      owedEurCents: 4000,
    });
    expect(negative.totalEurCents).toBe(1266600);
    opened.db.update(schema.price).set({ priceMicro: 100000000 }).run();
    const positive = (await get()).body;
    expect(positive.accounts.map((a: any) => a.id)).not.toContain('broker');
    expect(positive.totalEurCents).toBe(1262600);
  });
  it('requires session and origin while remaining an unaudited read', async () => {
    expect((await post(input, 'loan', 'http://other.test')).status).toBe(403);
    signedIn = false;
    expect((await get()).status).toBe(401);
    expect((await post()).status).toBe(401);
  });
});
