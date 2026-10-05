import { expect, it } from 'vitest';
import type { SourceAmount, SourceOperation } from './read-source';
import {
  matchAggregatedSourceCash,
  planSourceRebuild,
  sourceBalancesAt,
  sourceBalancesOnDays,
  sourceStakedAt,
  rebuildStakedNowSchema,
  rebuildIsDust,
} from './source-rebuild';

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

it('books separate discount-token fees at zero net cash and nets same-asset fees once', () => {
  const op: SourceOperation = {
    id: 'fee-buy',
    type: 'buy',
    transactions: [
      tx('a', asset('a'), 'INCOMING', { fee: asset('a', '0.1') }),
      tx('cash', cash(100), 'OUTGOING'),
      tx('same', asset('a', '0.1'), 'OUTGOING', { type: 'fee', walletId: 'other' }),
      tx('discount', asset('b', '0.2'), 'OUTGOING', { type: 'fee', walletId: 'discount' }),
    ],
  };
  expect(plan(op).trades.map((t) => [t.kind, t.unitsE8, t.amountCents, t.feeCents])).toEqual([
    ['sell', -20000000, 20, 20],
    ['buy', 90000000, 100, 0],
  ]);
  expect(plan(op, [prices[0]!]).issues).toContainEqual({
    id: 'fee-buy',
    key: 'asset:b',
    reason: 'fee_no_price',
    fiatEffectCents: 0,
  });
  expect(
    plan({
      ...op,
      transactions: [...op.transactions, tx('unknown', asset('x'), 'OUTGOING', { type: 'fee' })],
    }).issues,
  ).toContainEqual({ id: 'fee-buy', key: 'asset:x', reason: 'unmapped_asset', fiatEffectCents: 0 });
});

it.each(['swap', 'earn_on_fiat_swap'])(
  'values %s from separate sell/buy fiat legs without quotes',
  (type) => {
    const result = plan(
      {
        id: 'fiat-swap',
        type,
        transactions: [
          tx('a', asset('a'), 'OUTGOING', { tradeId: 'sale' }),
          tx('sale', cash(123), 'INCOMING', { tradeId: 'sale' }),
          tx('b', asset('b'), 'INCOMING', { tradeId: 'purchase' }),
          tx('purchase', cash(123), 'OUTGOING', { tradeId: 'purchase' }),
        ],
      },
      [],
    );
    expect(result.issues).toEqual([]);
    expect(result.trades.map((t) => [t.kind, t.amountCents])).toEqual([
      ['sell', 123],
      ['buy', 123],
    ]);
  },
);

it('treats earn_on_fiat_buy as a buy', () => {
  expect(
    plan(
      {
        id: 'earn-buy',
        type: 'earn_on_fiat_buy',
        transactions: [tx('a', asset('a')), tx('cash', cash(123), 'OUTGOING')],
      },
      [],
    ).trades[0],
  ).toMatchObject({ kind: 'buy', amountCents: 123, unitsE8: 100000000 });
});

it('migrates tokens at the outgoing stored value, or delivers both at zero with a report', () => {
  const op: SourceOperation = {
    id: 'migration',
    type: 'merger_crypto',
    transactions: [
      tx('a', asset('a'), 'OUTGOING', { tradeId: null }),
      tx('b', asset('b', '2'), 'INCOMING', { tradeId: null }),
    ],
  };
  expect(plan(op, [prices[0]!]).trades.map((t) => [t.kind, t.amountCents, t.importKey])).toEqual([
    ['sell', 100, 'rebuild:migration:merger:out'],
    ['buy', 100, 'rebuild:migration:merger:in'],
  ]);
  expect(plan(op, []).trades.map((t) => [t.kind, t.amountCents])).toEqual([
    ['delivery_out', 0],
    ['delivery_in', 0],
  ]);
  expect(plan(op, []).issues[0]?.reason).toBe('merger_no_price');
});

it.each(['deposit', 'withdrawal'])(
  'delivers net %s units with stored value and reports missing quotes',
  (type) => {
    const incoming = type === 'deposit';
    const op: SourceOperation = {
      id: type,
      type,
      transactions: [
        tx('a', asset('a'), incoming ? 'INCOMING' : 'OUTGOING', {
          fee: asset('a', '0.1'),
          tradeId: null,
        }),
      ],
    };
    expect(plan(op).trades[0]).toMatchObject({
      kind: incoming ? 'delivery_in' : 'delivery_out',
      unitsE8: incoming ? 90000000 : -110000000,
      amountCents: incoming ? 90 : 110,
    });
    expect(plan(op, []).trades[0]?.amountCents).toBe(0);
    expect(plan(op, []).issues[0]?.reason).toBe('delivery_no_price');
    expect(plan({ id: 'bank', type, transactions: [tx('cash', cash(100))] }).unbooked).toHaveLength(
      1,
    );
  },
);

