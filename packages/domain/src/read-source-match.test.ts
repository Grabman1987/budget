import { describe, expect, it } from 'vitest';
import type { SourceAmount, SourceMapping, SourceOperation } from './read-source';
import {
  describeMatchRef,
  informationalResolution,
  isAutomaticResolution,
  matchedResolution,
  matchSourceOperations,
  type OperationVerdict,
  type SourceMatchBooking,
  type SourceMatchLedger,
  type SourceMatchTrade,
} from './read-source-match';

// Synthetic ids only: two coins, one depot, one cash account.
const EUR = 'cur-eur';
const COIN = 'ast-coin';
const OTHER = 'ast-other';
const mappings: SourceMapping[] = [
  { key: 'currency:' + EUR, accountId: 'cash', securityId: null },
  { key: 'asset:' + COIN, accountId: 'depot', securityId: 'sec-coin' },
  { key: 'asset:' + OTHER, accountId: 'depot', securityId: 'sec-other' },
];
const e8 = (units: string) => Math.round(Number(units) * 1e8);
const cash = (value: string): SourceAmount => ({
  value,
  assetId: null,
  currencyId: EUR,
  cents: Math.round(Number(value) * 100),
});
const coin = (value: string, assetId = COIN): SourceAmount => ({
  value,
  assetId,
  currencyId: null,
  cents: null,
});
type Parts = {
  id?: string;
  type: string;
  flow: 'INCOMING' | 'OUTGOING';
  at?: string | undefined;
  amount: SourceAmount;
  fee?: SourceAmount | null;
  tradeId?: string | null;
  tradeFee?: SourceAmount | null;
};
const tx = (n: number, p: Parts): SourceOperation['transactions'][number] => ({
  id: p.id ?? 'tx' + n,
  type: p.type,
  walletId: 'wallet',
  flow: p.flow,
  creditedAt: p.at ?? '2026-03-10T10:00:00.000Z',
  amount: p.amount,
  fee: p.fee ?? null,
  balanceAfter: null,
  tradeId: p.tradeId ?? null,
  tradeFee: p.tradeFee ?? null,
  compensates: null,
});
const op = (id: string, type: string, ...parts: Parts[]): SourceOperation => ({
  id,
  type,
  transactions: parts.map((p, i) => tx(i, { ...p, id: p.id ?? `${id}-${i}` })),
});
const buyOp = (
  id: string,
  euro: string,
  units: string,
  extra: { type?: string; at?: string | undefined; fee?: string; asset?: string } = {},
) =>
  op(
    id,
    extra.type ?? 'buy',
    {
      type: 'buy',
      flow: 'OUTGOING',
      amount: cash(euro),
      tradeId: 't-' + id,
      at: extra.at,
      tradeFee: extra.fee ? cash(extra.fee) : null,
    },
    {
      type: 'buy',
      flow: 'INCOMING',
      amount: coin(units, extra.asset),
      tradeId: 't-' + id,
      at: extra.at,
    },
  );
let seq = 0;
const trade = (p: Partial<SourceMatchTrade>): SourceMatchTrade => ({
  id: 'trade-' + ++seq,
  accountId: 'depot',
  securityId: 'sec-coin',
  date: '2026-03-10',
  kind: 'buy',
  unitsE8: e8('0.5'),
  amountCents: 5000,
  feeCents: 0,
  taxCents: 0,
  ...p,
});
const booking = (p: Partial<SourceMatchBooking>): SourceMatchBooking => ({
  id: 'booking-' + ++seq,
  accountId: 'cash',
  date: '2026-03-10',
  amountCents: 10000,
  ...p,
});
const ledger = (
  trades: SourceMatchTrade[] = [],
  bookings: SourceMatchBooking[] = [],
): SourceMatchLedger => ({ trades, bookings });
const verdictOf = (
  operation: SourceOperation,
  l: SourceMatchLedger,
  maps: SourceMapping[] = mappings,
): OperationVerdict => matchSourceOperations([operation], maps, l).get(operation.id)!;
const status = (operation: SourceOperation, l: SourceMatchLedger) => verdictOf(operation, l).status;

