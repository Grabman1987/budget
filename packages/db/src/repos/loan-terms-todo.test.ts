import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { accounts } from './entities';
import { heute } from './heute';
import { seedBasics, testCtx } from './test-helpers';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());

const open = { closedAt: null, interestRateBp: null, installmentCents: null } as const;

it.each([
  { type: 'loan', ...open, missing: true },
  { type: 'loan', ...open, interestRateBp: 0, missing: true },
  { type: 'loan', ...open, installmentCents: 3_000, missing: true },
  { type: 'loan', ...open, interestRateBp: 0, installmentCents: 3_000, missing: false },
  { type: 'loan', ...open, closedAt: '2026-09-01', missing: false },
  { type: 'credit_card', ...open, missing: false },
  { type: 'checking', ...open, missing: false },
] as const)(
  'terms task for $type, interest $interestRateBp, installment $installmentCents, closed $closedAt: $missing',
  ({ missing, ...terms }) => {
    accounts.create(
      opened.db,
      {
        id: 'terms-account',
        name: 'Prüfkonto Konditionen',
        role: 'debt',
        onBudget: false,
        openingDate: '2026-01-01',
        openingBalanceCents: -10_000,
        ...terms,
      },
      testCtx,
    );
    expect(heute(opened.db, { today: '2026-09-17' }).attention.loanTermsMissing).toBe(missing);
  },
);

it('clears the task once the loan is completed and leaves its amount untouched', () => {
  accounts.create(
    opened.db,
    {
      id: 'loan',
      name: 'Kredit Konditionen',
      type: 'loan',
      role: 'debt',
      onBudget: false,
      openingDate: '2026-01-01',
      openingBalanceCents: -10_000,
    },
    testCtx,
  );
  const query = { today: '2026-09-17', month: '2026-08' };
  expect(heute(opened.db, query).attention.loanTermsMissing).toBe(true);
  accounts.update(opened.db, 'loan', { interestRateBp: 0, installmentCents: 3_000 }, testCtx);
  expect(heute(opened.db, query).attention.loanTermsMissing).toBe(false);
  expect(accounts.get(opened.db, 'loan')?.openingBalanceCents).toBe(-10_000);
});
