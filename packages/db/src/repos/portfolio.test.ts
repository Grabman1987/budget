import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, booking, bookingSplit } from '../schema';
import { MissingFxRateError } from './errors';
import { holdingValuesAsOf, netWorthAsOf, netWorthValuationAsOf } from './portfolio';
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
    expect(() => netWorthAsOf(opened.db, '2026-02-15')).toThrow(MissingFxRateError);
  });

  it('returns literal per-account EUR values and an explicit unavailable result for missing cash FX', () => {
    const db = opened.db;
    const available = netWorthValuationAsOf(db, '2026-02-28');
    expect(available).toEqual({
      totalCents: 100_000 + 9_250 + 148_000 + 46_250,
      byAccount: { giro: 100_000, usd: 9_250, d1: 148_000, d2: 46_250, spar: 0 },
      holdingsByAccount: { d1: 148_000, d2: 46_250 },
      missingFxCurrencies: [],
      missingFxByAccount: {},
      missingPriceSecurityIds: [],
      missingPriceByAccount: {},
    });

    db.insert(account)
      .values({
        id: 'gbp-cash',
        name: 'GBP tracking',
        type: 'other_asset',
        role: 'investment',
        onBudget: false,
        currency: 'GBP',
        openingDate: '2023-10-01',
      })
      .run();
    db.insert(booking)
      .values({
        id: 'gbp-booking',
        accountId: 'gbp-cash',
        date: '2026-02-01',
        amountCents: 10_000,
        currency: 'GBP',
      })
      .run();
    db.insert(bookingSplit)
      .values({ id: 'gbp-split', bookingId: 'gbp-booking', amountCents: 10_000 })
      .run();
    const unavailable = netWorthValuationAsOf(db, '2026-02-28');
    expect(unavailable.totalCents).toBeNull();
    expect(unavailable.byAccount).toMatchObject({ usd: 9_250, 'gbp-cash': null });
    expect(unavailable.holdingsByAccount).toMatchObject({ d1: 148_000, d2: 46_250 });
    expect(unavailable.missingFxCurrencies).toEqual(['GBP']);
    expect(unavailable.missingFxByAccount).toEqual({ 'gbp-cash': ['GBP'] });
    expect(() => netWorthAsOf(db, '2026-02-28')).toThrow(MissingFxRateError);
  });

  it('marks security value unavailable for missing FX without hiding the missing currency', () => {
    opened.sqlite.exec(`
      INSERT INTO security (id, name, kind, currency) VALUES ('chf-security', 'CHF security', 'stock', 'CHF');
      INSERT INTO holding (id, security_id, account_id, as_of, units_e8) VALUES ('chf-holding', 'chf-security', 'd1', '2026-01-01', 1000000000);
      INSERT INTO price (security_id, date, price_micro, currency, source) VALUES ('chf-security', '2026-02-27', 100000000, 'CHF', 'manual');
    `);
    const valuation = netWorthValuationAsOf(opened.db, '2026-02-28');
    expect(valuation.totalCents).toBeNull();
    expect(valuation.byAccount.d1).toBeNull();
    expect(valuation.holdingsByAccount.d1).toBeNull();
    expect(valuation.missingFxCurrencies).toEqual(['CHF']);
    expect(() => netWorthAsOf(opened.db, '2026-02-28')).toThrow(MissingFxRateError);
  });

  it('keeps a held security without a quote explicitly unavailable', () => {
    opened.sqlite.exec(`
      INSERT INTO security (id, name, kind, currency) VALUES ('unpriced-chf-security', 'Unpriced', 'stock', 'CHF');
      INSERT INTO holding (id, security_id, account_id, as_of, units_e8) VALUES ('unpriced-chf-holding', 'unpriced-chf-security', 'd1', '2026-01-01', 1000000000);
    `);
    const valuation = netWorthValuationAsOf(opened.db, '2026-02-28');
    expect(valuation.totalCents).toBeNull();
    expect(valuation.missingFxCurrencies).toEqual([]);
    expect(valuation.holdingsByAccount.d1).toBeNull();
    expect(valuation.missingPriceSecurityIds).toEqual(['unpriced-chf-security']);
  });

  it('counts closed cash balances in the same shared net-worth values', () => {
    opened.sqlite.exec(`
      INSERT INTO account (id, name, type, role, on_budget, opening_date, sort_order, closed_at)
      VALUES ('closed-eur', 'Closed residual', 'checking', 'budget', 1, '2023-10-01', 7, '2026-02-20T00:00:00Z');
      INSERT INTO booking (id, account_id, date, amount_cents, currency) VALUES ('closed-booking', 'closed-eur', '2026-02-01', 12345, 'EUR');
      INSERT INTO booking_split (id, booking_id, amount_cents) VALUES ('closed-split', 'closed-booking', 12345);
    `);
    const value = netWorthValuationAsOf(opened.db, '2026-02-28');
    expect(value.byAccount['closed-eur']).toBe(12_345);
    expect(value.totalCents).toBe(100_000 + 9_250 + 148_000 + 46_250 + 12_345);
  });
});
