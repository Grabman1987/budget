import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { netWorthAssetComposition } from './networth-composition';
import { netWorthAsOf, netWorthCompositionSource, netWorthDaily } from './portfolio';
import { createTransfer } from './bookings';
import { undo } from './audit';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
});
afterEach(() => opened.close());
const groups = (date = '2026-02-28') => netWorthAssetComposition(opened.db, date, date).current;
function seed() {
  opened.sqlite.exec(`
    INSERT INTO account (id,name,type,role,on_budget,opening_date,opening_balance_cents,currency) VALUES
      ('bank','Bank','checking','reserve',0,'2026-01-01',100000,'EUR'),
      ('ref','Verrechnung','checking','reserve',0,'2026-01-01',20000,'EUR'),
      ('dep','Depot','brokerage','investment',0,'2026-01-01',1000,'EUR'),
      ('coin','Coin','crypto','investment',0,'2026-01-01',0,'EUR'),
      ('manual','Manuell','p2p','investment',0,'2026-01-01',30000,'EUR'),
      ('fallback','Ohne Bewertung','other_asset','investment',0,'2026-01-01',7000,'EUR'),
      ('loan','Kredit','loan','debt',0,'2026-01-01',-20000,'EUR');
    UPDATE account SET reference_account_id='ref' WHERE id='dep';
    INSERT INTO security (id,name,kind,currency) VALUES ('stock','Aktie','stock','USD'),('crypto','Krypto','crypto','EUR');
    INSERT INTO holding (id,security_id,account_id,as_of,units_e8) VALUES ('s','stock','dep','2026-01-01',100000000),('c','crypto','coin','2026-01-01',100000000);
    INSERT INTO price (security_id,date,price_micro,currency,source) VALUES
      ('stock','2026-01-01',100000000,'USD','manual'),('stock','2026-02-28',110000000,'USD','manual'),
      ('crypto','2026-01-01',50000000,'EUR','manual'),('crypto','2026-02-28',60000000,'EUR','manual');
    INSERT INTO fx_rate (date,currency,rate_micro) VALUES ('2026-01-01','USD',900000),('2026-02-28','USD',925000);
    INSERT INTO valuation (id,account_id,date,value_cents) VALUES ('m1','manual','2026-01-01',40000),('m2','manual','2026-02-15',45000);
  `);
}

