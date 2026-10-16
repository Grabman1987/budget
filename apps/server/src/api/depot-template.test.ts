import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, portfolioPositions, schema, type Db } from '@budget/db';
import { depotHoldings } from '../../../web/src/ledger/depot-model';

let db: Db;
let close: () => void;
const DAY = '2026-09-17';
beforeEach(() => {
  ({ db, close } = createTestDatabase());
  db.insert(schema.account)
    .values(
      ['a', 'b'].map((id) => ({
        id,
        name: `Testdepot ${id}`,
        type: 'brokerage' as const,
        role: 'investment' as const,
        onBudget: false,
        openingDate: '2026-01-01',
      })),
    )
    .run();
  db.insert(schema.security)
    .values(
      ['s', 't'].map((id) => ({
        id,
        name: `Testinstrument ${id}`,
        kind: 'stock' as const,
        currency: 'EUR',
      })),
    )
    .run();
  db.insert(schema.holding)
    .values([
      { id: 'as', accountId: 'a', securityId: 's', asOf: DAY, unitsE8: 125_000_000 },
      { id: 'at', accountId: 'a', securityId: 't', asOf: DAY, unitsE8: 250_000_000 },
      { id: 'bs', accountId: 'b', securityId: 's', asOf: DAY, unitsE8: 75_000_000 },
    ])
    .run();
});
afterEach(() => close());

it('depot rows conserve literal cents and units of Portfolio at its valuation date', () => {
  db.insert(schema.price)
    .values([
      { securityId: 's', date: DAY, priceMicro: 12_340_000, currency: 'EUR', source: 'manual' },
      { securityId: 't', date: DAY, priceMicro: 4_560_000, currency: 'EUR', source: 'manual' },
      {
        securityId: 's',
        date: '2026-09-18',
        priceMicro: 99_000_000,
        currency: 'EUR',
        source: 'manual',
      },
    ])
    .run();
  const portfolio = portfolioPositions(db, DAY);
  const depot = depotHoldings(portfolio, 'a');
  // Independently: 1.25 × EUR 12.34 = 1542.5 cents, rounded 1543;
  // 2.5 × EUR 4.56 = 1140 cents; depot 2683; other depot .75 × 12.34 = 926.
  expect(depot.valueCents).toBe(2683);
  expect(depot.rows.map((r) => r.valueCents).sort()).toEqual([1140, 1543]);
  expect(depot.rows.reduce((sum, r) => sum + r.valueCents!, 0)).toBe(depot.valueCents);
  expect(depot.asOf).toBe(portfolio.asOf);
  expect(depot.asOf).toBe(DAY);
  expect(depot.incomplete).toBe(false);
  expect(portfolio.valueCents).toBe(3609);
  expect(depot.valueCents! + depotHoldings(portfolio, 'b').valueCents!).toBe(portfolio.valueCents);
  for (const row of depot.rows) {
    expect(row.unitsE8).toBe(
      portfolio.positions
        .find((p) => p.securityId === row.securityId)!
        .accounts.find((a) => a.accountId === 'a')!.unitsE8,
    );
    expect(Number.isSafeInteger(row.valueCents)).toBe(true);
  }
  expect(depot.rows.map((r) => r.unitsE8).sort()).toEqual([125_000_000, 250_000_000]);
  expect(depot.rows.reduce((sum, r) => sum + r.shareBp!, 0)).toBe(10000);
});

it('missing price flags the row and leaves depot value unavailable instead of zero', () => {
  const depot = depotHoldings(portfolioPositions(db, DAY), 'a');
  expect(depot.valueCents).toBeNull();
  expect(depot.incomplete).toBe(true);
  expect(depot.rows).toHaveLength(2);
  expect(depot.rows[0]).toMatchObject({
    valueStatus: 'missing_price',
    valueCents: null,
    shareBp: null,
  });
});

it('shows the known sum as an approximate depot value when only some prices are missing', () => {
  db.insert(schema.price)
    .values({
      securityId: 't',
      date: DAY,
      priceMicro: 4_560_000,
      currency: 'EUR',
      source: 'manual',
    })
    .run();
  const depot = depotHoldings(portfolioPositions(db, DAY), 'a');
  // Independently: only t is priced, 2.5 × EUR 4.56 = 1140 cents; s stays unvalued, not 0.
  expect(depot.valueCents).toBe(1140);
  expect(depot.incomplete).toBe(true);
  expect(depot.rows.find((r) => r.securityId === 's')).toMatchObject({
    valueStatus: 'missing_price',
    valueCents: null,
    shareBp: null,
  });
  expect(depot.rows.every((r) => r.shareBp === null)).toBe(true);
});

it('uses the shared execution-price fallback for the displayed holding price', () => {
  db.insert(schema.trade)
    .values({
      id: 'trade',
      accountId: 'a',
      securityId: 's',
      date: DAY,
      kind: 'buy',
      unitsE8: 100_000_000,
      amountCents: 2000,
      feeCents: 99,
      taxCents: 0,
    })
    .run();
  const depot = depotHoldings(portfolioPositions(db, DAY), 'a');
  expect(depot.rows.find((r) => r.securityId === 's')).toMatchObject({
    valueStatus: 'known',
    quote: { priceMicro: 20_000_000, currency: 'EUR', date: DAY },
  });
});
