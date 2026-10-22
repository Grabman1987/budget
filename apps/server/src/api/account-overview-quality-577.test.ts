import { createTestDatabase, schema } from '@budget/db';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createLedgerApi } from './index';

interface Series {
  points: Array<{ date: string; balanceCents: number; valuation: { eurCents: number | null } }>;
}
interface Batch {
  series: Record<string, Series>;
  quality?: Record<
    string,
    Record<
      string,
      {
        source: 'native_cash' | 'account_value_eur';
        currency: string;
        known: boolean;
        quality: 'exact' | 'stale' | 'estimated' | 'missing';
        missing: 'price' | 'fx' | null;
      }
    >
  >;
}
let opened: ReturnType<typeof createTestDatabase>;
let api: ReturnType<typeof createLedgerApi>;
const range = 'from=2026-10-01&to=2026-10-03';

beforeEach(() => {
  opened = createTestDatabase();
  const { db } = opened;
  db.insert(schema.account)
    .values([
      {
        id: 'cash',
        name: 'Synthetic cash',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-10-02',
        openingBalanceCents: 12000,
      },
      {
        id: 'zero',
        name: 'Synthetic zero',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-10-01',
      },
      {
        id: 'usd',
        name: 'Synthetic native USD',
        type: 'checking',
        role: 'investment',
        onBudget: false,
        currency: 'USD',
        openingDate: '2026-10-01',
        openingBalanceCents: 4321,
      },
      ...['priced', 'cost', 'missing', 'foreign'].map((id) => ({
        id,
        name: `Synthetic ${id}`,
        type: 'brokerage' as const,
        role: 'investment' as const,
        onBudget: false,
        openingDate: '2026-09-01',
      })),
    ])
    .run();
  db.insert(schema.security)
    .values(
      ['priced', 'cost', 'missing', 'foreign'].map((id) => ({
        id,
        name: `Synthetic ${id}`,
        kind: 'etf' as const,
        currency: id === 'foreign' ? 'USD' : 'EUR',
      })),
    )
    .run();
  db.insert(schema.holding)
    .values(
      ['priced', 'cost', 'missing'].map((id) => ({
        id: `h-${id}`,
        accountId: id,
        securityId: id,
        asOf: '2026-09-01',
        unitsE8: 100000000,
        ...(id === 'cost' ? { costBasisCents: 700 } : {}),
      })),
    )
    .run();
  db.insert(schema.price)
    .values([
      {
        securityId: 'priced',
        date: '2026-10-01',
        priceMicro: 12000000,
        currency: 'EUR',
        source: 'manual',
      },
      {
        securityId: 'foreign',
        date: '2026-10-01',
        priceMicro: 12000000,
        currency: 'USD',
        source: 'manual',
      },
    ])
    .run();
  api = createLedgerApi({ db, today: () => '2026-10-10', stepUp: async (_c, next) => next() });
});
afterEach(() => opened.close());

async function batch(extra = ''): Promise<Batch> {
  const response = await api.request(`/accounts/series?${range}${extra}`);
  const payload: unknown = await response.json();
  expect(response.status, JSON.stringify(payload)).toBe(200);
  return payload as Batch;
}

it('adds opt-in sibling evidence while preserving every default batch/single series and all stored records', async () => {
  const before = {
    accounts: opened.db.select().from(schema.account).all(),
    bookings: opened.db.select().from(schema.booking).all(),
    audit: opened.db.select().from(schema.auditLog).all(),
  };
  const legacy = await batch();
  expect(Object.hasOwn(legacy, 'quality')).toBe(false);
  const enriched = await batch('&quality=1');
  expect(enriched.series).toEqual(legacy.series);
  expect(Object.keys(enriched.quality ?? {}).sort()).toEqual(Object.keys(legacy.series).sort());
  for (const id of Object.keys(legacy.series)) {
    const response = await api.request(`/accounts/${id}/series?${range}`);
    expect(response.status).toBe(200);
    const single = (await response.json()) as Series;
    expect(single.points).toEqual(legacy.series[id]?.points);
    expect(Object.hasOwn(single, 'quality')).toBe(false);
  }
  expect(enriched.series['priced']?.points.map((p) => p.balanceCents)).toEqual([1200, 1200, 1200]);
  expect({
    accounts: opened.db.select().from(schema.account).all(),
    bookings: opened.db.select().from(schema.booking).all(),
    audit: opened.db.select().from(schema.auditLog).all(),
  }).toEqual(before);
});

