import { describe, expect, it } from 'vitest';
import type { SourceAmount, SourceMapping, SourceOperation } from './read-source';
import {
  isAutomaticResolution,
  linkedSourceIds,
  matchSourceOperations,
  type OperationVerdict,
  type SourceMatchBooking,
  type SourceMatchLedger,
  type SourceMatchTrade,
} from './read-source-match';

// Review fixes of #1205. Synthetic ids and amounts; expectations are literal integers.
const EUR = 'cur-eur';
const COIN = 'ast-coin';
const OTHER = 'ast-other';
const mappings: SourceMapping[] = [
  { key: 'currency:' + EUR, accountId: 'cash', securityId: null },
  { key: 'asset:' + COIN, accountId: 'depot', securityId: 'sec-coin' },
  { key: 'asset:' + OTHER, accountId: 'depot', securityId: 'sec-other' },
];
const cash = (cents: number): SourceAmount => ({
  value: (cents / 100).toFixed(2),
  assetId: null,
  currencyId: EUR,
  cents,
});
const coin = (value: string, assetId = COIN): SourceAmount => ({
  value,
  assetId,
  currencyId: null,
  cents: null,
});
type Parts = {
  type: string;
  flow: 'INCOMING' | 'OUTGOING';
  amount: SourceAmount;
  at?: string;
  tradeId?: string | null;
};
const op = (id: string, type: string, ...parts: Parts[]): SourceOperation => ({
  id,
  type,
  transactions: parts.map((p, i) => ({
    id: `${id}-${i}`,
    type: p.type,
    walletId: 'w',
    flow: p.flow,
    creditedAt: p.at ?? '2026-03-10T10:00:00.000Z',
    amount: p.amount,
    fee: null,
    balanceAfter: null,
    tradeId: p.tradeId ?? null,
    tradeFee: null,
    compensates: null,
  })),
});
let seq = 0;
const trade = (p: Partial<SourceMatchTrade>): SourceMatchTrade => ({
  id: 'trade-' + ++seq,
  accountId: 'depot',
  securityId: 'sec-coin',
  date: '2026-03-10',
  kind: 'buy',
  unitsE8: 50_000_000,
  amountCents: 5000,
  feeCents: 0,
  taxCents: 0,
  ...p,
});
const booking = (date: string, amountCents: number): SourceMatchBooking => ({
  id: 'booking-' + ++seq,
  accountId: 'cash',
  date,
  amountCents,
});
const ledger = (
  trades: SourceMatchTrade[] = [],
  bookings: SourceMatchBooking[] = [],
): SourceMatchLedger => ({ trades, bookings });
const verdictOf = (o: SourceOperation, l: SourceMatchLedger): OperationVerdict =>
  matchSourceOperations([o], mappings, l).get(o.id)!;
const status = (o: SourceOperation, l: SourceMatchLedger) => verdictOf(o, l).status;
const refIds = (v: OperationVerdict | undefined) =>
  (v as { refs: Array<{ id: string }> }).refs.map((r) => r.id);

describe('exact automatic resolutions', () => {
  it('an owner text that merely starts alike is not automatic', () => {
    expect(isAutomaticResolution('Bereits in der App erfasst, siehe Beleg 12')).toBe(false);
    expect(isAutomaticResolution('Informativ: von mir geprüft')).toBe(false);
    expect(isAutomaticResolution('Vor dem Startdatum, von Hand')).toBe(false);
    expect(
      isAutomaticResolution('Bereits in der App erfasst (Kauf 10.03.2026, Buchung 11.03.2026)'),
    ).toBe(true);
  });
});

