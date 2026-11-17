import { describe, expect, it } from 'vitest';
import type { SourceAmount, SourceOperation } from './read-source';
import { explainHoldingDifference, summarizeOperation } from './read-source-explain';

// Synthetic ids and amounts only.
const COIN = 'ast-coin';
const TOKEN = 'ast-token';
const amt = (value: string, assetId: string | null, cents: number | null = null): SourceAmount => ({
  value,
  assetId,
  currencyId: assetId ? null : 'cur-eur',
  cents,
});
let n = 0;
const tx = (
  type: string,
  flow: 'INCOMING' | 'OUTGOING',
  amount: SourceAmount,
  extra: Partial<SourceOperation['transactions'][number]> = {},
): SourceOperation['transactions'][number] => ({
  id: 'x' + ++n,
  type,
  walletId: 'w',
  flow,
  creditedAt: '2026-03-10T10:00:00.000Z',
  amount,
  fee: null,
  balanceAfter: null,
  tradeId: null,
  tradeFee: null,
  compensates: null,
  ...extra,
});
const op = (type: string, ...transactions: SourceOperation['transactions']): SourceOperation => ({
  id: 'op-' + type,
  type,
  transactions,
});
const e8 = (v: string) => Math.round(Number(v) * 1e8);

describe('summarizeOperation', () => {
  it('purchase with the fee in the platform token: token holding falls, fiat is only the stated amount', () => {
    const s = summarizeOperation(
      op(
        'buy',
        tx('buy', 'OUTGOING', amt('25', null, 2500), { tradeId: 't' }),
        tx('buy', 'INCOMING', amt('0.0003', COIN), { tradeId: 't' }),
        tx('fee', 'OUTGOING', amt('0.5', TOKEN)),
      ),
    );
    expect(s.class).toBe('purchase');
    expect(s.fiatCents).toBe(2500);
    expect(s.assets).toEqual([
      { assetId: COIN, grossE8: e8('0.0003'), feeE8: 0, netE8: e8('0.0003') },
      { assetId: TOKEN, grossE8: 0, feeE8: e8('0.5'), netE8: -e8('0.5') },
    ]);
  });
  it('staking reward is one operation: gross, fee and net; no fiat value unless stated', () => {
    const s = summarizeOperation(
      op('reward', tx('reward', 'INCOMING', amt('0.3', COIN), { fee: amt('0.06', COIN) })),
    );
    expect(s.class).toBe('reward');
    expect(s.fiatCents).toBeNull();
    expect(s.assets).toEqual([
      { assetId: COIN, grossE8: 30_000_000, feeE8: 6_000_000, netE8: 24_000_000 },
    ]);
  });
  it('internal staking transfers are not a sale and change no holding', () => {
    for (const type of ['stake', 'unstake']) {
      const s = summarizeOperation(op(type, tx(type, 'OUTGOING', amt('1', COIN))));
      expect(s).toMatchObject({ class: 'staking_transfer', assets: [] });
    }
  });
  it('sale and fiat transfer are classified', () => {
    expect(
      summarizeOperation(
        op(
          'sell',
          tx('sell', 'INCOMING', amt('10', null, 1000), { tradeId: 't' }),
          tx('sell', 'OUTGOING', amt('1', COIN), { tradeId: 't' }),
        ),
      ).class,
    ).toBe('sale');
    expect(
      summarizeOperation(op('deposit', tx('deposit', 'INCOMING', amt('10', null, 1000)))).class,
    ).toBe('fiat_transfer');
  });
});

describe('explainHoldingDifference', () => {
  const reward = op('reward', tx('reward', 'INCOMING', amt('0.2', COIN)));
  const input = { mapped: true, appE8: e8('1'), assetId: COIN };
  it('unmapped asset or absent source balance is a mapping problem', () => {
    expect(
      explainHoldingDifference({ ...input, mapped: false, sourceE8: 5, openOperations: [] }).cause,
    ).toBe('mapping_problem');
    expect(explainHoldingDifference({ ...input, sourceE8: null, openOperations: [] }).cause).toBe(
      'mapping_problem',
    );
  });
  it('open movements that add up to the difference are a missing movement', () => {
    expect(
      explainHoldingDifference({ ...input, sourceE8: e8('1.2'), openOperations: [reward] }),
    ).toMatchObject({ cause: 'missing_movement', differenceE8: e8('0.2'), openMovementCount: 1 });
  });
  it('a smaller open movement explains only part; none or the wrong direction is a real difference', () => {
    expect(
      explainHoldingDifference({ ...input, sourceE8: e8('1.5'), openOperations: [reward] }).cause,
    ).toBe('partly_missing_movement');
    expect(
      explainHoldingDifference({ ...input, sourceE8: e8('1.5'), openOperations: [] }).cause,
    ).toBe('real_difference');
    expect(
      explainHoldingDifference({ ...input, sourceE8: e8('0.9'), openOperations: [reward] }).cause,
    ).toBe('real_difference');
  });
});
