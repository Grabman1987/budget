import { describe, expect, it } from 'vitest';
import { budgetMonths, type BudgetInput } from './budget';

describe('WP-001 / CASE-002 cash overspending reference evidence', () => {
  it.each([
    { rolloverOverspending: false, carry: 0, free: 97_500, uncovered: 2_500, overspent: 0 },
    { rolloverOverspending: true, carry: -2_500, free: 100_000, uncovered: 0, overspent: 2_500 },
  ])(
    'rolloverOverspending=$rolloverOverspending counts the 2,500-cent cash deficit once',
    (expected) => {
      const input: BudgetInput = {
        accounts: [
          {
            id: 'synthetic-case-002-account',
            onBudget: true,
            openingDate: '2023-10-01',
            openingBalanceCents: 100_000,
          },
        ],
        categories: [
          {
            id: 'synthetic-case-002-category',
            kind: 'variable',
            rolloverOverspending: expected.rolloverOverspending,
          },
        ],
        months: ['2023-10', '2023-11'],
        splits: [
          {
            accountId: 'synthetic-case-002-account',
            date: '2023-10-31',
            amountCents: -2_500,
            categoryId: 'synthetic-case-002-category',
          },
        ],
      };

      const [october, november] = budgetMonths(input);
      // The cash left once; October still represents the obligation in the negative envelope.
      expect(october).toMatchObject({
        month: '2023-10',
        cashCents: 97_500,
        toBeAssignedCents: 100_000,
        uncoveredCents: 0,
        creditOverspentCents: 0,
      });
      expect(october!.envelopes['synthetic-case-002-category']).toMatchObject({
        carryCents: 0,
        assignedCents: 0,
        activityCents: -2_500,
        availableCents: -2_500,
        overspentCents: 2_500,
        cashOverspentCents: 2_500,
        creditOverspentCents: 0,
      });
      // Reset deducts the deficit from free funds; carry retains it only in the envelope.
      expect(november).toMatchObject({
        month: '2023-11',
        cashCents: 97_500,
        toBeAssignedCents: expected.free,
        uncoveredCents: expected.uncovered,
        creditOverspentCents: 0,
      });
      expect(november!.envelopes['synthetic-case-002-category']).toMatchObject({
        carryCents: expected.carry,
        assignedCents: 0,
        activityCents: 0,
        availableCents: expected.carry,
        overspentCents: expected.overspent,
        cashOverspentCents: expected.overspent,
        creditOverspentCents: 0,
      });
    },
  );
});