describe('ambiguity is never guessed', () => {
  const credit = (id: string, type: string, at: string) =>
    op(id, type, { type: 'deposit', flow: 'INCOMING', amount: cash(2500), at });
  it('one movement and two equal bookings at the same distance stays open and counts candidates', () => {
    const l = ledger([], [booking('2026-03-09', 2500), booking('2026-03-11', 2500)]);
    const expected = {
      status: 'missing',
      ambiguous: 2,
      refs: [],
      missingLegs: [{ key: 'currency:cur-eur', incoming: true, day: '2026-03-10', cents: 2500 }],
    };
    expect(verdictOf(credit('d', 'deposit', '2026-03-10T10:00:00.000Z'), l)).toEqual(expected);
    expect(verdictOf(credit('p', 'savings_plan', '2026-03-10T10:00:00.000Z'), l)).toEqual(expected);
  });
  it('the ten-day tier is ambiguous too', () => {
    const l = ledger([], [booking('2026-03-16', 2500), booking('2026-03-04', 2500)]);
    expect(verdictOf(credit('p', 'savings_plan', '2026-03-10T10:00:00.000Z'), l)).toEqual({
      status: 'missing',
      ambiguous: 2,
      refs: [],
      missingLegs: [{ key: 'currency:cur-eur', incoming: true, day: '2026-03-10', cents: 2500 }],
    });
  });
  it('two movements and two bookings match one-to-one', () => {
    const b1 = booking('2026-03-10', 2500);
    const b2 = booking('2026-03-10', 2500);
    const v = matchSourceOperations(
      [
        credit('d1', 'deposit', '2026-03-10T10:00:00.000Z'),
        credit('d2', 'deposit', '2026-03-10T11:00:00.000Z'),
      ],
      mappings,
      ledger([], [b1, b2]),
    );
    expect(v.get('d1')!.status).toBe('matched');
    expect(v.get('d2')!.status).toBe('matched');
    expect(new Set([...refIds(v.get('d1')), ...refIds(v.get('d2'))])).toEqual(
      new Set([b1.id, b2.id]),
    );
  });
  it('a nearer booking resolves what would otherwise be a tie', () => {
    const near = booking('2026-03-10', 2500);
    const far = booking('2026-03-12', 2500);
    const v = verdictOf(
      credit('d', 'deposit', '2026-03-10T10:00:00.000Z'),
      ledger([], [far, near]),
    );
    expect(refIds(v)).toEqual([near.id]);
  });
  it('two movements and three equal bookings are ambiguous', () => {
    const v = matchSourceOperations(
      [
        credit('d1', 'deposit', '2026-03-10T10:00:00.000Z'),
        credit('d2', 'deposit', '2026-03-10T11:00:00.000Z'),
      ],
      mappings,
      ledger(
        [],
        [booking('2026-03-10', 2500), booking('2026-03-10', 2500), booking('2026-03-10', 2500)],
      ),
    );
    const expected = {
      status: 'missing',
      ambiguous: 3,
      refs: [],
      missingLegs: [{ key: 'currency:cur-eur', incoming: true, day: '2026-03-10', cents: 2500 }],
    };
    expect(v.get('d1')).toEqual(expected);
    expect(v.get('d2')).toEqual(expected);
  });
});

