import { expect, it } from 'vitest';
import type { SourceAmount, SourceOperation } from './read-source';
import { matchAggregatedSourceCash, planSourceRebuild, sourceBalancesAt } from './source-rebuild';

const asset = (id: string, value = '1'): SourceAmount => ({
  value,
  assetId: id,
  currencyId: null,
  cents: null,
});
const cash = (cents: number): SourceAmount => ({
  value: (cents / 100).toFixed(2),
  assetId: null,
  currencyId: 'eur',
  cents,
});
const tx = (
  id: string,
  amount: SourceAmount,
  flow = 'INCOMING',
  patch: Partial<SourceOperation['transactions'][number]> = {},
): SourceOperation['transactions'][number] => ({
  id,
  amount,
  flow,
  creditedAt: '2026-03-01T23:30:00Z',
  type: 'buy',
  walletId: id,
  fee: null,
  tradeFee: null,
  balanceAfter: null,
  tradeId: 'trade',
  compensates: null,
  ...patch,
});
const mappings = ['a', 'b'].map((id) => ({
  key: `asset:${id}`,
  accountId: 'depot',
  securityId: id,
}));
const prices = ['a', 'b'].map((id) => ({
  securityId: id,
  date: '2026-03-02',
  currency: 'EUR',
  priceMicro: 1000000,
}));
const plan = (op: SourceOperation, quotes = prices) =>
  planSourceRebuild([op], mappings, quotes, '2026-03-02', 'currency:eur', 'EUR');

it('splits fiat and fees by stored prices with conserved integer remainders and Vienna dates', () => {
  const result = plan({
    id: 'multi',
    type: 'index_buy',
    transactions: [
      tx('a', asset('a')),
      tx('b', asset('b')),
      tx('eur', cash(3), 'OUTGOING'),
      tx('fee', cash(1), 'OUTGOING', { type: 'fee', tradeId: null }),
    ],
  });
  expect(result.issues).toEqual([]);
  expect(result.trades.map((t) => [t.date, t.amountCents, t.feeCents, t.unitsE8])).toEqual([
    ['2026-03-02', 2, 1, 100000000],
    ['2026-03-02', 1, 0, 100000000],
  ]);
  expect(
    plan({
      id: 'swap',
      type: 'dust_swap',
      transactions: [tx('a', asset('a'), 'OUTGOING'), tx('b', asset('b'))],
    }).trades.map((t) => [t.kind, t.amountCents]),
  ).toEqual([
    ['sell', 100],
    ['buy', 100],
  ]);
  const unmappedSwap = plan({
    id: 'unmapped-swap',
    type: 'swap',
    transactions: [tx('a', asset('a'), 'OUTGOING'), tx('x', asset('x'))],
  });
  expect(unmappedSwap.trades.map((t) => [t.kind, t.amountCents])).toEqual([['sell', 100]]);
  expect(unmappedSwap.issues).toContainEqual({
    id: 'unmapped-swap',
    reason: 'unmapped_asset',
    key: 'asset:x',
    fiatEffectCents: -100,
  });
  const mixed = plan({
    id: 'rebalance',
    type: 'index_rebalancing',
    transactions: [
      tx('a', asset('a')),
      tx('b', asset('b'), 'OUTGOING'),
      tx('buy-cash', cash(80), 'OUTGOING'),
      tx('sell-cash', cash(90)),
    ],
  });
  expect(mixed.trades.map((t) => [t.kind, t.amountCents])).toEqual([
    ['buy', 80],
    ['sell', 90],
  ]);
  const net = plan({
    id: 'net',
    type: 'index_rebalancing',
    transactions: [tx('a', asset('a')), tx('b', asset('b'), 'OUTGOING'), tx('net-cash', cash(10))],
  });
  expect(net.trades.map((t) => [t.kind, t.amountCents])).toEqual([
    ['buy', 90],
    ['sell', 100],
  ]);
  const repeated = plan({
    id: 'lots',
    type: 'buy',
    transactions: [
      tx('a1', asset('a')),
      tx('a2', asset('a', '2')),
      tx('fee', asset('a', '0.1'), 'OUTGOING', { type: 'fee' }),
      tx('eur', cash(300), 'OUTGOING'),
    ],
  });
  expect(repeated.trades.map((t) => t.unitsE8)).toEqual([96666667, 193333333]);
  const repeatedInline: SourceOperation = {
    id: 'inline-lots',
    type: 'buy',
    transactions: [
      tx('a1', asset('a'), 'INCOMING', { tradeFee: asset('a', '0.1') }),
      tx('a2', asset('a', '2'), 'INCOMING', { tradeFee: asset('a', '0.1') }),
      tx('eur', cash(300), 'OUTGOING'),
    ],
  };
  expect(plan(repeatedInline).trades.map((t) => t.unitsE8)).toEqual([96666667, 193333333]);
  expect(sourceBalancesAt([repeatedInline], '2026-03-02').get('asset:a')).toBe(290000000);
  const dust = plan({
    id: 'dust',
    type: 'index_buy',
    transactions: [
      tx('a', asset('a', '0.00000001')),
      tx('b', asset('b', '0.00000002')),
      tx('cash', cash(1), 'OUTGOING'),
    ],
  });
  expect(dust.issues).toEqual([]);
  expect(dust.trades.map((t) => t.amountCents)).toEqual([0, 1]);
});