describe('trades (buy, sell, savings plan)', () => {
  it('matches a buy by units on the same day and names the trade', () => {
    const t = trade({});
    const verdict = verdictOf(buyOp('b1', '50', '0.5'), ledger([t]));
    expect(verdict).toMatchObject({ status: 'matched' });
    expect((verdict as { refs: unknown[] }).refs).toEqual([
      { type: 'trade', id: t.id, kind: 'buy', date: '2026-03-10' },
    ]);
  });
  it('treats a savings plan like a buy', () => {
    expect(status(buyOp('sp', '25', '0.5', { type: 'savings_plan' }), ledger([trade({})]))).toBe(
      'matched',
    );
  });
  it('accepts +-2 days (also across Vienna midnight) but not 3', () => {
    const o = buyOp('b', '50', '0.5');
    expect(status(o, ledger([trade({ date: '2026-03-08' })]))).toBe('matched');
    expect(status(o, ledger([trade({ date: '2026-03-12' })]))).toBe('matched');
    expect(status(o, ledger([trade({ date: '2026-03-07' })]))).toBe('missing');
    expect(status(o, ledger([trade({ date: '2026-03-13' })]))).toBe('missing');
    // 23:30Z is already the next day in Vienna (CET): day 11 -> trade on 13th is still +2.
    const late = buyOp('late', '50', '0.5', { at: '2026-03-10T23:30:00.000Z' });
    expect(status(late, ledger([trade({ date: '2026-03-13' })]))).toBe('matched');
    expect(status(late, ledger([trade({ date: '2026-03-14' })]))).toBe('missing');
  });
  it('allows units to differ by 1e-8 but not 2e-8 when the amount does not rescue it', () => {
    const o = buyOp('u', '50', '0.5');
    const far = { amountCents: 9999 };
    expect(status(o, ledger([trade({ ...far, unitsE8: e8('0.5') + 1 })]))).toBe('matched');
    expect(status(o, ledger([trade({ ...far, unitsE8: e8('0.5') - 1 })]))).toBe('matched');
    expect(status(o, ledger([trade({ ...far, unitsE8: e8('0.5') + 2 })]))).toBe('missing');
  });
  it('falls back to the amount within 1 cent when units were rounded differently', () => {
    const o = buyOp('a', '50', '0.5');
    expect(status(o, ledger([trade({ unitsE8: e8('0.4'), amountCents: 5001 })]))).toBe('matched');
    expect(status(o, ledger([trade({ unitsE8: e8('0.4'), amountCents: 4999 })]))).toBe('matched');
    expect(status(o, ledger([trade({ unitsE8: e8('0.4'), amountCents: 5002 })]))).toBe('missing');
  });
  it('accepts amount and units both within 0.5 %, but not 1 %', () => {
    const o = buyOp('r', '1000', '2');
    const near = trade({ unitsE8: e8('2.008'), amountCents: 100_400 });
    expect(status(o, ledger([near]))).toBe('matched');
    const far = trade({ unitsE8: e8('2.04'), amountCents: 100_400 });
    expect(status(o, ledger([far]))).toBe('missing');
  });
  it('considers the fee: ledger amount plus fee equals the source cash outflow', () => {
    const o = buyOp('f', '25', '0.5', { fee: '0.20' });
    const withFee = trade({ unitsE8: e8('0.4'), amountCents: 2480, feeCents: 20 });
    expect(status(o, ledger([withFee]))).toBe('matched');
    // The source may also report the cash amount without the fee.
    const net = trade({ unitsE8: e8('0.4'), amountCents: 2480 });
    expect(status(o, ledger([net]))).toBe('matched');
    expect(
      status(o, ledger([trade({ unitsE8: e8('0.4'), amountCents: 2400, feeCents: 20 })])),
    ).toBe('missing');
  });
  it('matches a sell net of fee and tax, in the right direction only', () => {
    const o = op(
      's',
      'sell',
      { type: 'sell', flow: 'INCOMING', amount: cash('90'), tradeId: 't' },
      { type: 'sell', flow: 'OUTGOING', amount: coin('1'), tradeId: 't' },
      { type: 'tax', flow: 'OUTGOING', amount: cash('5') },
    );
    const sell = trade({ kind: 'sell', unitsE8: -e8('0.9'), amountCents: 9600, feeCents: 100 });
    expect(status(o, ledger([sell]))).toBe('matched');
    expect(status(o, ledger([trade({ kind: 'buy', unitsE8: e8('1') })]))).toBe('missing');
    expect(status(o, ledger([trade({ kind: 'sell', unitsE8: -e8('1') })]))).toBe('matched');
  });
  it('does not match another account or instrument', () => {
    const o = buyOp('x', '50', '0.5');
    expect(status(o, ledger([trade({ accountId: 'elsewhere' })]))).toBe('missing');
    expect(status(o, ledger([trade({ securityId: 'sec-other' })]))).toBe('missing');
    expect(status(o, ledger([trade({ kind: 'dividend', unitsE8: 0 })]))).toBe('missing');
  });
  it('accepts a delivery for a buy, preferring the buy when both exist', () => {
    const o = buyOp('d', '50', '0.5');
    const delivery = trade({ kind: 'delivery_in' });
    const buy = trade({ kind: 'buy' });
    expect(status(o, ledger([delivery]))).toBe('matched');
    expect(
      (verdictOf(o, ledger([delivery, buy])) as { refs: Array<{ id: string }> }).refs[0]!.id,
    ).toBe(buy.id);
  });
  it('treats a swap and dust swap as one trade per leg; one missing leg is missing', () => {
    const swap = op(
      'sw',
      'swap',
      { type: 'sell', flow: 'OUTGOING', amount: coin('1'), tradeId: 'a' },
      { type: 'sell', flow: 'INCOMING', amount: cash('40'), tradeId: 'a' },
      { type: 'buy', flow: 'OUTGOING', amount: cash('40'), tradeId: 'b' },
      { type: 'buy', flow: 'INCOMING', amount: coin('3', OTHER), tradeId: 'b' },
    );
    const sell = trade({ kind: 'sell', unitsE8: -e8('1'), amountCents: 4000 });
    const buy = trade({ securityId: 'sec-other', unitsE8: e8('3'), amountCents: 4000 });
    const both = verdictOf(swap, ledger([sell, buy]));
    expect(both).toMatchObject({ status: 'matched' });
    expect((both as { refs: unknown[] }).refs).toHaveLength(2);
    expect(status(swap, ledger([sell]))).toBe('missing');
    expect(status(swap, ledger([buy]))).toBe('missing');
  });
  it('ignores fee-only and zero legs; an operation with only those is informational', () => {
    const o = op(
      'fee',
      'sell',
      { type: 'fee', flow: 'OUTGOING', amount: coin('5') },
      { type: 'tax', flow: 'OUTGOING', amount: cash('1') },
    );
    expect(verdictOf(o, ledger())).toEqual({ status: 'informational', reason: 'no_movement' });
    const zero = op('zero', 'deposit', { type: 'deposit', flow: 'INCOMING', amount: cash('0') });
    expect(verdictOf(zero, ledger())).toEqual({ status: 'informational', reason: 'no_movement' });
  });
});