describe('provider id links are strict and claimed once', () => {
  it('only exact rebuild key formats link; an arbitrary long token does not', () => {
    expect(linkedSourceIds('rebuild:operation-0000000001:2')).toEqual({
      ids: ['operation-0000000001'],
      exclusive: true,
    });
    expect(linkedSourceIds('rebuild:operation-0000000001:merger:out')).toEqual({
      ids: ['operation-0000000001'],
      exclusive: true,
    });
    expect(linkedSourceIds('rebuild:reward:2026-03:security-id:source:["a","b"]')).toEqual({
      ids: ['a', 'b'],
      exclusive: false,
    });
    for (const key of [
      'rebuild:reward:2026-03:security-id-with-a-long-token',
      'rebuild:split:security-id-0000000001:2026-03-10',
      'pp:operation-0000000001',
    ])
      expect(linkedSourceIds(key)).toEqual({ ids: [], exclusive: false });
  });
  it('a security id inside an aggregate key never links an operation of that id', () => {
    const t = trade({ importKey: 'rebuild:reward:2026-03:operation-0000000001:source:["x"]' });
    const o = op('operation-0000000001', 'buy', {
      type: 'buy',
      flow: 'INCOMING',
      amount: coin('0.7'),
      at: '2026-01-01T10:00:00.000Z',
    });
    expect(status(o, ledger([t]))).toBe('missing');
  });
  it('an aggregate covers exactly its listed ids', () => {
    const agg = trade({
      kind: 'dividend',
      unitsE8: 0,
      importKey: 'rebuild:reward:2026-03:sec-coin:source:["listed-operation-0001"]',
    });
    const reward = (id: string, at: string) =>
      op(id, 'reward', { type: 'reward', flow: 'INCOMING', amount: coin('0.1'), at });
    const v = matchSourceOperations(
      [
        reward('listed-operation-0001', '2026-03-10T10:00:00.000Z'),
        reward('unlisted-operation-01', '2026-01-01T10:00:00.000Z'),
      ],
      mappings,
      ledger([agg]),
    );
    expect(v.get('listed-operation-0001')).toMatchObject({ status: 'matched', by: 'id' });
    expect(v.get('unlisted-operation-01')!.status).toBe('missing');
  });
});

