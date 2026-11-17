import { expect, it } from 'vitest';
import { committedReserves } from './committed-reserves';

it.each([
  [900_000, false, 600_000, 0, 900_000, 0, 0],
  [100_000, false, 600_000, 0, 600_000, 500_000, 0],
  [200_000, true, 0, 200_000, 200_000, 0, 200_000],
  [200_000, false, 0, 200_000, 400_000, 0, 0],
  [300_000, true, 600_000, 200_000, 800_000, 300_000, 0],
])(
  'nets only on-budget surplus: %i, on-budget %s, target %i, future %i',
  (reserve, onBudget, target, future, expected, shortfall, overlap) => {
    expect(
      committedReserves({
        futureEnvelopeAvailableCents: [future, -500],
        reserveAccounts: [
          { balanceCents: reserve, onBudget },
          { balanceCents: -1, onBudget },
        ],
        emergency: { averageNeedCents: target, targetMonths: 1 },
      }),
    ).toEqual({
      futureEnvelopesCents: future,
      reserveAccountsCents: reserve,
      emergencyTargetCents: target,
      targetShortfallCents: shortfall,
      nettedOverlapCents: overlap,
      committedCents: expected,
    });
  },
);

it('covers the target from off-budget reserves before netting on-budget surplus', () => {
  expect(
    committedReserves({
      futureEnvelopeAvailableCents: [200_000],
      reserveAccounts: [
        { balanceCents: 500_000, onBudget: false },
        { balanceCents: 300_000, onBudget: true },
      ],
      emergency: { averageNeedCents: 100_000, targetMonths: 6 },
    }),
  ).toMatchObject({
    emergencyTargetCents: 600_000,
    nettedOverlapCents: 200_000,
    committedCents: 800_000,
  });
});

it.each([0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid cents %s before clamping',
  (invalid) => {
    const base = {
      futureEnvelopeAvailableCents: [],
      reserveAccounts: [],
      emergency: { averageNeedCents: 0, targetMonths: 6 },
    };
    expect(() => committedReserves({ ...base, futureEnvelopeAvailableCents: [invalid] })).toThrow(
      RangeError,
    );
    expect(() =>
      committedReserves({ ...base, reserveAccounts: [{ balanceCents: invalid, onBudget: true }] }),
    ).toThrow(RangeError);
    expect(() =>
      committedReserves({ ...base, emergency: { averageNeedCents: invalid, targetMonths: 6 } }),
    ).toThrow(RangeError);
  },
);

it('nets overlap before summing at the safe-integer boundary', () => {
  expect(
    committedReserves({
      futureEnvelopeAvailableCents: [2],
      reserveAccounts: [{ balanceCents: 9_007_199_254_740_991, onBudget: true }],
      emergency: { averageNeedCents: 0, targetMonths: 6 },
    }).committedCents,
  ).toBe(9_007_199_254_740_991);
});