it('reports a zero-valued reclaim delivery', () => {
  const result = plan({
    id: 'reclaim',
    type: 'reclaim',
    transactions: [tx('a', asset('a'), 'OUTGOING')],
  });
  expect(result.trades[0]).toMatchObject({
    kind: 'delivery_out',
    amountCents: 0,
    unitsE8: -100000000,
  });
  expect(result.issues[0]?.reason).toBe('reclaim_zero_value');
});

it('converts unmapped fiat principal, fees and interest using stored daily ECB rates', () => {
  const usd = (cents: number) => ({ ...cash(cents), currencyId: 'foreign-wallet' });
  const fx = {
    currencies: [{ key: 'currency:foreign-wallet', currency: 'USD' }],
    rates: [{ currency: 'USD', date: '2026-03-02', rateMicro: 800000, source: 'ecb' }],
  };
  const ops: SourceOperation[] = [
    {
      id: 'usd-buy',
      type: 'buy',
      transactions: [
        tx('a', asset('a')),
        tx('usd', usd(125), 'OUTGOING', { fee: usd(5), tradeFee: usd(5), balanceAfter: usd(500) }),
      ],
    },
    { id: 'usd-interest', type: 'earn_on_fiat_reward', transactions: [tx('interest', usd(10))] },
  ];
  const result = planSourceRebuild(ops, mappings, [], '2026-03-02', 'currency:eur', 'EUR', fx);
  expect(result.issues).toEqual([]);
  expect(result.trades.map((t) => [t.kind, t.amountCents, t.feeCents])).toEqual([
    ['buy', 100, 4],
    ['interest', 8, 0],
  ]);
  expect(result.fxCashMovements).toEqual([
    { date: '2026-03-02', amountCents: -104 },
    { date: '2026-03-02', amountCents: 8 },
  ]);
  expect(result.fx_converted[0]).toMatchObject({
    currency: 'USD',
    originalAmount: '1.25',
    fromRateMicro: 800000,
    toRateMicro: 1000000,
    amountCents: 100,
  });
  expect(
    planSourceRebuild(ops, mappings, [], '2026-03-02', 'currency:eur', 'EUR', { ...fx, rates: [] })
      .trades,
  ).toEqual([]);
  expect(
    planSourceRebuild(ops, mappings, [], '2026-03-02', 'currency:eur', 'EUR', {
      ...fx,
      rates: [{ ...fx.rates[0]!, date: '2026-03-01' }],
    }).issues,
  ).toEqual([]);
});

it('reconstructs staking at opening and today from current units, without trades', () => {
  const ops: SourceOperation[] = [
    { id: 'stake', type: 'stake', transactions: [tx('s', asset('a', '2'), 'OUTGOING')] },
    {
      id: 'unstake',
      type: 'unstake',
      transactions: [
        tx('u', asset('a', '0.5'), 'INCOMING', { creditedAt: '2026-04-01T12:00:00Z' }),
      ],
    },
  ];
  const now = new Map([['asset:a', 250000000]]);
  expect(sourceStakedAt(ops, '2026-02-28', '2026-04-30', now).get('asset:a')).toBe(100000000);
  expect(sourceStakedAt(ops, '2026-03-31', '2026-04-30', now).get('asset:a')).toBe(300000000);
  expect(sourceStakedAt(ops, '2026-04-30', '2026-04-30', now).get('asset:a')).toBe(250000000);
  expect(
    planSourceRebuild(ops, mappings, prices, '2026-03-01', 'currency:eur', 'EUR').trades,
  ).toEqual([]);
  expect([...rebuildStakedNowSchema.parse(['Synthetic Coin=2.50000000'])]).toEqual([
    ['synthetic coin', 250000000],
  ]);
  for (const bad of [
    ['Coin=-1'],
    ['Coin=0.000000001'],
    ['Coin=1', 'coin=2'],
    ['Coin=9007199254740991'],
  ])
    expect(() => rebuildStakedNowSchema.parse(bad)).toThrow();
  expect(sourceStakedAt(ops, '2026-02-28', '2026-04-30', new Map()).size).toBe(0);
});

