import { createTestDatabase, schema } from '@budget/db';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { wealthRoutes } from './wealth';
describe('GET /wealth/freedom', () => {
  it('exposes live asOf and source data independently of missing prices', async () => {
    const db = createTestDatabase().db;
    db.insert(schema.account)
      .values({
        id: 'invest',
        name: 'Anlage',
        type: 'brokerage',
        role: 'investment',
        currency: 'EUR',
        onBudget: false,
        openingDate: '2026-01-01',
        openingBalanceCents: 123_400,
      })
      .run();
    db.insert(schema.security)
      .values({ id: 'sec', name: 'Testanlage', kind: 'stock', currency: 'EUR' })
      .run();
    db.insert(schema.holding)
      .values({
        id: 'h',
        accountId: 'invest',
        securityId: 'sec',
        asOf: '2026-01-01',
        unitsE8: 100_000_000,
      })
      .run();
    const app = new Hono().route(
      '/wealth',
      wealthRoutes(db, () => '2026-10-01'),
    );
    const response = await app.request('/wealth/freedom');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      asOf: '2026-10-01',
      refMonth: '2026-09',
      months: [],
      annualSpendCents: 0,
      multiple: 25,
      targetCents: 0,
      investedCents: null,
      progressBp: null,
      defaultRealReturnBp: 500,
      accounts: [
        {
          id: 'invest',
          name: 'Anlage',
          valueCents: null,
          missingPrice: true,
          missingFxCurrencies: [],
        },
      ],
    });
  });
});