it('distinguishes not-yet-open, genuine zero, missing valuation and known native cash without EUR FX', async () => {
  const result = await batch('&quality=1');
  const quality = result.quality;
  expect(quality?.['cash']?.['2026-10-01']).toMatchObject({ known: false, source: 'native_cash' });
  expect(quality?.['cash']?.['2026-10-02']).toMatchObject({ known: true, currency: 'EUR' });
  expect(result.series['zero']?.points.map((p) => p.balanceCents)).toEqual([0, 0, 0]);
  expect(quality?.['zero']?.['2026-10-03']).toEqual({
    source: 'native_cash',
    currency: 'EUR',
    known: true,
    quality: 'exact',
    missing: null,
  });
  expect(result.series['usd']?.points.at(-1)).toMatchObject({
    balanceCents: 4321,
    valuation: { eurCents: null },
  });
  expect(quality?.['usd']?.['2026-10-03']).toEqual({
    source: 'native_cash',
    currency: 'USD',
    known: true,
    quality: 'exact',
    missing: null,
  });
  expect(quality?.['missing']?.['2026-10-03']).toMatchObject({
    source: 'account_value_eur',
    known: false,
    missing: 'price',
  });
  // A foreign security without FX fails the existing entire series read closed;
  // it cannot be a successful metadata fixture or a fabricated zero valuation.
  opened.db
    .insert(schema.holding)
    .values({
      id: 'h-foreign',
      accountId: 'foreign',
      securityId: 'foreign',
      asOf: '2026-09-01',
      unitsE8: 100000000,
    })
    .run();
  for (const extra of ['', '&quality=1']) {
    const response = await api.request(`/accounts/series?${range}${extra}`);
    const payload: unknown = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(503);
    expect(payload).toMatchObject({
      error: 'valuation_unavailable',
      missingFxCurrencies: ['USD'],
      asOf: '2026-10-01',
    });
    expect(payload).not.toHaveProperty('series');
    expect(payload).not.toHaveProperty('quality');
  }
});

it('retains actual cost-estimate and carried-quote provenance instead of manufacturing exact quality', async () => {
  const result = await batch('&quality=1');
  expect(result.series['cost']?.points.map((p) => p.balanceCents)).toEqual([700, 700, 700]);
  expect(result.quality?.['cost']?.['2026-10-03']).toMatchObject({
    known: true,
    quality: 'estimated',
    missing: null,
  });
  expect(result.quality?.['priced']?.['2026-10-01']).toMatchObject({
    known: true,
    quality: 'exact',
  });
  expect(result.quality?.['priced']?.['2026-10-03']).toMatchObject({
    known: true,
    quality: 'exact',
  });
  const response = await api.request('/accounts/series?from=2026-10-09&to=2026-10-10&quality=1');
  expect(response.status).toBe(200);
  const carried = (await response.json()) as Batch;
  expect(carried.quality?.['priced']?.['2026-10-09']).toMatchObject({
    known: true,
    quality: 'stale',
  });
});

it('rejects malformed or repeated opt-in flags and unrecognised enriched keys', async () => {
  for (const query of [
    'quality=',
    'quality=0',
    'quality=true',
    'quality=1&quality=1',
    'quality=1&quality=0',
    'quality=1&unexpected=1',
  ]) {
    const response = await api.request(`/accounts/series?${range}&${query}`);
    expect(response.status, query).toBe(400);
  }
  const response = await api.request(`/accounts/series?${range}&quality=1`);
  expect(response.status).toBe(200);
});
