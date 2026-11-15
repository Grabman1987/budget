import { afterEach, expect, it } from 'vitest';
import {
  accountBalances,
  auditLog,
  budgetSummary,
  category,
  categoryGroup,
  createBooking,
  createEntity,
  createTestDatabase,
  getAssigned,
  getBooking,
  listEntities,
  netWorthAsOf,
  savingsGoal,
  setAssigned,
  undoAuditGroups,
} from '@budget/db';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { applyRestructure, parseRestructureFile } from './operator-restructure';

const opened = createTestDatabase();
afterEach(() => opened.close());

it('rehearses a category restoration without changing balances, wealth or monthly free money', () => {
  const db = opened.db;
  const ctx = { actor: 'synthetic-restoration' };
  seedBasics(db);
  const goal = createEntity(
    db,
    savingsGoal,
    { id: 'synthetic-goal', name: 'Synthetic goal', categoryId: 'reise', targetCents: 900 },
    ctx,
  );
  setAssigned(db, 'essen', '2026-03', 701, ctx);
  setAssigned(db, 'essen', '2026-04', 500, ctx);
  const bookingId = createBooking(
    db,
    {
      accountId: 'giro',
      date: '2026-03-02',
      amountCents: -301,
      splits: [
        { categoryId: 'essen', amountCents: -201 },
        { categoryId: 'essen', amountCents: -100 },
      ],
    },
    ctx,
  );
  const originalBooking = getBooking(db, bookingId)!;
  const originalAssigned = getAssigned(db);
  const originalCategories = listEntities(db, category);
  const originalGroups = listEntities(db, categoryGroup);
  const financials = () => ({
    balances: accountBalances(db, '2026-05-31'),
    wealth: netWorthAsOf(db, '2026-05-31').totalCents,
    free: ['2026-03', '2026-04', '2026-05'].map(
      (month) => budgetSummary(db, month).summary.toBeAssignedCents,
    ),
  });
  const before = financials();
  expect(before.wealth).toBe(99_699);
  expect(before.free).toEqual([99_299, 98_799, 98_799]);
  const plan = parseRestructureFile({
    groups: [{ action: 'create', name: 'Synthetic goals and investing' }],
    categories: [
      { action: 'create', name: 'Synthetic groceries', group: 'Fixkosten', class: 'need' },
      { category: 'Reise', group: 'Synthetic goals and investing' },
      { category: 'Miete', name: 'Synthetic investing', group: 'Synthetic goals and investing' },
      { category: 'Essen', name: 'Synthetic retained category', hidden: true },
    ],
    order: [
      { group: 'Synthetic goals and investing', categories: ['Reise', 'Synthetic investing'] },
      {
        group: 'Fixkosten',
        categories: ['Synthetic groceries', 'Auslagen', 'Synthetic retained category'],
      },
    ],
    splits: [{ splitId: originalBooking.splits[0]!.id, category: 'Synthetic groceries' }],
    assigned: {
      entries: [
        { month: '2026-03', category: 'Synthetic retained category', assignedCents: 100 },
        { month: '2026-03', category: 'Synthetic groceries', assignedCents: 601 },
        { month: '2026-04', category: 'Synthetic retained category', assignedCents: 0 },
        { month: '2026-04', category: 'Synthetic groceries', assignedCents: 500 },
      ],
      expectedDeltaByMonth: { '2026-03': 0, '2026-04': 0 },
    },
  });
  const auditBefore = db.select().from(auditLog).all();
  const preview = applyRestructure(db, plan, ctx, { dryRun: true });
  expect(preview.every((entry) => entry.status !== 'skipped' && entry.groupId === '')).toBe(true);
  expect(financials()).toEqual(before);
  expect(getBooking(db, bookingId)).toEqual(originalBooking);
  expect(getAssigned(db)).toEqual(originalAssigned);
  expect(listEntities(db, category)).toEqual(originalCategories);
  expect(listEntities(db, categoryGroup)).toEqual(originalGroups);
  expect(db.select().from(auditLog).all()).toEqual(auditBefore);

  const applied = applyRestructure(db, plan, ctx);
  expect(applied.map(({ section, status }) => ({ section, status }))).toEqual(
    preview.map(({ section, status }) => ({ section, status })),
  );
  expect(financials()).toEqual(before);
  const target = listEntities(db, category).find((row) => row.name === 'Synthetic groceries')!;
  const restoredBooking = getBooking(db, bookingId)!;
  expect(restoredBooking).toEqual({
    ...originalBooking,
    splits: originalBooking.splits.map((split, index) =>
      index === 0 ? { ...split, categoryId: target.id } : split,
    ),
  });
  expect(getAssigned(db)).toContainEqual({
    categoryId: target.id,
    month: '2026-03',
    assignedCents: 601,
  });
  const retained = listEntities(db, category).find((row) => row.id === 'essen')!;
  expect(retained.hiddenAt).not.toBeNull();
  expect(retained.sortOrder).toBe(2);
  expect(listEntities(db, savingsGoal)).toEqual([goal]);
  const goalsGroup = listEntities(db, categoryGroup).find(
    (row) => row.name === 'Synthetic goals and investing',
  )!;
  expect(
    listEntities(db, category)
      .filter((row) => row.groupId === goalsGroup.id)
      .map((row) => row.id)
      .sort(),
  ).toEqual(['miete', 'reise']);
  expect(
    listEntities(db, categoryGroup).find((row) => row.name === 'Synthetic goals and investing'),
  ).toMatchObject({ sortOrder: 0 });
  const groupIds = [...new Set(applied.map((entry) => entry.groupId))];
  expect(groupIds).toHaveLength(1);
  expect(groupIds[0]).not.toBe('');
  undoAuditGroups(db, groupIds, ctx);
  expect(financials()).toEqual(before);
  expect(getBooking(db, bookingId)).toEqual(originalBooking);
  expect(getAssigned(db)).toEqual(originalAssigned);
  expect(listEntities(db, category)).toEqual(
    originalCategories.map((row) => ({ ...row, updatedAt: expect.any(String) })),
  );
});