describe('deposits, withdrawals and cash credits', () => {
  const deposit = (value: string, at = '2026-03-10T10:00:00.000Z', fee?: string) =>
    op('dep', 'deposit', {
      type: 'deposit',
      flow: 'INCOMING',
      amount: cash(value),
      at,
      fee: fee ? cash(fee) : null,
    });
  it('matches a deposit on the cash account by exact cents within 3 days', () => {
    const o = deposit('100');
    expect(status(o, ledger([], [booking({})]))).toBe('matched');
    expect(status(o, ledger([], [booking({ date: '2026-03-13' })]))).toBe('matched');
    expect(status(o, ledger([], [booking({ date: '2026-03-07' })]))).toBe('matched');
    expect(status(o, ledger([], [booking({ date: '2026-03-14' })]))).toBe('missing');
    expect(status(o, ledger([], [booking({ amountCents: 10001 })]))).toBe('missing');
    expect(status(o, ledger([], [booking({ amountCents: 9999 })]))).toBe('missing');
    expect(status(o, ledger([], [booking({ accountId: 'other-cash' })]))).toBe('missing');
    expect(status(o, ledger([], [booking({ amountCents: -10000 })]))).toBe('missing');
  });
  it('matches a withdrawal as a negative booking, also net of a stated fee', () => {
    const o = op('wd', 'withdrawal', {
      type: 'withdrawal',
      flow: 'OUTGOING',
      amount: cash('100'),
      fee: cash('1'),
    });
    expect(status(o, ledger([], [booking({ amountCents: -10000 })]))).toBe('matched');
    expect(status(o, ledger([], [booking({ amountCents: -9900 })]))).toBe('matched');
    expect(status(o, ledger([], [booking({ amountCents: 10000 })]))).toBe('missing');
  });
  it('matches a cash reward with an interest or dividend trade of a mapped account', () => {
    const o = op('rw', 'earn_on_fiat_reward', {
      type: 'earn_on_fiat_reward',
      flow: 'INCOMING',
      amount: cash('1.23'),
    });
    expect(status(o, ledger([trade({ kind: 'interest', unitsE8: 0, amountCents: 123 })]))).toBe(
      'matched',
    );
    expect(status(o, ledger([trade({ kind: 'interest', unitsE8: 0, amountCents: 125 })]))).toBe(
      'missing',
    );
    expect(
      status(
        o,
        ledger([trade({ accountId: 'unmapped', kind: 'dividend', unitsE8: 0, amountCents: 123 })]),
      ),
    ).toBe('missing');
    expect(status(o, ledger([], [booking({ amountCents: 123 })]))).toBe('matched');
  });
});