it('sums visible staking wallets and corrects missing unstake OUT legs until a newer snapshot', () => {
  const movement = (
    id: string,
    type: string,
    day: string,
    walletId: string,
    value: string,
    balance: string,
    flow = 'INCOMING',
  ): SourceOperation => ({
    id,
    type,
    transactions: [
      tx(id + '-leg', asset('a', value), flow, {
        walletId,
        balanceAfter: asset('a', balance),
        creditedAt: day + 'T12:00:00Z',
      }),
    ],
  });
  const ops = [
    movement('opening', 'deposit', '2026-02-28', 'main', '10', '10'),
    movement('stake-out', 'stake', '2026-03-02', 'main', '10', '0', 'OUTGOING'),
    movement('stake-in', 'stake', '2026-03-02', 'staking', '10', '10'),
    movement('staking-reward', 'reward', '2026-03-03', 'staking', '0.5', '10.5'),
    movement('unstake-in', 'unstake', '2026-03-04', 'main', '10.5', '10.5'),
  ];
  expect(sourceBalancesAt(ops, '2026-03-03').get('asset:a')).toBe(1050000000);
  expect(sourceBalancesAt(ops, '2026-03-04').get('asset:a')).toBe(1050000000);
  expect(
    planSourceRebuild(ops.slice(1, 3), mappings, prices, '2026-03-01', 'currency:eur', 'EUR')
      .trades,
  ).toEqual([]);
  ops.push(movement('later-reward', 'reward', '2026-04-02', 'staking', '0.1', '0.1'));
  expect(sourceBalancesAt(ops, '2026-04-02').get('asset:a')).toBe(1060000000);
  const explicit = [
    ...ops.slice(0, 4),
    {
      ...ops[4]!,
      transactions: [
        ...ops[4]!.transactions,
        tx('unstake-out', asset('a', '10.5'), 'OUTGOING', {
          walletId: 'staking',
          balanceAfter: asset('a', '0'),
          creditedAt: '2026-03-04T12:00:00Z',
        }),
      ],
    },
  ];
  expect(sourceBalancesAt(explicit, '2026-03-04').get('asset:a')).toBe(1050000000);
  const another = movement('other-stake', 'stake', '2026-03-03', 'other-staking', '20', '20');
  another.transactions[0]!.creditedAt = '2026-03-03T11:00:00Z';
  const diagnostics = { wallets: new Map() };
  sourceBalancesOnDays(
    [...ops.slice(0, 3), another, ...ops.slice(3)],
    ['2026-03-04'],
    undefined,
    diagnostics,
  );
  expect(
    diagnostics.wallets
      .get('2026-03-04')
      .map((w: { walletId: string; units: number }) => [w.walletId, w.units]),
  ).toEqual([
    ['main', 1050000000],
    ['staking', 0],
    ['other-staking', 2000000000],
  ]);
  another.transactions[0]!.creditedAt = '2026-03-03T13:00:00Z';
  sourceBalancesOnDays(
    [...ops.slice(0, 3), another, ...ops.slice(3)],
    ['2026-03-04'],
    undefined,
    diagnostics,
  );
  expect(
    diagnostics.wallets
      .get('2026-03-04')
      .find((w: { walletId: string }) => w.walletId === 'other-staking').units,
  ).toBe(950000000);
  another.transactions[0]!.balanceAfter = asset('a', '1');
  sourceBalancesOnDays(
    [...ops.slice(0, 3), another, ...ops.slice(3)],
    ['2026-03-04'],
    undefined,
    diagnostics,
  );
  expect(
    diagnostics.wallets
      .get('2026-03-04')
      .find((w: { walletId: string }) => w.walletId === 'staking').units,
  ).toBe(0);
  expect(
    sourceStakedAt(ops, '2026-03-03', '2026-04-30', new Map([['asset:a', 10000000]])).get(
      'asset:a',
    ),
  ).toBe(1050000000);
});

it('uses a recent EUR asset price when FX is missing, preserves fiat fee ratios, and never uses future/stale prices', () => {
  const usd = (cents: number) => ({ ...cash(cents), currencyId: 'usd' });
  const op: SourceOperation = {
    id: 'fallback-buy',
    type: 'buy',
    transactions: [tx('asset', asset('a', '2')), tx('usd', usd(500), 'OUTGOING', { fee: usd(25) })],
  };
  const fx = { currencies: [{ key: 'currency:usd', currency: 'USD' }], rates: [] };
  const fallback = (date: string) =>
    planSourceRebuild(
      [op],
      mappings,
      [{ ...prices[0]!, date, priceMicro: 1250000 }],
      '2026-03-02',
      'currency:eur',
      'EUR',
      fx,
    );
  expect(fallback('2026-02-23').trades[0]).toMatchObject({
    importKey: 'rebuild:fallback-buy:0',
    unitsE8: 200000000,
    amountCents: 250,
    feeCents: 13,
  });
  expect(fallback('2026-02-23').issues).toContainEqual({
    id: 'fallback-buy',
    key: 'currency:usd',
    date: '2026-03-02',
    reason: 'fx_fallback_price',
  });
  expect(fallback('2026-02-23').fxCashMovements).toEqual([
    { date: '2026-03-02', amountCents: -263 },
  ]);
  for (const date of ['2026-02-22', '2026-03-03']) {
    expect(fallback(date).trades).toEqual([]);
    expect(fallback(date).issues[0]?.reason).toContain(
      'Missing stored ECB rate and recent EUR asset price',
    );
  }
});

