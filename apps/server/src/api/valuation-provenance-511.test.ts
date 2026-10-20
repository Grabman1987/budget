import { createTestDatabase, schema, type ValuationSource } from '@budget/db';
import { parseAmount } from '@budget/import-ynab';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const DAY = '2026-09-20';
const auth: AuthGate = {
  routes: new Hono(),
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
};
let opened: ReturnType<typeof createTestDatabase>;
let app: ReturnType<typeof createApp>;
interface Listed {
  netWorthEurCents: number | null;
  valuationSources: ValuationSource[];
  accounts: Array<{
    id: string;
    balanceCents: number;
    valueEurCents: number | null;
    valuationSources: ValuationSource[];
    cashValuation: { eurCents: number | null };
  }>;
}
interface Today {
  stand: { today: string; month: string };
  valuationSources: ValuationSource[];
  attention: { quoteReview: { count: number; securityIds: string[] } };
}
beforeEach(() => {
  opened = createTestDatabase();
  opened.db
    .insert(schema.account)
    .values({
      id: 'depot',
      name: 'Synthetic depot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-09-01',
      currency: 'USD',
      openingBalanceCents: 12345,
    })
    .run();
  opened.db
    .insert(schema.security)
    .values({ id: 'held', name: 'Synthetic held', kind: 'stock', currency: 'USD' })
    .run();
  opened.db
    .insert(schema.holding)
    .values({
      id: 'h',
      accountId: 'depot',
      securityId: 'held',
      asOf: '2026-09-01',
      unitsE8: 100000000,
      costBasisCents: null,
    })
    .run();
  app = createApp({ webDir: 'apps/web/dist', auth, ledger: { db: opened.db, today: () => DAY } });
});
afterEach(() => opened.close());
async function read<T>(path: string): Promise<T> {
  const response = await app.request(`/api${path}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  return response.json() as Promise<T>;
}
it('maps a typed safe-native EUR result overflow to the existing portfolio calculation-limit response', async () => {
  opened.db
    .update(schema.account)
    .set({ openingBalanceCents: -4503599627370497 })
    .where(eq(schema.account.id, 'depot'))
    .run();
  opened.db.insert(schema.fxRate).values({ currency: 'USD', date: DAY, rateMicro: 3000000 }).run();
  const before = opened.sqlite.serialize();
  const response = await app.request('/api/portfolio?period=1J&history=contributions');
  expect(response.status).toBe(422);
  const body = await response.json();
  expect(body).toMatchObject({ error: 'calculation_limit' });
  expect(body).not.toHaveProperty('portfolio');
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
});
it('does not relabel an unrelated original risk-policy RangeError as a valuation calculation limit', async () => {
  opened.db
    .update(schema.account)
    .set({ openingBalanceCents: 0, currency: 'EUR' })
    .where(eq(schema.account.id, 'depot'))
    .run();
  opened.db
    .update(schema.holding)
    .set({ costBasisCents: 10000 })
    .where(eq(schema.holding.id, 'h'))
    .run();
  opened.db
    .insert(schema.rule)
    .values({
      id: 'invalid-risk',
      code: 'R13',
      name: 'Synthetic invalid risk',
      paramsJson: '{"maxBandBp":-1}',
    })
    .run();
  const before = opened.sqlite.serialize();
  const response = await app.request('/api/portfolio?period=1J&history=contributions');
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: 'invalid',
    message: 'Die gespeicherten Risikoparameter sind ungültig. Bitte das Regelwerk prüfen.',
  });
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
});
it('real account and Heute routes expose the same current source choices without changing native cash or stored bytes', async () => {
  const before = opened.sqlite.serialize();
  const listed = await read<Listed>('/accounts');
  const today = await read<Today>('/heute?month=2026-08');
  expect(listed.netWorthEurCents).toBeNull();
  expect(listed.accounts[0]).toMatchObject({
    balanceCents: 12345,
    valueEurCents: null,
    cashValuation: { eurCents: null },
  });
  expect(today.stand.today).toBe(DAY);
  expect(today.valuationSources).toEqual(listed.valuationSources);
  expect(today.attention.quoteReview).toEqual({ count: 1, securityIds: ['held'] });
  expect(listed.accounts[0]!.valuationSources).toEqual(listed.valuationSources);
  expect(listed.valuationSources.find((s) => s.securityId === 'held')).toMatchObject({
    kind: 'missing',
    missing: 'price',
    currency: 'USD',
  });
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
});
it('fresh quotes resolve only quote work; missing FX remains unknown until an actual dated stored FX exists', async () => {
  opened.db
    .insert(schema.price)
    .values({
      securityId: 'held',
      date: DAY,
      priceMicro: 120000000,
      currency: 'USD',
      source: 'manual',
    })
    .run();
  expect((await read<Today>('/heute')).attention.quoteReview.count).toBe(0);
  expect((await read<Listed>('/accounts')).netWorthEurCents).toBeNull();
  opened.db
    .insert(schema.fxRate)
    .values({ currency: 'USD', date: '2026-09-19', rateMicro: 950000, source: 'ecb' })
    .run();
  const listed = await read<Listed>('/accounts');
  // Native cash12345×.95=11728; security12000×.95=11400, rounded at their existing boundaries.
  expect(listed.netWorthEurCents).toBe(23128);
  expect(listed.valuationSources.find((s) => s.securityId === 'held')).toMatchObject({
    kind: 'quote',
    date: DAY,
    currency: 'USD',
    missing: null,
    fx: { kind: 'rate', date: '2026-09-19', source: 'ecb' },
  });
});
it('the same exact response retains native cash during source removal and request-memo invalidation', async () => {
  opened.db
    .insert(schema.price)
    .values({
      securityId: 'held',
      date: '2026-09-12',
      priceMicro: 120000000,
      currency: 'USD',
      source: 'manual',
    })
    .run();
  expect((await read<Today>('/heute')).attention.quoteReview.count).toBe(1);
  opened.db.delete(schema.price).where(eq(schema.price.securityId, 'held')).run();
  const listed = await read<Listed>('/accounts');
  expect(listed.accounts[0]!.balanceCents).toBe(12345);
  expect(listed.netWorthEurCents).toBeNull();
  expect(listed.valuationSources.find((s) => s.securityId === 'held')?.kind).toBe('missing');
});

it('the actual YNAB two-decimal EUR boundary rejects extra precision and unsafe values without inventing an API milliunit adapter', () => {
  expect(parseAmount('€12,34')).toBe(1234);
  expect(parseAmount('-€12,34')).toBe(-1234);
  expect(parseAmount('€0,01')).toBe(1);
  for (const raw of ['€0,001', '€1,234', 'USD12.34', '1234', '€90071992547409,92'])
    expect(parseAmount(raw)).toBeNull();
});

function apiAggregateCash(values: readonly number[]) {
  opened.db
    .update(schema.account)
    .set({ currency: 'EUR', openingBalanceCents: 0 })
    .where(eq(schema.account.id, 'depot'))
    .run();
  opened.db.update(schema.holding).set({ unitsE8: 0 }).where(eq(schema.holding.id, 'h')).run();
  values.forEach((openingBalanceCents, index) => {
    opened.db
      .insert(schema.account)
      .values({
        id: `aggregate-${index}`,
        name: `Synthetic aggregate ${index}`,
        type: 'checking',
        role: 'budget',
        onBudget: false,
        openingDate: DAY,
        openingBalanceCents,
        sortOrder: index + 1,
      })
      .run();
  });
}
it('actual account DTO retains the literal2 cancellation instead of serializing a lost cent', async () => {
  apiAggregateCash([9007199254740991, 2, -9007199254740991]);
  const before = opened.sqlite.serialize();
  const listed = await read<Listed>('/accounts');
  expect(listed.netWorthEurCents).toBe(2);
  expect(
    listed.accounts
      .filter((row) => row.id.startsWith('aggregate-'))
      .map((row) => row.valueEurCents),
  ).toEqual([9007199254740991, 2, -9007199254740991]);
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
});
it('actual debt aggregate stays200/null with known safe rows instead of a strict overall422', async () => {
  apiAggregateCash([-9007199254740991, -1]);
  const before = opened.sqlite.serialize();
  const response = await app.request('/api/wealth/debts');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const body = await response.json();
  expect(body).toMatchObject({
    totalEurCents: null,
    unavailableReason: 'calculation_limit',
    accounts: [
      { id: 'aggregate-0', owedEurCents: 9007199254740991, unavailableReason: null },
      { id: 'aggregate-1', owedEurCents: 1, unavailableReason: null },
    ],
  });
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
});
it('actual owed aggregate stays unavailable even when an asset offsets net worth to literal−2', async () => {
  apiAggregateCash([9007199254740991, -9007199254740991, -2]);
  const before = opened.sqlite.serialize();
  expect((await read<Listed>('/accounts')).netWorthEurCents).toBe(-2);
  const response = await app.request('/api/wealth/debts');
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    totalEurCents: null,
    unavailableReason: 'calculation_limit',
    accounts: [
      { id: 'aggregate-1', owedEurCents: 9007199254740991, unavailableReason: null },
      { id: 'aggregate-2', owedEurCents: 2, unavailableReason: null },
    ],
  });
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
});