describe('rewards and deliveries', () => {
  const reward = (value: string, fee?: string, at?: string | undefined) =>
    op('rw', 'reward', {
      type: 'reward',
      flow: 'INCOMING',
      amount: coin(value),
      fee: fee ? coin(fee) : null,
      at,
    });
  it('matches a reward with a delivery of the units, also net of the commission', () => {
    const delivery = trade({ kind: 'delivery_in', unitsE8: e8('0.00007513'), amountCents: 0 });
    expect(status(reward('0.00007513'), ledger([delivery]))).toBe('matched');
    expect(status(reward('0.00009162', '0.00001649'), ledger([delivery]))).toBe('matched');
    expect(status(reward('0.00009162'), ledger([delivery]))).toBe('missing');
  });
  it('reports a reward without delivery as missing', () => {
    expect(status(reward('0.5'), ledger([]))).toBe('missing');
    expect(status(reward('0.5'), ledger([trade({ kind: 'sell', unitsE8: -e8('0.5') })]))).toBe(
      'missing',
    );
  });
  it('matches a deposit of coins and a merger as deliveries in and out', () => {
    const merger = op(
      'mg',
      'merger_crypto',
      { type: 'merger_crypto', flow: 'OUTGOING', amount: coin('2') },
      { type: 'merger_crypto', flow: 'INCOMING', amount: coin('1', OTHER) },
    );
    const out = trade({ kind: 'delivery_out', unitsE8: -e8('2') });
    const into = trade({ kind: 'delivery_in', securityId: 'sec-other', unitsE8: e8('1') });
    expect(status(merger, ledger([out, into]))).toBe('matched');
    expect(status(merger, ledger([out]))).toBe('missing');
  });
});

describe('informational and unmapped operations', () => {
  it('resolves stake and unstake as informational, even without any mapping', () => {
    const stake = op(
      'st',
      'stake',
      { type: 'stake', flow: 'OUTGOING', amount: coin('1') },
      { type: 'stake', flow: 'INCOMING', amount: coin('1') },
    );
    const unstake = op(
      'un',
      'unstake',
      { type: 'unstake', flow: 'INCOMING', amount: coin('1') },
      { type: 'unstake', flow: 'OUTGOING', amount: coin('1') },
    );
    expect(verdictOf(stake, ledger(), [])).toEqual({ status: 'informational', reason: 'internal' });
    expect(verdictOf(unstake, ledger(), [])).toEqual({
      status: 'informational',
      reason: 'internal',
    });
  });
  it('keeps unmapped assets and currencies open with their keys', () => {
    expect(verdictOf(buyOp('u', '50', '0.5'), ledger([trade({})]), [])).toEqual({
      status: 'unmapped',
      keys: ['asset:' + COIN],
    });
    const dep = op('dep', 'deposit', { type: 'deposit', flow: 'INCOMING', amount: cash('10') });
    expect(verdictOf(dep, ledger(), mappings.slice(1))).toEqual({
      status: 'unmapped',
      keys: ['currency:' + EUR],
    });
    // A trade needs its asset mapping only, not the currency mapping.
    expect(status(buyOp('t', '50', '0.5'), ledger([trade({})]))).toBe('matched');
    expect(
      verdictOf(buyOp('t', '50', '0.5'), ledger([trade({})]), mappings.slice(1)),
    ).toMatchObject({
      status: 'matched',
    });
  });
  it('lets an unmapped leg win over a matched one', () => {
    const swap = op(
      'sw',
      'swap',
      { type: 'sell', flow: 'OUTGOING', amount: coin('1') },
      { type: 'buy', flow: 'INCOMING', amount: coin('1', 'ast-unknown') },
    );
    const sell = trade({ kind: 'sell', unitsE8: -e8('1') });
    expect(verdictOf(swap, ledger([sell]))).toEqual({
      status: 'unmapped',
      keys: ['asset:ast-unknown'],
    });
  });
});