describe('composition from the canonical dated producer #550/#551', () => {
  it('conserves literal dated cash, holdings, manual fallback and reference cash once', () => {
    seed();
    const result = netWorthAssetComposition(opened.db, '2026-01-17', '2026-02-28');
    expect(result.history.map((p) => [p.asOf, p.pointKind, p.totalCents])).toEqual([
      ['2026-01-17', 'period_start', 162000],
      ['2026-01-31', 'month_end', 162000],
      ['2026-02-28', 'as_of', 169175],
    ]);
    expect(result.current).toBe(result.history.at(-1));
    expect(result.current.groups.map((g) => [g.key, g.valueCents])).toEqual([
      ['cash', 100000],
      ['securities', 10175],
      ['depot_cash', 21000],
      ['crypto', 6000],
      ['other', 52000],
      ['debt', -20000],
    ]);
    expect(result.current.accounts.find((a) => a.accountId === 'dep')?.valueCents).toBe(11175);
    for (const point of result.history) {
      expect(point.totalCents).toBe(netWorthAsOf(opened.db, point.asOf).totalCents);
      expect(point.groups.reduce((sum, g) => sum + g.valueCents!, 0)).toBe(point.totalCents);
      expect(point.accounts.reduce((sum, a) => sum + a.valueCents!, 0)).toBe(point.totalCents);
    }
  });

  it('preserves per-component FX rounding: two half-cent holdings are two cents', () => {
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date,opening_balance_cents,currency) VALUES ('d','Depot','brokerage','investment',0,'2026-02-01',1,'USD');
      INSERT INTO security (id,name,kind,currency) VALUES ('x','X','stock','USD'),('y','Y','stock','USD');
      INSERT INTO holding (id,security_id,account_id,as_of,units_e8) VALUES ('x','x','d','2026-02-01',100000000),('y','y','d','2026-02-01',100000000);
      INSERT INTO price (security_id,date,price_micro,currency,source) VALUES ('x','2026-02-28',10000,'USD','manual'),('y','2026-02-28',10000,'USD','manual');
      INSERT INTO fx_rate (date,currency,rate_micro) VALUES ('2026-02-28','USD',500000);
    `);
    const point = groups();
    expect(
      netWorthCompositionSource(opened.db, '2026-02-28').components.map((c) => c.valueCents),
    ).toEqual([1, 1, 1]);
    expect(point.groups.find((g) => g.key === 'securities')?.valueCents).toBe(2);
    expect(point.groups.find((g) => g.key === 'depot_cash')?.valueCents).toBe(1);
    expect(point.totalCents).toBe(3);
    expect(netWorthAsOf(opened.db, '2026-02-28').totalCents).toBe(3);
  });

  it('does not invent valuations for a missing-price or missing-FX position', () => {
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date,opening_balance_cents) VALUES ('b','Bank','checking','reserve',0,'2026-02-01',10000),('d','Depot','brokerage','investment',0,'2026-02-01',0);
      INSERT INTO security (id,name,kind,currency) VALUES ('x','Ohne Kurs','stock','EUR'),('y','Ohne FX','stock','USD');
      INSERT INTO holding (id,security_id,account_id,as_of,units_e8) VALUES ('x','x','d','2026-02-01',100000000),('y','y','d','2026-02-01',100000000);
      INSERT INTO price (security_id,date,price_micro,currency,source) VALUES ('y','2026-02-28',1000000,'USD','manual');
    `);
    const point = groups();
    expect(point.totalCents).toBeNull();
    expect(point.knownCents).toBe(10000);
    expect(point.gaps.map((g) => [g.securityId, g.missing]).sort()).toEqual([
      ['x', 'price'],
      ['y', 'fx'],
    ]);
    expect(point.groups.at(-1)).toMatchObject({
      key: 'unclassified',
      valueCents: null,
      knownCents: 0,
    });
    expect(point.groups.every((g) => g.shareBp === null)).toBe(true);
  });

  it('an audited transfer changes only group composition, preserves Gespart, and Undo restores it', () => {
    seed();
    const before = groups();
    createTransfer(
      opened.db,
      { fromAccountId: 'bank', toAccountId: 'ref', date: '2026-02-28', amountCents: 12345 },
      { actor: 'test', groupId: 'composition-transfer' },
    );
    const moved = groups();
    expect(moved.groups.find((g) => g.key === 'cash')?.valueCents).toBe(87655);
    expect(moved.groups.find((g) => g.key === 'depot_cash')?.valueCents).toBe(33345);
    expect(moved.totalCents).toBe(169175);
    expect(netWorthDaily(opened.db, '2026-02-27', '2026-02-28').at(-1)?.ownCents).toBe(0);
    undo(opened.db, { groupId: 'composition-transfer' }, { actor: 'test' });
    expect(groups()).toEqual(before);
  });

  it('includes a one-day endpoint only once and labels partial final months explicitly', () => {
    seed();
    expect(
      netWorthAssetComposition(opened.db, '2026-02-17', '2026-02-17').history.map((p) => [
        p.asOf,
        p.pointKind,
      ]),
    ).toEqual([['2026-02-17', 'as_of']]);
    expect(
      netWorthAssetComposition(opened.db, '2026-01-31', '2026-03-14').history.map((p) => [
        p.asOf,
        p.pointKind,
      ]),
    ).toEqual([
      ['2026-01-31', 'period_start'],
      ['2026-02-28', 'month_end'],
      ['2026-03-14', 'as_of'],
    ]);
  });
});
