import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { portfolioFlows } from './portfolio';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  opened.sqlite.exec(`
    INSERT INTO account (id, name, type, role, on_budget, opening_date, sort_order) VALUES
      ('d1', 'Depot 1', 'brokerage', 'investment', 0, '2023-10-01', 1),
      ('d2', 'Depot 2', 'brokerage', 'investment', 0, '2023-10-01', 2);
    INSERT INTO security (id, name, kind, currency) VALUES ('s', 'ETF', 'etf', 'EUR');
    INSERT INTO trade (id, security_id, account_id, date, kind, units_e8, amount_cents, import_key) VALUES
      ('a', 's', 'd1', '2026-02-01', 'delivery_in', 100000000, 50000, 'a'),
      ('b', 's', 'd1', '2026-03-01', 'delivery_out', -40000000, 21000, 'b'),
      ('c', 's', 'd2', '2026-03-01', 'delivery_in', 40000000, 21000, 'c');
  `);
});
afterEach(() => opened.close());

describe('depot view: deliveries are capital flows (as in Portfolio Performance)', () => {
  it('counts a delivery in as inflow and a delivery out as outflow at the stored amount', () => {
    expect(
      portfolioFlows(opened.db, {
        view: 'depot',
        accounts: ['d1'],
        referenceAccounts: ['d1'],
        from: '2026-01-01',
        to: '2026-12-31',
      }),
    ).toEqual([
      { date: '2026-02-01', cents: 50_000 },
      { date: '2026-03-01', cents: -21_000 },
    ]);
  });

  it('nets a transfer between two accounts of the same depot out', () => {
    const flows = portfolioFlows(opened.db, {
      view: 'depot',
      accounts: ['d1', 'd2'],
      referenceAccounts: ['d1', 'd2'],
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(flows).toEqual([{ date: '2026-02-01', cents: 50_000 }]);
  });

  it('only counts flows after the start day', () => {
    expect(
      portfolioFlows(opened.db, {
        view: 'depot',
        accounts: ['d1'],
        referenceAccounts: ['d1'],
        from: '2026-02-01',
        to: '2026-12-31',
      }),
    ).toEqual([{ date: '2026-03-01', cents: -21_000 }]);
  });
});