describe('one ledger row serves one source movement', () => {
  it('matches the second identical buy as missing', () => {
    const ops = [buyOp('b1', '50', '0.5'), buyOp('b2', '50', '0.5')];
    const verdicts = matchSourceOperations(ops, mappings, ledger([trade({})]));
    expect([...verdicts.values()].map((v) => v.status).sort()).toEqual(['matched', 'missing']);
    const twice = matchSourceOperations(ops, mappings, ledger([trade({}), trade({})]));
    expect([...twice.values()].every((v) => v.status === 'matched')).toBe(true);
  });
  it('prefers the closer day and is independent of the input order', () => {
    const near = trade({ date: '2026-03-10' });
    const far = trade({ date: '2026-03-12' });
    const first = buyOp('b1', '50', '0.5', { at: '2026-03-10T10:00:00.000Z' });
    const second = buyOp('b2', '50', '0.5', { at: '2026-03-12T10:00:00.000Z' });
    const a = matchSourceOperations([first, second], mappings, ledger([far, near]));
    const b = matchSourceOperations([second, first], mappings, ledger([near, far]));
    expect(a.get('b1')).toEqual(b.get('b1'));
    expect(a.get('b2')).toEqual(b.get('b2'));
    expect((a.get('b1') as { refs: Array<{ id: string }> }).refs[0]!.id).toBe(near.id);
    expect((a.get('b2') as { refs: Array<{ id: string }> }).refs[0]!.id).toBe(far.id);
  });
  it('is idempotent: the same inputs give the same verdicts', () => {
    const ops = [buyOp('b1', '50', '0.5'), buyOp('b2', '60', '0.7')];
    const l = ledger([trade({}), trade({ unitsE8: e8('0.7'), amountCents: 6000 })]);
    expect(matchSourceOperations(ops, mappings, l)).toEqual(
      matchSourceOperations(ops, mappings, l),
    );
  });
  it('keeps a stronger match for the operation that needs it', () => {
    // b1 (units match) must not lose its trade to b2, which only matches on the amount.
    const t = trade({ unitsE8: e8('0.5'), amountCents: 5000 });
    const exact = buyOp('exact', '55', '0.5', { at: '2026-03-11T10:00:00.000Z' });
    const byAmount = buyOp('amount', '50', '0.1', { at: '2026-03-10T10:00:00.000Z' });
    const verdicts = matchSourceOperations([byAmount, exact], mappings, ledger([t]));
    expect(verdicts.get('exact')!.status).toBe('matched');
    expect(verdicts.get('amount')!.status).toBe('missing');
  });
});