it('reports snapshot jumps only when staged legs do not explain the change', () => {
  const ops: SourceOperation[] = [
    {
      id: 'start',
      type: 'buy',
      transactions: [
        tx('start-leg', asset('a', '5'), 'INCOMING', {
          walletId: 'product',
          balanceAfter: asset('a', '5'),
        }),
      ],
    },
    {
      id: 'expired',
      type: 'leverage_liquidation',
      transactions: [
        tx('expired-leg', asset('a', '1'), 'OUTGOING', {
          walletId: 'product',
          balanceAfter: asset('a', '0'),
          creditedAt: '2026-03-03T12:00:00Z',
        }),
      ],
    },
  ];
  const diagnostics = { wallets: new Map(), changes: [] };
  sourceBalancesOnDays(ops, ['2026-03-03'], undefined, diagnostics);
  expect(diagnostics.changes).toEqual([
    {
      id: 'expired',
      reason: 'unexplained_balance_change',
      key: 'asset:a',
      date: '2026-03-03',
      unitsE8: -400000000,
      walletId: 'product',
      previousLegId: 'start-leg',
      legId: 'expired-leg',
    },
  ]);
  ops[1]!.transactions[0]!.amount = asset('a', '5');
  const explained = { wallets: new Map(), changes: [] };
  sourceBalancesOnDays(ops, ['2026-03-03'], undefined, explained);
  expect(explained.changes).toEqual([]);
});

it('uses nearest stored ECB only after daily FX and recent EUR price are unavailable', () => {
  const op: SourceOperation = {
    id: 'nearest-buy',
    type: 'buy',
    transactions: [
      tx('a', asset('a', '2')),
      tx('usd', { ...cash(125), currencyId: 'usd' }, 'OUTGOING'),
    ],
  };
  const fx = {
    currencies: [{ key: 'currency:usd', currency: 'USD' }],
    rates: [
      { currency: 'USD', date: '2026-03-10', rateMicro: 900000, source: 'ecb' },
      { currency: 'USD', date: '2026-03-03', rateMicro: 800000, source: 'ecb' },
      { currency: 'USD', date: '2026-03-02', rateMicro: 700000, source: 'manual' },
    ],
  };
  const run = (quotes = [] as typeof prices, rates = fx.rates) =>
    planSourceRebuild([op], mappings, quotes, '2026-03-02', 'currency:eur', 'EUR', {
      ...fx,
      rates,
    });
  expect(run().trades[0]).toMatchObject({ amountCents: 100, unitsE8: 200000000 });
  expect(run().issues).toEqual([
    {
      id: 'nearest-buy',
      key: 'currency:usd',
      date: '2026-03-02',
      reason: 'fx_nearest',
      currency: 'USD',
      rateDate: '2026-03-03',
    },
  ]);
  expect(run().fxCashMovements).toEqual([{ date: '2026-03-02', amountCents: -100 }]);
  expect(run(prices).trades[0]?.amountCents).toBe(200);
  expect(run(prices).issues[0]?.reason).toBe('fx_fallback_price');
  const past = { ...fx.rates[0]!, date: '2026-02-01', rateMicro: 400000 };
  expect(run([], [...fx.rates, past]).trades[0]?.amountCents).toBe(50);
  expect(run([], [...fx.rates, past]).issues).toEqual([]);
  expect(run([], []).trades).toEqual([]);
});

it('closes only nonzero dust strictly below one unrounded cent or 0.001 unpriced units', () => {
  expect(rebuildIsDust(9999, 100000000)).toBe(true);
  expect(rebuildIsDust(-9999, 100000000)).toBe(true);
  expect(rebuildIsDust(10000, 100000000)).toBe(false);
  expect(rebuildIsDust(10001, 100000000)).toBe(false);
  expect(rebuildIsDust(99999, null)).toBe(true);
  expect(rebuildIsDust(-100000, null)).toBe(false);
  expect(rebuildIsDust(0, null)).toBe(false);
});
