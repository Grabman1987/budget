import { describe, expect, it } from 'vitest';
import { bookingLineShares } from '../index';

// Literal cent expectations catch lost remainders and percentages applied to the wrong base.
const allocate = bookingLineShares;

describe('booking line contact shares', () => {
  it.each([
    [10001, [{ mode: 'percent', value: 3333 }], { categoryCents: 6668, contactCents: [3333] }],
    [1999, [{ mode: 'percent', value: 5000 }], { categoryCents: 1000, contactCents: [999] }],
    [12000, [{ mode: 'amount', value: 2000 }], { categoryCents: 10000, contactCents: [2000] }],
    [
      101,
      [
        { mode: 'percent', value: 3333 },
        { mode: 'percent', value: 3333 },
      ],
      { categoryCents: 34, contactCents: [34, 33] },
    ],
    [
      10001,
      [
        { mode: 'amount', value: 2000 },
        { mode: 'percent', value: 5000 },
      ],
      { categoryCents: 3001, contactCents: [2000, 5000] },
    ],
  ] as const)('conserves %i cents with exact category remainder', (amount, shares, expected) => {
    expect(allocate(amount, [...shares])).toEqual(expected);
  });
  it.each([
    [100, [{ mode: 'amount', value: 101 }]],
    [100, [{ mode: 'percent', value: 10001 }]],
    [100, [{ mode: 'percent', value: -1 }]],
    [100, [{ mode: 'amount', value: 0.5 }]],
    [
      100,
      [
        { mode: 'percent', value: 6000 },
        { mode: 'percent', value: 6000 },
      ],
    ],
    [Number.MAX_SAFE_INTEGER + 1, []],
  ] as const)('rejects invalid/overallocated shares of %i cents', (amount, shares) => {
    expect(() => allocate(amount, [...shares])).toThrow(RangeError);
  });
});
