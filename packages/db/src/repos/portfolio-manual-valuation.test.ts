import { addDays, eachDay } from '@budget/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { netWorthAsOf, netWorthDaily } from './portfolio';
import { seedBasics } from './test-helpers';

const FROM = '2026-02-01';
const TO = '2026-04-30';
let opened: OpenedDatabase;

beforeAll(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  const sql: string[] = [
    `INSERT INTO account (id, name, type, role, on_budget, opening_date, opening_balance_cents, sort_order, currency) VALUES
      ('dep', 'Depot', 'brokerage', 'investment', 0, '2023-10-01', 0, 10, 'EUR'),
      ('p2p', 'P2P', 'p2p', 'investment', 0, '2023-10-01', 50000, 11, 'EUR'),
      ('p2pusd', 'P2P USD', 'p2p', 'investment', 0, '2026-02-10', 10000, 12, 'USD'),
      ('asset', 'Sachwert', 'other_asset', 'investment', 0, '2026-01-01', 0, 13, 'EUR'),
      ('nov', 'Ohne Bewertung', 'p2p', 'investment', 0, '2023-10-01', 7000, 14, 'EUR')`,
    `INSERT INTO security (id, name, kind, currency) VALUES ('etf', 'ETF', 'etf', 'EUR')`,
    `INSERT INTO trade (id, security_id, account_id, date, kind, units_e8, amount_cents, fee_cents, tax_cents, import_key)
      VALUES ('t1', 'etf', 'dep', '2026-02-20', 'buy', 1000000000, 100000, 0, 0, 'k1')`,
    `INSERT INTO price (security_id, date, price_micro, currency, source) VALUES
      ('etf', '2026-02-01', 90000000, 'EUR', 'import'), ('etf', '2026-03-15', 95000000, 'EUR', 'import')`,
    // Valuations before, inside and after the window; one soft-deleted; one for a USD account.
    `INSERT INTO valuation (id, account_id, date, value_cents) VALUES
      ('v1', 'p2p', '2026-01-15', 60000), ('v2', 'p2p', '2026-03-10', 65000),
      ('v3', 'p2p', '2026-03-20', 0), ('v4', 'p2p', '2026-06-01', 99999),
      ('v5', 'p2pusd', '2026-03-01', 20000), ('v6', 'asset', '2026-02-15', 30000),
      ('v7', 'p2p', '2026-04-05', 70000)`,
    `UPDATE valuation SET deleted_at = '2026-04-01 00:00:00' WHERE id = 'v7'`,
    `INSERT INTO booking (id, account_id, date, amount_cents) VALUES
      ('b1', 'giro', '2026-02-12', -5000), ('b2', 'p2p', '2026-02-12', 1000),
      ('b3', 'p2p', '2026-04-20', 500), ('b4', 'dep', '2026-02-20', -100000)`,
  ];
  for (let d = '2026-01-01'; d <= TO; d = addDays(d, 7))
    sql.push(
      `INSERT INTO fx_rate (date, currency, rate_micro) VALUES ('${d}', 'USD', ${900_000 + (d.charCodeAt(9) % 7) * 10_000})`,
    );
  opened.sqlite.exec(sql.join(';\n'));
});

describe('netWorthDaily with manual valuations', () => {
  it('equals netWorthAsOf on every day of the window', () => {
    const daily = netWorthDaily(opened.db, FROM, TO);
    const days = eachDay(FROM, TO);
    expect(daily.map((d) => d.date)).toEqual(days);
    for (const row of daily)
      expect(row.netWorthCents, row.date).toBe(netWorthAsOf(opened.db, row.date).totalCents);
    // The valuations really matter: the series differs from the plain cash view.
    expect(new Set(daily.map((d) => d.netWorthCents)).size).toBeGreaterThan(5);
  });
});
