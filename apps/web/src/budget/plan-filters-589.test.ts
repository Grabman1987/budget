import { expect, it } from 'vitest';
import { categoryNameMatches, filterPlanRows, validatePlanFilterSearch } from './plan-filters';
import { planMulti, planRows } from './plan-model';
import type { BudgetMonthView, EnvelopeSummary } from './budget-api';

const envelope = (
  categoryId: string,
  availableCents: number,
  needCents: number,
  activityCents = 0,
): EnvelopeSummary => ({
  categoryId,
  carryCents: 0,
  assignedCents: 0,
  activityCents,
  availableCents,
  overspentCents: 0,
  cashOverspentCents: 0,
  creditOverspentCents: 0,
  fundedCardCents: 0,
  goalCents: 0,
  needCents,
  dueMonth: null,
  target: null,
});
function fixture(month = '2026-10'): BudgetMonthView {
  return {
    groups: [{ id: 'group', name: 'Synthetic group', sortOrder: 0 }],
    categories: ['A', 'B', 'C', 'E', 'hidden-empty', 'hidden-active', 'hidden-balance'].map(
      (id, sortOrder) => ({
        id,
        name: id === 'A' ? 'Äpfel & Gemüse' : id,
        icon: null,
        groupId: 'group',
        class: 'need',
        kind: 'variable',
        stage: 2,
        cardAccountId: null,
        rolloverOverspending: false,
        sortOrder,
        hiddenAt: id.startsWith('hidden') ? '2026-09-01' : null,
        splitCount: 0,
      }),
    ),
    summary: {
      month,
      carryInCents: 0,
      incomeCents: 0,
      uncoveredCents: 0,
      heldCents: 0,
      assignedCents: 0,
      activityCents: 0,
      availableCents: 0,
      toBeAssignedCents: 0,
      creditOverspentCents: 0,
      cashOverspentCents: 0,
      cards: [],
      envelopes: [
        envelope('A', -300, 500),
        envelope('B', 200, 0),
        envelope('C', 0, 0),
        envelope('E', -100, 0),
        envelope('hidden-empty', 0, 0),
        envelope('hidden-active', 0, 0, -1),
        envelope('hidden-balance', 1, 0),
      ],
    },
  };
}

it('uses independent literal ID sets for every filter and retains the real hidden-category boundary', () => {
  const rows = planRows(fixture());
  expect(rows.map((row) => row.id)).toEqual([
    'A',
    'B',
    'C',
    'E',
    'hidden-active',
    'hidden-balance',
  ]);
  const visible = rows.filter((row) => !row.id.startsWith('hidden'));
  expect(filterPlanRows(visible, 'all').map((row) => row.id)).toEqual(['A', 'B', 'C', 'E']);
  expect(filterPlanRows(visible, 'underfunded').map((row) => row.id)).toEqual(['A']);
  expect(filterPlanRows(visible, 'overspent').map((row) => row.id)).toEqual(['A', 'E']);
  expect(filterPlanRows(visible, 'available').map((row) => row.id)).toEqual(['B']);
  expect(filterPlanRows(visible, 'uncategorized')).toEqual([]);
  expect(filterPlanRows(rows, 'all').some((row) => row.id === 'hidden-empty')).toBe(false);
  expect(filterPlanRows(rows, 'available').map((row) => row.id)).toEqual(['B', 'hidden-balance']);
});

it('normalizes only presentation search and validates URL values without inventing a filter', () => {
  expect(categoryNameMatches('Äpfel & Gemüse', '  ÄPFEL  ')).toBe(true);
  expect(categoryNameMatches('Äpfel & Gemüse', 'gemÜse')).toBe(true);
  expect(categoryNameMatches('Äpfel & Gemüse', 'Miete')).toBe(false);
  expect(categoryNameMatches('Äpfel & Gemüse', '   ')).toBe(true);
  expect(validatePlanFilterSearch({ filter: 'overspent', q: 'Äpfel' })).toEqual({
    filter: 'overspent',
    q: 'Äpfel',
  });
  expect(validatePlanFilterSearch({ filter: 'bogus', q: 12 })).toEqual({
    filter: undefined,
    q: undefined,
  });
  expect(validatePlanFilterSearch({ filter: ['available'], q: null })).toEqual({
    filter: undefined,
    q: undefined,
  });
  expect(validatePlanFilterSearch({ q: 'x'.repeat(101) }).q).toBe('x'.repeat(100));
});

it('preserves monthly cells and counts one matching category identity across multiple visible months', () => {
  const october = fixture();
  const november = fixture('2026-11');
  november.summary.envelopes = [
    envelope('A', -50, 0),
    envelope('B', -200, 300),
    envelope('C', 100, 0),
    envelope('E', 0, 0),
    envelope('hidden-empty', 0, 0),
    envelope('hidden-active', 0, 0),
    envelope('hidden-balance', 0, 0),
  ];
  const rows = planMulti([october, november]).flatMap((group) => group.rows);
  const actual = rows.filter((row) =>
    row.cells.some((cell) => cell && filterPlanRows([cell], 'overspent').length > 0),
  );
  expect(actual.map((row) => row.id)).toEqual(['A', 'B', 'E']);
  expect(actual.map((row) => row.cells.map((cell) => cell?.availableCents))).toEqual([
    [-300, -50],
    [200, -200],
    [-100, 0],
  ]);
  expect(
    rows
      .filter((row) =>
        row.cells.some((cell) => cell && filterPlanRows([cell], 'underfunded').length > 0),
      )
      .map((row) => row.id),
  ).toEqual(['A', 'B']);
  expect(
    rows
      .filter((row) =>
        row.cells.some((cell) => cell && filterPlanRows([cell], 'available').length > 0),
      )
      .map((row) => row.id),
  ).toEqual(['B', 'C', 'hidden-balance']);
});