describe('resolution texts', () => {
  it('describes matched ledger rows briefly in German', () => {
    expect(describeMatchRef({ type: 'trade', id: 'x', kind: 'buy', date: '2026-03-10' })).toBe(
      'Kauf 10.03.2026',
    );
    expect(
      describeMatchRef({ type: 'trade', id: 'x', kind: 'delivery_in', date: '2025-01-02' }),
    ).toBe('Einlieferung 02.01.2025');
    expect(
      describeMatchRef({ type: 'booking', id: 'x', kind: 'booking', date: '2025-01-02' }),
    ).toBe('Buchung 02.01.2025');
    const refs = ['a', 'b', 'c', 'd'].map((id) => ({
      type: 'trade' as const,
      id,
      kind: 'sell',
      date: '2026-03-10',
    }));
    expect(matchedResolution(refs.slice(0, 1))).toBe(
      'Bereits in der App erfasst (Verkauf 10.03.2026)',
    );
    expect(matchedResolution(refs)).toBe(
      'Bereits in der App erfasst (Verkauf 10.03.2026, Verkauf 10.03.2026, +2 weitere)',
    );
  });
  it('recognises automatic resolutions but not the owner decision', () => {
    expect(
      isAutomaticResolution(
        matchedResolution([{ type: 'trade', id: 't', kind: 'buy', date: '2026-03-10' }]),
      ),
    ).toBe(true);
    expect(isAutomaticResolution(informationalResolution('internal'))).toBe(true);
    expect(
      isAutomaticResolution(
        'Vor dem Übernahme-Stichtag 03.10.2026: Bestände stammen aus der Übernahme.',
      ),
    ).toBe(true);
    expect(isAutomaticResolution('Vor dem Startdatum – bereits in der App erfasst.')).toBe(true);
    expect(isAutomaticResolution('Vom Nutzer als erledigt markiert')).toBe(false);
    expect(isAutomaticResolution(null)).toBe(false);
  });
});

describe('provider ids (#1205)', () => {
  const rewardOp = (id: string, units: string, fee: string) =>
    op(id, 'reward', { type: 'reward', flow: 'INCOMING', amount: coin(units), fee: coin(fee) });
  it('matches by the operation id in the import key whatever the date and amount', () => {
    const t = trade({
      kind: 'delivery_in',
      date: '2026-04-25',
      unitsE8: e8('9'),
      importKey: 'rebuild:operation-id-b1-0000001:0',
    });
    const verdict = verdictOf(buyOp('operation-id-b1-0000001', '50', '0.5'), ledger([t]));
    expect(verdict).toMatchObject({ status: 'matched', by: 'id' });
    expect((verdict as { refs: Array<{ id: string }> }).refs.map((r) => r.id)).toEqual([t.id]);
  });
  it('one aggregate row (monthly reward) belongs to every contributing operation', () => {
    const r1 = rewardOp('reward-operation-id-0001', '0.0001', '0.00002');
    const r2 = rewardOp('reward-operation-id-0002', '0.0002', '0.00004');
    const agg = trade({
      kind: 'dividend',
      date: '2026-03-31',
      unitsE8: 0,
      importKey: `rebuild:reward:2026-03:sec-coin:source:["${r1.id}","${r2.id}"]`,
    });
    const verdicts = matchSourceOperations([r1, r2], mappings, ledger([agg]));
    expect(verdicts.get(r1.id)).toMatchObject({ status: 'matched', by: 'id' });
    expect(verdicts.get(r2.id)).toMatchObject({ status: 'matched', by: 'id' });
  });
  it('a row linked by id is not available to another operation (no double use)', () => {
    const t = trade({ importKey: 'rebuild:linked-operation-id-0001:0' });
    const linked = buyOp('linked-operation-id-0001', '50', '0.5');
    const other = buyOp('other', '50', '0.5');
    const v = matchSourceOperations([linked, other], mappings, ledger([t]));
    expect(v.get(linked.id)).toMatchObject({ status: 'matched', by: 'id' });
    expect(v.get(other.id)).toMatchObject({ status: 'missing' });
  });
  it('keys that are not rebuild keys never link', () => {
    const t = trade({ importKey: 'pp:linked-operation-id-0001', date: '2026-01-01' });
    expect(status(buyOp('linked-operation-id-0001', '50', '0.5'), ledger([t]))).toBe('missing');
  });
  it('is stable: the same input gives the same verdicts twice', () => {
    const ops = [buyOp('a', '50', '0.5'), buyOp('b', '50', '0.5')];
    const l = ledger([trade({ importKey: 'rebuild:a:0' }), trade({})]);
    const first = [...matchSourceOperations(ops, mappings, l).entries()];
    const second = [...matchSourceOperations(ops, mappings, l).entries()];
    expect(second).toEqual(first);
  });
});

