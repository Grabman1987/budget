import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { freedomHistory, freedomViewWithHistory } from './freedom-history';
import { freedomInvestmentBasis } from './freedom-inputs';
import { accounts } from './entities';
import { undo } from './audit';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  opened.sqlite.exec(`
    INSERT INTO account (id,name,type,role,on_budget,opening_date,opening_balance_cents) VALUES
      ('cash','Synthetic selected cash','brokerage','investment',0,'2023-11-10',10000),
      ('later','Synthetic later cash','brokerage','investment',0,'2024-02-01',5000);
    INSERT INTO security (id,name,kind,currency) VALUES ('fund','Synthetic USD fund','etf','USD');
    INSERT INTO holding (id,account_id,security_id,as_of,units_e8) VALUES
      ('h','cash','fund','2023-12-15',100000000);
    INSERT INTO price (security_id,date,price_micro,currency,source) VALUES
      ('fund','2024-01-01',100000000,'USD','manual');
    INSERT INTO fx_rate (currency,date,rate_micro) VALUES ('USD','2024-02-01',2000000);
  `);
});
afterEach(() => opened.close());

it('reads real month ends, literal missing-price/FX gaps and an exact separate current anchor without writes', () => {
  const before = opened.sqlite.prepare('SELECT total_changes() AS n').get();
  const history = freedomHistory(opened.db, '2024-03-15');
  expect(history).toEqual({
    availableFrom: '2023-11-10',
    monthEnds: [
      { date: '2023-10-31', investedCents: null },
      { date: '2023-11-30', investedCents: 10000 },
      { date: '2023-12-31', investedCents: null },
      { date: '2024-01-31', investedCents: null },
      { date: '2024-02-29', investedCents: 35000 },
    ],
    current: { date: '2024-03-15', investedCents: 35000 },
  });
  expect(history.monthEnds[1]?.investedCents).toBe(
    freedomInvestmentBasis(opened.db, '2023-11-30').investedCents,
  );
  expect(history.monthEnds.at(-1)?.investedCents).toBe(
    freedomInvestmentBasis(opened.db, '2024-02-29').investedCents,
  );
  expect(freedomViewWithHistory(opened.db, '2024-03-15').investedCents).toBe(35000);
  expect(opened.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(before);
});

it('applies current account selection retrospectively and existing audited undo restores all months', () => {
  accounts.update(
    opened.db,
    'cash',
    { allocationScope: 'excluded' },
    { actor: 'synthetic', groupId: 'scope-616' },
  );
  expect(freedomHistory(opened.db, '2024-03-15')).toMatchObject({
    availableFrom: '2024-02-01',
    monthEnds: [
      { date: '2023-10-31', investedCents: null },
      { date: '2023-11-30', investedCents: null },
      { date: '2023-12-31', investedCents: null },
      { date: '2024-01-31', investedCents: null },
      { date: '2024-02-29', investedCents: 5000 },
    ],
    current: { investedCents: 5000 },
  });
  undo(opened.db, { groupId: 'scope-616' }, { actor: 'synthetic' });
  expect(freedomHistory(opened.db, '2024-03-15').monthEnds.at(-1)?.investedCents).toBe(35000);
});

it('retains explicit zero after opening, but never invents history before ledger coverage or for no accounts', () => {
  opened.sqlite.exec("UPDATE account SET allocation_scope='excluded'");
  expect(freedomHistory(opened.db, '2023-11-30')).toEqual({
    availableFrom: '2023-11-10',
    monthEnds: [
      { date: '2023-10-31', investedCents: null },
      { date: '2023-11-30', investedCents: 0 },
    ],
    current: { date: '2023-11-30', investedCents: 0 },
  });
  opened.sqlite.exec("UPDATE account SET deleted_at='2024-03-01'");
  expect(freedomHistory(opened.db, '2023-11-30').availableFrom).toBe('2023-11-10');
  const empty = createTestDatabase();
  try {
    expect(freedomHistory(empty.db, '2023-10-31')).toEqual({
      availableFrom: null,
      monthEnds: [{ date: '2023-10-31', investedCents: null }],
      current: { date: '2023-10-31', investedCents: 0 },
    });
  } finally {
    empty.close();
  }
  expect(freedomHistory(opened.db, '2023-09-30').monthEnds).toEqual([]);
});

it('keeps known past values when current FX is unavailable, and rejects unsafe sums without rounding', () => {
  opened.sqlite.exec(`
    INSERT INTO account (id,name,type,role,currency,on_budget,opening_date,opening_balance_cents)
    VALUES ('fx','Synthetic CHF cash','brokerage','investment','CHF',0,'2024-03-01',100);
  `);
  expect(freedomHistory(opened.db, '2024-03-15')).toMatchObject({
    monthEnds: expect.arrayContaining([{ date: '2024-02-29', investedCents: 35000 }]),
    current: { investedCents: null },
  });
  opened.sqlite.exec("UPDATE account SET allocation_scope='excluded' WHERE id='fx'");
  opened.sqlite
    .prepare('UPDATE account SET opening_balance_cents=? WHERE id=?')
    .run(Number.MAX_SAFE_INTEGER, 'later');
  expect(freedomHistory(opened.db, '2024-03-15').monthEnds.at(-1)?.investedCents).toBeNull();
});
