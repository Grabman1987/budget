import { expect, it } from 'vitest';
import { availableInEnvelopes } from './plan-model';

it('sums the available money of the envelopes in integer cents', () => {
  expect(availableInEnvelopes([])).toBe(0);
  expect(
    availableInEnvelopes([
      { availableCents: 1_234 },
      { availableCents: -200 },
      { availableCents: 1 },
    ]),
  ).toBe(1_035);
});
