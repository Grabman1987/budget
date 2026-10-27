import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, fxRate, holding, price, security } from '../schema';
import { netWorthAssetComposition } from './networth-composition';
import { netWorthAsOf, netWorthDaily } from './portfolio';
import { createTransfer } from './bookings';
import { undo } from './audit';

let opened: OpenedDatabase;
beforeEach(() => { opened = createTestDatabase(); });
afterEach(() => opened.close());
const add = (id: string, type: 'checking' | 'brokerage' | 'p2p', amount: number, currency = 'EUR') =>
  opened.db.insert(account).values({ id, name: id, type, role: 'investment', onBudget: false,
    currency, openingDate: '2026-01-01', openingBalanceCents: amount }).run();

it('partitions separately rounded cash and holding FX, not a re-rounded native subtotal', () => {
  add('usd', 'brokerage', 1, 'USD');
  opened.db.insert(security).values({ id: 's', name: 's', kind: 'stock', currency: 'USD' }).run();
  opened.db.insert(holding).values({ id: 'h', accountId: 'usd', securityId: 's', asOf: '2026-01-01', unitsE8: 100_000_000 }).run();
  opened.db.insert(price).values({ securityId: 's', date: '2026-01-01', priceMicro: 10_000, currency: 'USD', source: 'manual' }).run();
  opened.db.insert(fxRate).values({ date: '2026-01-01', currency: 'USD', rateMicro: 500_000 }).run();
  const result = netWorthAssetComposition(opened.db, '2026-01-01', '2026-01-01');
  // Each independent USD cent rounds to one EUR cent:1+1=2, not round(2*0.5)=1.
  expect(result.current.totalCents).toBe(2);
  expect(result.current.groups.find((g) => g.key === 'depot_cash')?.valueCents).toBe(1);
  expect(result.current.groups.find((g) => g.key === 'securities')?.valueCents).toBe(1);
  expect(netWorthAsOf(opened.db, '2026-01-01').totalCents).toBe(2);
});
it('retains manual fallback and true month-end/start/as-of anchors including one day', () => {
  add('manual', 'p2p', 7_000);
  const result = netWorthAssetComposition(opened.db, '2026-01-15', '2026-03-01');
  expect(result.history.map((p) => [p.asOf, p.pointKind])).toEqual([
    ['2026-01-15', 'period_start'], ['2026-01-31', 'month_end'], ['2026-02-28', 'month_end'], ['2026-03-01', 'as_of'],
  ]);
  for (const p of result.history) {
    expect(p.groups.find((g) => g.key === 'other')?.valueCents).toBe(7_000);
    expect(p.groups.reduce((sum, g) => sum + g.valueCents!, 0)).toBe(7_000);
    expect(p.totalCents).toBe(netWorthAsOf(opened.db, p.asOf).totalCents);
  }
  expect(result.current).toEqual(result.history.at(-1));
  expect(netWorthAssetComposition(opened.db, '2026-03-01', '2026-03-01').history).toHaveLength(1);
});
it('an existing transfer changes groups only; one canonical Undo restores both and Gespart', () => {
  add('cash', 'checking', 10_000); add('depot', 'brokerage', 0);
  const before = netWorthAssetComposition(opened.db, '2026-01-01', '2026-01-03');
  const savedBefore = netWorthDaily(opened.db, '2026-01-02', '2026-01-03');
  createTransfer(opened.db, { fromAccountId: 'cash', toAccountId: 'depot', date: '2026-01-02', amountCents: 2_500 }, { actor: '550-test', groupId: '550-transfer' });
  const after = netWorthAssetComposition(opened.db, '2026-01-01', '2026-01-03');
  expect(after.current.groups.find((g) => g.key === 'cash')?.valueCents).toBe(7_500);
  expect(after.current.groups.find((g) => g.key === 'depot_cash')?.valueCents).toBe(2_500);
  expect(after.current.totalCents).toBe(10_000);
  expect(netWorthDaily(opened.db, '2026-01-02', '2026-01-03')).toEqual(savedBefore);
  undo(opened.db, { groupId: '550-transfer' }, { actor: '550-test' });
  expect(netWorthAssetComposition(opened.db, '2026-01-01', '2026-01-03')).toEqual(before);
});

it('preserves missing FX as a null composition gap and the existing strict read refusal', () => {
  add('missing-fx', 'brokerage', 1, 'CHF');
  const point = netWorthAssetComposition(opened.db, '2026-01-01', '2026-01-01').current;
  expect(point.totalCents).toBeNull();
  expect(point.complete).toBe(false);
  expect(point.groups.find((g) => g.key === 'unclassified')?.valueCents).toBeNull();
  expect(point.gaps).toMatchObject([{ accountId: 'missing-fx', missing: 'fx' }]);
  expect(point.groups.every((g) => g.shareBp === null)).toBe(true);
  expect(() => netWorthAsOf(opened.db, '2026-01-01')).toThrow(/CHF/);
});