describe('operation types', () => {
  it('rejects unsafe supplied cents and aggregated cents', () => {
    const unsafe = op('cents', 'deposit', {
      type: 'deposit',
      flow: 'INCOMING',
      amount: { value: '1.00', assetId: null, currencyId: EUR, cents: 9_007_199_254_740_992 },
    });
    expect(verdictOf(unsafe, ledger())).toEqual({
      status: 'unreadable',
      field: 'transactions[0].amount.cents',
    });
    const aggregate = op(
      'total',
      'deposit',
      {
        type: 'deposit',
        flow: 'INCOMING',
        amount: {
          value: '90071992547409.91',
          assetId: null,
          currencyId: EUR,
          cents: 9_007_199_254_740_991,
        },
      },
      {
        type: 'deposit',
        flow: 'INCOMING',
        amount: { value: '0.01', assetId: null, currencyId: EUR, cents: 1 },
      },
    );
    expect(verdictOf(aggregate, ledger())).toEqual({ status: 'unreadable', field: 'fiatCents' });
  });
  it.each(['0.123456789', 'invalid', '90071992.54740992'])(
    'keeps unreadable transfer amount %s open with its field, even with a provider id link',
    (value) => {
      const o = op(
        'bad-transfer',
        'transfer',
        { type: 'transfer', flow: 'INCOMING', amount: coin(value) },
        { type: 'transfer', flow: 'OUTGOING', amount: coin('0.00000001') },
      );
      expect(
        verdictOf(
          o,
          ledger([trade({ unitsE8: 1, amountCents: 0, importKey: 'rebuild:bad-transfer:0' })]),
        ),
      ).toEqual({
        status: 'unreadable',
        field: 'transactions[0].amount.value',
      });
    },
  );
  it('keeps outgoing net overflow open for owner review', () => {
    const o = op('overflow', 'sell', {
      type: 'sell',
      flow: 'OUTGOING',
      amount: coin('90071992.54740991'),
    });
    o.transactions[0]!.fee = coin('0.00000001');
    expect(verdictOf(o, ledger())).toEqual({ status: 'unreadable', field: 'assets[0].netE8' });
  });
  it('does not infer an internal move from a missing, different-asset or unbalanced leg', () => {
    for (const parts of [
      [{ type: 'stake', flow: 'OUTGOING' as const, amount: coin('1') }],
      [
        { type: 'transfer', flow: 'OUTGOING' as const, amount: coin('1') },
        { type: 'transfer', flow: 'INCOMING' as const, amount: coin('1', OTHER) },
      ],
      [
        { type: 'stake', flow: 'OUTGOING' as const, amount: coin('1') },
        { type: 'stake', flow: 'INCOMING' as const, amount: coin('0.99999999') },
      ],
    ])
      expect(status(op('unproven', 'stake', ...parts), ledger())).toBe('missing');
  });
  it('names unreadable stake precision and unsafe cents instead of resolving internally', () => {
    const o = op('stake-bad', 'stake', {
      type: 'stake',
      flow: 'OUTGOING',
      amount: coin('0.123456789'),
    });
    expect(verdictOf(o, ledger())).toEqual({
      status: 'unreadable',
      field: 'transactions[0].amount.value',
    });
    const fiat = op('fiat-bad', 'transfer', {
      type: 'transfer',
      flow: 'INCOMING',
      amount: {
        value: '90071992547409.92',
        assetId: null,
        currencyId: EUR,
        cents: 9_007_199_254_740_992,
      },
    });
    expect(verdictOf(fiat, ledger())).toEqual({
      status: 'unreadable',
      field: 'transactions[0].amount.value',
    });
  });
  const incoming = (id: string, type: string, units: string) =>
    op(id, type, { type, flow: 'INCOMING', amount: coin(units) });
  it('a staking_reward is a reward to match, not an internal move', () => {
    const o = incoming('r1', 'staking_reward', '0.5');
    expect(status(o, ledger([trade({ kind: 'delivery_in', unitsE8: 50_000_000 })]))).toBe(
      'matched',
    );
    expect(status(o, ledger())).toBe('missing');
  });
  it('stake and unstake stay informational', () => {
    for (const type of ['stake', 'unstake'])
      expect(
        verdictOf(
          op(
            type + '1',
            type,
            { type, flow: 'OUTGOING', amount: coin('1') },
            { type, flow: 'INCOMING', amount: coin('1') },
          ),
          ledger(),
        ),
      ).toEqual({ status: 'informational', reason: 'internal' });
  });
  it('an unbalanced token transfer is a movement; a balanced one is internal', () => {
    const external = incoming('t1', 'transfer', '0.5');
    expect(status(external, ledger())).toBe('missing');
    expect(status(external, ledger([trade({ kind: 'delivery_in', unitsE8: 50_000_000 })]))).toBe(
      'matched',
    );
    const internal = op(
      't2',
      'transfer',
      { type: 'transfer', flow: 'OUTGOING', amount: coin('0.5') },
      { type: 'transfer', flow: 'INCOMING', amount: coin('0.5') },
    );
    expect(verdictOf(internal, ledger()).status).toBe('informational');
  });
  it('a fee in another asset does not widen the cash tolerance', () => {
    const sell = op(
      's',
      'sell',
      { type: 'sell', flow: 'INCOMING', amount: cash(5000), tradeId: 'ts' },
      { type: 'sell', flow: 'OUTGOING', amount: coin('0.5'), tradeId: 'ts' },
      { type: 'fee', flow: 'OUTGOING', amount: coin('1', OTHER) },
    );
    // Units differ, so only the cash value could match: 49 EUR would need an assumed 1 EUR fee.
    const t = trade({ kind: 'sell', unitsE8: -49_000_000, amountCents: 4900 });
    expect(status(sell, ledger([t]))).toBe('missing');
  });
  it('the relative tolerance is exact at the integer boundary (0.5 %)', () => {
    const o = op(
      'r',
      'buy',
      { type: 'buy', flow: 'OUTGOING', amount: cash(10_000), tradeId: 'tr' },
      { type: 'buy', flow: 'INCOMING', amount: coin('1.00000000'), tradeId: 'tr' },
    );
    // 0.5 % of 100_000_000 units is 500_000; of 10_000 cents is 50.
    expect(status(o, ledger([trade({ unitsE8: 100_500_000, amountCents: 10_050 })]))).toBe(
      'matched',
    );
    expect(status(o, ledger([trade({ unitsE8: 100_500_001, amountCents: 10_050 })]))).toBe(
      'missing',
    );
    expect(status(o, ledger([trade({ unitsE8: 100_500_000, amountCents: 10_051 })]))).toBe(
      'missing',
    );
  });
});
