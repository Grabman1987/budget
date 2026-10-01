import { describe, expect, it } from 'vitest';
import { allocateContactReceipt, contactStatement, type ContactMovement } from './index';
const movement = (splitId: string, amountCents: number, date = '2026-09-01'): ContactMovement => ({
  splitId,
  bookingId: splitId,
  amountCents,
  date,
  memo: null,
});
describe('actual contact statement', () => {
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
