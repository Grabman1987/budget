import { describe, expect, it } from 'vitest';
import {
  allocateContactReceipt,
  contactStatement,
  contactTotals,
  type ContactMovement,
} from './index';
const movement = (splitId: string, amountCents: number, date = '2026-09-01'): ContactMovement => ({
  splitId,
  bookingId: splitId,
  amountCents,
  date,
  memo: null,
});
describe('actual contact statement', () => {
  it('reports exact shared running balances and cash/contact signs through excess credit', () => {
    const source = [
      movement('a', -10000),
      movement('r', 12000),
      movement('b', -3000, '2026-09-02'),
    ];
    const statement = contactStatement(source);
    expect(
      statement.movements.map((m) => [m.amountCents, m.contactDeltaCents, m.balanceCents]),
    ).toEqual([
      [-10000, 10000, 10000],
      [12000, -12000, -2000],
      [-3000, 3000, 1000],
    ]);
    expect(statement.balanceCents).toBe(1000);
    expect(source[0]).not.toHaveProperty('balanceCents');
  });
  it('preserves same-day input order, metadata and saved edited allocations', () => {
    const statement = contactStatement(
      [
        { ...movement('a', -3000), status: 'pending' },
        { ...movement('b', -7000), status: 'confirmed' },
        { ...movement('r', 4000), status: 'confirmed' },
      ],
      [
        {
          receiptSplitId: 'r',
          allocations: [{ outlaySplitId: 'b', amountCents: 4000 }],
          creditCents: 0,
        },
      ],
    );
    expect(statement.movements.map((m) => [m.splitId, m.balanceCents, m.status])).toEqual([
      ['a', 3000, 'pending'],
      ['b', 10000, 'confirmed'],
      ['r', 6000, 'confirmed'],
    ]);
    expect(statement.outlays.map((m) => m.remainingCents)).toEqual([3000, 3000]);
  });
  it('keeps positive receivables and negative credit in the exact overview chain', () => {
    expect(
      contactTotals([{ balanceCents: 10000 }, { balanceCents: -2000 }, { balanceCents: 0 }]),
    ).toEqual({ receivableCents: 10000, payableCents: 2000, balanceCents: 8000 });
    expect(contactTotals([])).toEqual({ receivableCents: 0, payableCents: 0, balanceCents: 0 });
    expect(() =>
      contactTotals([{ balanceCents: Number.MAX_SAFE_INTEGER }, { balanceCents: 1 }]),
    ).toThrow();
  });
  it('allocates 40 to 30 then 70 oldest first and accepts an edited allocation', () => {
    const outlays = contactStatement([movement('a', -3000), movement('b', -7000)]).outlays;
    expect(allocateContactReceipt(outlays, 4000)).toEqual({
      allocations: [
        { outlaySplitId: 'a', amountCents: 3000 },
        { outlaySplitId: 'b', amountCents: 1000 },
      ],
      creditCents: 0,
    });
    const statement = contactStatement(
      [movement('a', -3000), movement('b', -7000), movement('r', 4000)],
      [
        {
          receiptSplitId: 'r',
          allocations: [{ outlaySplitId: 'b', amountCents: 4000 }],
          creditCents: 0,
        },
      ],
    );
    expect(statement.outlays.map((o) => o.remainingCents)).toEqual([3000, 3000]);
    expect(statement.balanceCents).toBe(6000);
  });
  it('retains 20 credit after 100 owed and 120 received, then consumes credit with a later outlay', () => {
    const movements = [movement('a', -10000), movement('r', 12000)];
    expect(contactStatement(movements)).toMatchObject({ balanceCents: -2000, creditCents: 2000 });
    expect(contactStatement([...movements, movement('b', -3000, '2026-09-02')])).toMatchObject({
      balanceCents: 1000,
      creditCents: 0,
    });
  });
  it('refuses partial, duplicate and future-target allocation', () => {
    const outlays = contactStatement([movement('a', -10000)]).outlays;
    expect(() =>
      allocateContactReceipt(outlays, 4000, [{ outlaySplitId: 'a', amountCents: 2000 }]),
    ).toThrow();
    expect(() =>
      allocateContactReceipt(outlays, 4000, [
        { outlaySplitId: 'a', amountCents: 2000 },
        { outlaySplitId: 'a', amountCents: 2000 },
      ]),
    ).toThrow();
    expect(() =>
      contactStatement(
        [movement('r', 1000), movement('a', -1000, '2026-09-02')],
        [
          {
            receiptSplitId: 'r',
            allocations: [{ outlaySplitId: 'a', amountCents: 1000 }],
            creditCents: 0,
          },
        ],
      ),
    ).toThrow();
  });
});
