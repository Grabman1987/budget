import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { holdingValuesAsOf, netWorthAsOf } from './portfolio';
import { seedBasics } from './test-helpers';

let opened: OpenedDatabase;

beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db); // giro 1.000 € on-budget, spar, usd (a USD account)
  opened.sqlite.exec(`
    INSERT INTO account (id, name, type, role, on_budget, opening_date, sort_order) VALUES
      ('d1', 'Depot 1', 'brokerage', 'investment', 0, '2023-10-01', 4),
      ('d2', 'Depot 2', 'brokerage', 'investment', 0, '2023-10-01', 5);
    INSERT INTO security (id, name, kind, currency) VALUES ('us', 'US-Aktie', 'stock', 'USD');
    INSERT INTO holding (id, security_id, account_id, as_of, units_e8) VALUES
      ('h1', 'us', 'd1', '2026-01-01', 1000000000);
    INSERT INTO trade (id, security_id, account_id, date, kind, units_e8, amount_cents, import_key) VALUES
      ('t1', 'us', 'd2', '2026-02-10', 'buy', 250000000, 50000, 't1'),
      ('t2', 'us', 'd1', '2026-02-11', 'sell', -200000000, 40000, 't2');
    INSERT INTO price (security_id, date, price_micro, currency, source) VALUES
      ('us', '2026-02-27', 200000000, 'USD', 'yfinance');
    INSERT INTO fx_rate (date, currency, rate_micro) VALUES ('2026-02-27', 'USD', 925000);
    INSERT INTO booking (id, account_id, date, amount_cents, currency) VALUES ('b1', 'usd', '2026-02-01', 10000, 'USD');
    INSERT INTO booking_split (id, booking_id, amount_cents) VALUES ('s1', 'b1', 10000);`);
});

describe('C10 positions per account, valued in EUR with stored rates', () => {
  it('keys units by (account, security) and converts USD prices', () => {
    expect(holdingValuesAsOf(opened.db, '2026-02-28')).toEqual([
      // 8 units × 200 USD × 0,925 = 1.480,00 €; 2,5 units = 462,50 €.
      {
        accountId: 'd1',
        securityId: 'us',
        unitsE8: 800000000,
        priceMicro: 200000000,
        priceCurrency: 'USD',
        fxRateMicro: 925000,
        valueCents: 148000,
      },
      {
        accountId: 'd2',
        securityId: 'us',
        unitsE8: 250000000,
        priceMicro: 200000000,
        priceCurrency: 'USD',
        fxRateMicro: 925000,
        valueCents: 46250,
      },
    ]);
  });

  it('net worth converts foreign-currency accounts too; a missing rate is an error', () => {
    const nw = netWorthAsOf(opened.db, '2026-02-28');
    expect(nw.byAccount).toMatchObject({ giro: 100_000, usd: 9_250, d1: 148_000, d2: 46_250 });
    expect(nw.totalCents).toBe(100_000 + 9_250 + 148_000 + 46_250);
    expect(() => netWorthAsOf(opened.db, '2026-02-15')).toThrow(/exchange rate for USD/);
  });
});
