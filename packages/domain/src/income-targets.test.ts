import { describe, expect, it } from 'vitest';
import { incomeTargets } from './income-targets';

const input = {
  expected: [240_000, 10_000],
  history: [200_000, 500_000, 220_000],
  heldCents: 0,
  previousHeldCents: 0,
  envelopes: [
    { categoryId: 'rent', goalCents: 80_000, needCents: 0 },
    { categoryId: 'living', goalCents: 180_000, needCents: 30_000 },
  ],
};
describe('income versus monthly targets', () => {
  it('compares all target needs before funding with scheduled income, not the remainder', () => {
    expect(incomeTargets(input)).toMatchObject({
      source: 'expected',
      expectedCents: 250_000,
      targetsCents: 260_000,
      differenceCents: -10_000,
      unfundedCents: 30_000,
      unfundedCategoryIds: ['living'],
    });
  });
  it('prefers an amount rule over a three-month median, preserving zero', () => {
    expect(incomeTargets({ ...input, expected: [], salaryRuleCents: 0 })).toMatchObject({
      source: 'salary_rule',
      expectedCents: 0,
    });
    expect(incomeTargets({ ...input, expected: [] })).toMatchObject({
      source: 'median',
      expectedCents: 220_000,
      differenceCents: -40_000,
    });
  });
  it('does not disguise missing schedule amounts or short history as zero', () => {
    expect(incomeTargets({ ...input, expected: [null] }).differenceCents).toBeNull();
    expect(incomeTargets({ ...input, expected: [], history: [null, 0, 10] }).source).toBe(
      'unavailable',
    );
    expect(incomeTargets({ ...input, expected: [], history: [0, 0, 0] }).expectedCents).toBe(0);
  });
  it('moves only the stored hold into the next month, without changing booked income', () => {
    expect(incomeTargets({ ...input, heldCents: 80_000, previousHeldCents: 30_000 })).toMatchObject(
      { expectedCents: 250_000, assignedIncomeCents: 200_000, differenceCents: -60_000 },
    );
  });
  it('rejects overflow and preserves one-cent targets', () => {
    expect(
      incomeTargets({
        ...input,
        expected: [1],
        envelopes: [{ categoryId: 'tiny', goalCents: 1, needCents: 1 }],
      }).differenceCents,
    ).toBe(0);
    expect(() => incomeTargets({ ...input, expected: [Number.MAX_SAFE_INTEGER, 1] })).toThrow(
      RangeError,
    );
  });
});
