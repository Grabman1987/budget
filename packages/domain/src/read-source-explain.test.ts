import { describe, expect, it } from 'vitest';
import type { SourceAmount, SourceOperation } from './read-source';
import { explainHoldingDifference, summarizeOperation } from './read-source-explain';

// Synthetic ids and amounts only; expectations are literal integers (e8 / cents).
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
      { assetId: COIN, grossE8: 30_000, feeE8: 0, netE8: 30_000 },
      { assetId: TOKEN, grossE8: 0, feeE8: 50_000_000, netE8: -50_000_000 },
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
  it('a staking_reward type is a reward, not an internal transfer', () => {
    const s = summarizeOperation(
      op('staking_reward', tx('staking_reward', 'INCOMING', amt('0.3', COIN))),
    );
    expect(s.class).toBe('reward');
    expect(s.assets).toEqual([{ assetId: COIN, grossE8: 30_000_000, feeE8: 0, netE8: 30_000_000 }]);
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
  it('an external token transfer is a movement, a balanced wallet move is not', () => {
    const external = summarizeOperation(op('transfer', tx('transfer', 'INCOMING', amt('2', COIN))));
    expect(external.class).toBe('token_transfer');
    expect(external.assets).toEqual([
      { assetId: COIN, grossE8: 200_000_000, feeE8: 0, netE8: 200_000_000 },
    ]);
    const internal = summarizeOperation(
      op(
        'transfer',
        tx('transfer', 'OUTGOING', amt('2', COIN)),
        tx('transfer', 'INCOMING', amt('2', COIN)),
      ),
    );
    expect(internal.assets).toEqual([]);
  });
  it('an unreadable amount is unknown, never zero', () => {
    const s = summarizeOperation(op('reward', tx('reward', 'INCOMING', amt('0.123456789', COIN))));
    expect(s.assets).toEqual([{ assetId: COIN, grossE8: null, feeE8: 0, netE8: null }]);
  });
});

describe('explainHoldingDifference', () => {
  const reward = op('reward', tx('reward', 'INCOMING', amt('0.2', COIN)));
  const input = { mapped: true, appE8: 100_000_000, assetId: COIN };
  it('unmapped asset is a mapping problem; an unreadable source value is its own cause', () => {
    expect(
      explainHoldingDifference({ ...input, mapped: false, sourceE8: 5, openOperations: [] }).cause,
    ).toBe('mapping_problem');
    expect(
      explainHoldingDifference({ ...input, mapped: false, sourceE8: null, openOperations: [] })
        .cause,
    ).toBe('mapping_problem');
    expect(explainHoldingDifference({ ...input, sourceE8: null, openOperations: [] }).cause).toBe(
      'source_unreadable',
    );
    expect(
      explainHoldingDifference({
        ...input,
        sourceE8: 120_000_000,
        sourceUnreadable: true,
        openOperations: [reward],
      }).cause,
    ).toBe('source_unreadable');
  });
  it('open movements that add up to the difference are a missing movement', () => {
    expect(
      explainHoldingDifference({ ...input, sourceE8: 120_000_000, openOperations: [reward] }),
    ).toEqual({
      cause: 'missing_movement',
      differenceE8: 20_000_000,
      openMovementsE8: 20_000_000,
      openMovementCount: 1,
    });
  });
  it('a smaller open movement explains only part; none or the wrong direction is a real difference', () => {
    expect(
      explainHoldingDifference({ ...input, sourceE8: 150_000_000, openOperations: [reward] }).cause,
    ).toBe('partly_missing_movement');
    expect(
      explainHoldingDifference({ ...input, sourceE8: 150_000_000, openOperations: [] }).cause,
    ).toBe('real_difference');
    expect(
      explainHoldingDifference({ ...input, sourceE8: 90_000_000, openOperations: [reward] }).cause,
    ).toBe('real_difference');
  });
  it('an unreadable open movement is never counted as zero', () => {
    const unreadable = op('reward', tx('reward', 'INCOMING', amt('0.123456789', COIN)));
    expect(
      explainHoldingDifference({ ...input, sourceE8: 120_000_000, openOperations: [unreadable] }),
    ).toMatchObject({ cause: 'real_difference', openMovementsE8: null });
  });
});