it('rejects imprecise units, rolls a failed multi-leg group back, and uses the seven-day reward price boundary', () => {
  const bad = plan({
    id: 'bad',
    type: 'buy',
    transactions: [tx('a', asset('a', '0.000000001')), tx('cash', cash(1), 'OUTGOING')],
  });
  expect(bad.trades).toEqual([]);
  expect(bad.issues[0]?.reason).toContain('precision');
  const outgoingReward = plan({
    id: 'bad-reward',
    type: 'reward',
    transactions: [tx('a', asset('a')), tx('b', asset('b'), 'OUTGOING')],
  });
  expect(outgoingReward.trades).toEqual([]);
  const reward = {
    id: 'reward',
    type: 'reward',
    transactions: [tx('a', asset('a'), 'INCOMING', { fee: asset('a', '0.1') })],
  };
  expect(plan(reward, [{ ...prices[0]!, date: '2026-02-23' }]).trades[0]).toMatchObject({
    kind: 'reward',
    amountCents: 90,
    unitsE8: 90000000,
  });
  expect(plan(reward, [{ ...prices[0]!, date: '2026-02-22' }]).trades[0]).toMatchObject({
    kind: 'delivery_in',
    amountCents: 0,
    unitsE8: 90000000,
  });
});

it('sums wallet snapshots and replays subsequent flows, exact dust, and repeated trade fees once', () => {
  const ops: SourceOperation[] = [
    {
      id: 'wallets',
      type: 'buy',
      transactions: [
        tx('a1', asset('a', '1'), 'INCOMING', {
          walletId: 'one',
          balanceAfter: asset('a', '5'),
          creditedAt: '2026-03-01T10:00:00+01:00',
        }),
        tx('a2', asset('a', '1'), 'INCOMING', {
          walletId: 'two',
          balanceAfter: asset('a', '2'),
          creditedAt: '2026-03-01T08:30:00Z',
        }),
        tx('a3', asset('a', '0.00000001'), 'OUTGOING', { walletId: 'one' }),
        tx('c1', cash(100), 'INCOMING', { walletId: 'cash', tradeFee: cash(1) }),
        tx('c2', cash(50), 'INCOMING', { walletId: 'cash', tradeFee: cash(1) }),
      ],
    },
  ];
  expect(sourceBalancesAt(ops, '2026-03-01').get('asset:a')).toBe(700000000);
  expect(sourceBalancesAt(ops, '2026-03-02').get('asset:a')).toBe(699999999);
  expect(sourceBalancesAt(ops, '2026-03-02').get('currency:eur')).toBe(149);
  const feeOnAsset: SourceOperation[] = [
    {
      id: 'cross-fee',
      type: 'buy',
      transactions: [
        tx('asset', asset('a'), 'INCOMING', { fee: cash(1) }),
        tx('cash', cash(100), 'OUTGOING'),
      ],
    },
  ];
  expect(sourceBalancesAt(feeOnAsset, '2026-03-02').get('currency:eur')).toBe(-101);
  feeOnAsset[0]!.transactions.reverse();
  feeOnAsset[0]!.transactions[0]!.balanceAfter = cash(-101);
  expect(sourceBalancesAt(feeOnAsset, '2026-03-02').get('currency:eur')).toBe(-101);
});

it('claims sums within twelve days once, accepts eight source movements and refuses nine', () => {
  const movements = Array.from({ length: 8 }, (_, i) => ({
    id: `movement-${i}`,
    date: '2026-03-01',
    amountCents: 100,
  }));
  const booking = { id: 'bank', accountId: 'cash', date: '2026-03-13', amountCents: 800 };
  expect(
    matchAggregatedSourceCash(movements, [booking, { ...booking, id: 'duplicate' }]).matches,
  ).toEqual([{ bookingId: 'bank', movementIds: movements.map((m) => m.id) }]);
  expect(
    matchAggregatedSourceCash(movements, [{ ...booking, date: '2026-03-14' }]).matches,
  ).toEqual([]);
  expect(
    matchAggregatedSourceCash(
      [...movements, { ...movements[0]!, id: 'ninth' }],
      [{ ...booking, amountCents: 900 }],
    ).matches,
  ).toEqual([]);
});
