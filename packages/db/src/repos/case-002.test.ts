import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import { categoryGroup } from '../schema';
import { undo } from './audit';
import { createBooking } from './bookings';
import { createCategory } from './categories';
import { accounts, createEntity } from './entities';
import { accountBalances, budget } from './queries';

let opened: ReturnType<typeof createTestDatabase>;
const actor = { actor: 'synthetic-case-002' };
beforeEach(() => {
  opened = createTestDatabase();
});
afterEach(() => opened.close());

describe('WP-001 / CASE-002 cash overspending reference evidence', () => {
  it.each([
    { rolloverOverspending: false, carry: 0, free: 97_500, uncovered: 2_500, overspent: 0 },
    { rolloverOverspending: true, carry: -2_500, free: 100_000, uncovered: 0, overspent: 2_500 },
  ])(
    'rolloverOverspending=$rolloverOverspending counts the 2,500-cent deficit once',
    (expected) => {
      const db = opened.db;
      const account = accounts.create(
        db,
        {
          name: 'Synthetic CASE-002 account',
          type: 'checking',
          role: 'budget',
          onBudget: true,
          openingDate: '2023-10-01',
          openingBalanceCents: 100_000,
        },
        actor,
      );
      const group = createEntity(db, categoryGroup, { name: 'Synthetic CASE-002 group' }, actor);
      const category = createCategory(
        db,
        {
          name: 'Synthetic CASE-002 category',
          groupId: group.id,
          class: 'need',
          rolloverOverspending: expected.rolloverOverspending,
        },
        actor,
      );
      const read = () => ({
        balances: accountBalances(db, '2023-11-30'),
        months: budget(db, ['2023-10', '2023-11']),
      });
      const initial = read();
      const expense = { ...actor, groupId: randomUUID() };
      createBooking(
        db,
        {
          accountId: account.id,
          date: '2023-10-31',
          amountCents: -2_500,
          status: 'confirmed',
          splits: [{ categoryId: category.id, amountCents: -2_500 }],
        },
        expense,
      );
      const { balances, months } = read();
      expect(balances).toEqual([{ accountId: account.id, balanceCents: 97_500 }]);
      const [october, november] = months;
      // 100,000 - 2,500 cash; October's -2,500 envelope retains the uncovered obligation.
      expect(october).toMatchObject({
        cashCents: 97_500,
        toBeAssignedCents: 100_000,
        creditOverspentCents: 0,
        uncoveredCents: 0,
      });
      expect(october!.envelopes[category.id]).toMatchObject({
        carryCents: 0,
        assignedCents: 0,
        activityCents: -2_500,
        availableCents: -2_500,
        overspentCents: 2_500,
        cashOverspentCents: 2_500,
        creditOverspentCents: 0,
      });
      // Reset consumes 2,500 free cents once; carry retains that obligation in the envelope.
      expect(november).toMatchObject({
        cashCents: 97_500,
        toBeAssignedCents: expected.free,
        uncoveredCents: expected.uncovered,
        creditOverspentCents: 0,
      });
      expect(november!.envelopes[category.id]).toMatchObject({
        carryCents: expected.carry,
        assignedCents: 0,
        activityCents: 0,
        availableCents: expected.carry,
        overspentCents: expected.overspent,
        cashOverspentCents: expected.overspent,
        creditOverspentCents: 0,
      });
      undo(db, { groupId: expense.groupId }, actor);
      // Undo must invalidate both months, not leave stale carry or free-fund deductions.
      expect(read()).toEqual(initial);
      expect(read().balances).toEqual([{ accountId: account.id, balanceCents: 100_000 }]);
    },
  );
});