describe('savings plan across dates (#1205)', () => {
  it('requires the funding counterpart even when the execution is linked by provider id', () => {
    const purchase = buyOp('plan', '25.01', '0.5', { type: 'savings_plan' });
    const plan = {
      ...purchase,
      transactions: [
        ...op('reservation', 'savings_plan', {
          type: 'deposit',
          flow: 'INCOMING',
          amount: { ...cash('25.01'), cents: 2501 },
          at: '2026-03-06T10:00:00.000Z',
          tradeId: 't-plan',
        }).transactions,
        ...purchase.transactions,
        tx(9, { type: 'fee', flow: 'OUTGOING', amount: { ...cash('1'), cents: 100 } }),
      ],
    };
    const execution = trade({ amountCents: 2501, importKey: 'rebuild:plan:2' });
    expect(verdictOf(plan, ledger([execution]))).toMatchObject({
      status: 'missing',
      refs: [{ id: execution.id }],
      missingLegs: [{ key: 'currency:cur-eur', incoming: true, day: '2026-03-06', cents: 2501 }],
    });
    expect(status(plan, ledger([execution], [booking({ amountCents: 2401 })]))).toBe('missing');
    expect(
      status(plan, ledger([execution], [booking({ date: '2026-02-26', amountCents: 2501 })])),
    ).toBe('missing');
    const debit = booking({ date: '2026-03-01', amountCents: 2501 });
    expect(verdictOf(plan, ledger([execution], [debit]))).toMatchObject({
      status: 'matched',
      refs: expect.arrayContaining([
        { type: 'booking', id: debit.id, kind: 'booking', date: debit.date },
      ]),
    });
  });
  const planDeposit = (id: string, at: string) =>
    op(id, 'savings_plan', { type: 'deposit', flow: 'INCOMING', amount: cash('25'), at });
  it('matches the bank booking up to ten days away, nearer matches first', () => {
    const near = booking({ date: '2026-03-11', amountCents: 2500 });
    const far = booking({ date: '2026-03-19', amountCents: 2500 });
    const a = planDeposit('p1', '2026-03-10T10:00:00.000Z');
    const b = planDeposit('p2', '2026-03-12T10:00:00.000Z');
    const v = matchSourceOperations([a, b], mappings, ledger([], [near, far]));
    expect(v.get('p1')).toMatchObject({ status: 'matched' });
    expect(v.get('p2')).toMatchObject({ status: 'matched' });
    expect((v.get('p1') as { refs: Array<{ id: string }> }).refs[0]!.id).toBe(near.id);
  });
  it('does not widen the window for an ordinary deposit and stops at ten days', () => {
    const b = booking({ date: '2026-03-19', amountCents: 2500 });
    const deposit = op('d', 'deposit', {
      type: 'deposit',
      flow: 'INCOMING',
      amount: cash('25'),
      at: '2026-03-10T10:00:00.000Z',
    });
    expect(status(deposit, ledger([], [b]))).toBe('missing');
    expect(status(planDeposit('p3', '2026-03-10T10:00:00.000Z'), ledger([], [b]))).toBe('matched');
    expect(
      status(
        planDeposit('p4', '2026-03-10T10:00:00.000Z'),
        ledger([], [booking({ date: '2026-03-21', amountCents: 2500 })]),
      ),
    ).toBe('missing');
  });
});

