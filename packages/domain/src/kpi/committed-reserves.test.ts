import { expect, it } from 'vitest';
import { committedReserves } from './committed-reserves';

it('sums future envelopes, reserve accounts and the emergency target; negatives commit nothing', () => {
  expect(
    committedReserves({
      futureEnvelopeAvailableCents: [10_000, -500, 2_501],
      reserveAccountCents: [30_000, -1],
      emergencyTargetCents: 90_000,
    }),
  ).toEqual({
    futureEnvelopesCents: 12_501,
    reserveAccountsCents: 30_000,
    emergencyTargetCents: 90_000,
    committedCents: 132_501,
  });
  expect(
    committedReserves({
      futureEnvelopeAvailableCents: [],
      reserveAccountCents: [],
      emergencyTargetCents: -5,
    }).committedCents,
  ).toBe(0);
});
