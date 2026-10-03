import { expect, it } from 'vitest';
import { isBookedCreditCost } from './costs';
const cost = {
  creditAccount: true,
  feeCategory: true,
  categoryKind: 'fixed',
  transfer: false,
  systemEntry: false,
};
it('requires explicit fees and excludes principal, transfers and system balances', () => {
  expect(isBookedCreditCost(cost)).toBe(true);
  for (const patch of [
    { feeCategory: false },
    { categoryKind: 'debt' },
    { transfer: true },
    { systemEntry: true },
  ])
    expect(isBookedCreditCost({ ...cost, ...patch })).toBe(false);
});