it('matches one purchase spanning source records and claims an exact repeated transaction once', () => {
  const buy = buyOp('split', '25.01', '0.5');
  const [fiat, asset] = buy.transactions;
  const fee = tx(9, {
    type: 'fee',
    flow: 'OUTGOING',
    amount: coin('0.2', OTHER),
    tradeId: asset!.tradeId,
  });
  const records = [
    { ...buy, id: 'cash-side', transactions: [fiat!] },
    { ...buy, id: 'asset-side', transactions: [asset!, fee] },
    { ...buy, id: 'replay-side', transactions: [asset!] },
    buyOp('unrelated', '25.01', '0.5'),
  ];
  const feeSale = trade({
    kind: 'sell',
    securityId: 'sec-other',
    amountCents: 0,
    unitsE8: -20_000_000,
    importKey: 'rebuild:asset-side:1',
  });
  expect(
    matchSourceOperations(records, mappings, ledger([feeSale])).get('asset-side'),
  ).toMatchObject({ status: 'missing', refs: [] });
  const execution = trade({ amountCents: 2501, importKey: 'rebuild:split-1:0' });
  const verdicts = matchSourceOperations(records, mappings, ledger([execution]));
  expect(verdicts.get('cash-side')).toMatchObject({
    status: 'matched',
    refs: [{ id: execution.id }],
  });
  expect(verdicts.get('asset-side')).toEqual(verdicts.get('cash-side'));
  expect(verdicts.get('replay-side')).toEqual(verdicts.get('cash-side'));
  expect(verdicts.get('unrelated')).toMatchObject({ status: 'missing' });
  expect(matchSourceOperations([...records].reverse(), mappings, ledger([execution]))).toEqual(
    verdicts,
  );
  const changedCopy = { ...asset!, amount: coin('0.6') };
  expect(
    matchSourceOperations(
      [...records, { ...buy, id: 'conflicting-copy', transactions: [changedCopy] }],
      mappings,
      ledger([execution]),
    ).get('asset-side'),
  ).toEqual({ status: 'unreadable', field: 'transaction_id' });
});

it('matches staking reward units net of a separately reported fee', () => {
  const reward = op(
    'staking',
    'staking_reward',
    { type: 'reward', flow: 'INCOMING', amount: coin('0.3') },
    { type: 'fee', flow: 'OUTGOING', amount: coin('0.06') },
  );
  expect(
    status(reward, ledger([trade({ kind: 'delivery_in', unitsE8: 24_000_000, amountCents: 0 })])),
  ).toBe('matched');
  expect(status(reward, ledger([trade({ kind: 'delivery_in', unitsE8: 30_000_000 })]))).toBe(
    'missing',
  );
  const valued = {
    ...reward,
    transactions: [
      ...reward.transactions,
      tx(10, { type: 'reward', flow: 'INCOMING', amount: { ...cash('3.01'), cents: 301 } }),
    ],
  };
  expect(status(valued, ledger([trade({ amountCents: 301, unitsE8: 30_000_000 })]))).toBe(
    'missing',
  );
  expect(
    status(valued, ledger([trade({ kind: 'delivery_in', unitsE8: 24_000_000, amountCents: 301 })])),
  ).toBe('matched');
});

it('reconciles separate staking wallet legs by their shared reference without a sale', () => {
  const out = op('stake-out', 'stake', {
    type: 'stake',
    flow: 'OUTGOING',
    amount: coin('0.3'),
    tradeId: 'stake-reference',
  });
  const into = op('stake-in', 'stake', {
    type: 'stake',
    flow: 'INCOMING',
    amount: coin('0.3'),
    tradeId: 'stake-reference',
  });
  expect(verdictOf(out, ledger())).toMatchObject({ status: 'missing' });
  const verdicts = matchSourceOperations([out, into], mappings, ledger());
  expect(verdicts.get(out.id)).toEqual({ status: 'informational', reason: 'internal' });
  expect(verdicts.get(into.id)).toEqual(verdicts.get(out.id));
  const reward = op('zz-reward', 'reward', {
    type: 'reward',
    flow: 'INCOMING',
    amount: coin('0.2'),
    tradeId: 'stake-reference',
  });
  expect(
    matchSourceOperations(
      [out, into, reward],
      mappings,
      ledger([trade({ kind: 'delivery_in', unitsE8: 20_000_000 })]),
    ).get(out.id),
  ).toMatchObject({ status: 'matched' });
});

it.each(['refund', 'onetime_reward', 'earn_on_fiat_reward'])(
  'matches %s cash by exact cents and leaves an unmapped currency open',
  (type) => {
    const credit = op(type, type, {
      type,
      flow: 'INCOMING',
      amount: { ...cash('1.23'), cents: 123 },
    });
    expect(status(credit, ledger([], [booking({ amountCents: 123 })]))).toBe('matched');
    expect(status(credit, ledger([], [booking({ amountCents: 124 })]))).toBe('missing');
    expect(verdictOf(credit, ledger(), mappings.slice(1))).toEqual({
      status: 'unmapped',
      keys: ['currency:cur-eur'],
    });
  },
);
