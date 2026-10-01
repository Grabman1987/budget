import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { categoryTarget } from '../schema';
import { undo } from './audit';
import { createBooking } from './bookings';
import { CategoryRuleError, EntityNotFoundError } from './errors';
import { setAssigned } from './envelopes';
import {
  adoptGoalAsCategoryTarget,
  createGoal,
  deleteGoal,
  getGoal,
  listGoals,
  restoreGoal,
  updateGoal,
} from './goals';
import { seedBasics, testCtx as ctx } from './test-helpers';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];
const MONTH = '2026-09';

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
});
afterEach(() => opened.close());

const travel = () =>
  createGoal(
    db,
    { name: 'Urlaub', targetCents: 300_000, targetDate: '2027-07-31', categoryId: 'reise' },
    ctx,
  ).goal;

describe('listGoals', () => {
  it('saved is the envelope available at the end of the month, the forecast uses the last 3', () => {
    const goal = travel();
    // carry in from before: 100,00 assigned in June; 250,00 in July, August, September
    setAssigned(db, 'reise', '2026-06', 10_000, ctx);
    for (const m of ['2026-07', '2026-08', '2026-09']) setAssigned(db, 'reise', m, 25_000, ctx);
    const [row] = listGoals(db, MONTH);
    expect(row).toMatchObject({
      id: goal.id,
      savedCents: 85_000,
      remainingCents: 215_000,
      monthsLeft: 10,
      neededMonthlyCents: 21_500,
      averageRateCents: 25_000,
      forecastMonth: '2027-06',
      status: 'on_track',
    });
    // The month before: its own end-of-month state, not today's.
    expect(getGoal(db, goal.id, '2026-08')).toMatchObject({
      savedCents: 60_000,
      monthsLeft: 11,
      neededMonthlyCents: 21_819,
    });
  });

  it('a spent envelope lowers the saved amount; overspending counts as 0', () => {
    travel();
    setAssigned(db, 'reise', MONTH, 50_000, ctx);
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-09-10',
        amountCents: -70_000,
        splits: [{ categoryId: 'reise', amountCents: -70_000 }],
      },
      ctx,
    );
    const [row] = listGoals(db, MONTH);
    expect(row?.savedCents).toBe(0);
    expect(row?.status).toBe('behind');
  });

  it('an account goal is saved by the account balance and saves at its monthly growth', () => {
    const { goal } = createGoal(
      db,
      { name: 'Reserve', targetCents: 100_000, targetDate: '2027-03-31', accountId: 'spar' },
      ctx,
    );
    for (const [date, amountCents] of [
      ['2026-07-05', 10_000],
      ['2026-08-05', 10_000],
      ['2026-09-05', 10_000],
    ] as const)
      createBooking(
        db,
        { accountId: 'spar', date, amountCents, splits: [{ categoryId: null, amountCents }] },
        ctx,
      );
    expect(getGoal(db, goal.id, MONTH)).toMatchObject({
      savedCents: 30_000,
      averageRateCents: 10_000,
      remainingCents: 70_000,
      forecastMonth: '2027-04',
      status: 'behind',
    });
  });

  it('orders by target date, goals without a date last, and hides deleted goals', () => {
    const late = createGoal(db, { name: 'Später', targetCents: 100, categoryId: 'essen' }, ctx);
    const soon = createGoal(
      db,
      { name: 'Bald', targetCents: 100, targetDate: '2026-12-31', categoryId: 'essen' },
      ctx,
    );
    const gone = travel();
    deleteGoal(db, gone.id, ctx);
    expect(listGoals(db, MONTH).map((g) => g.id)).toEqual([soon.goal.id, late.goal.id]);
    expect(listGoals(db, MONTH, { includeDeleted: true })).toHaveLength(3);
  });
});

describe('writes', () => {
  it('requires a positive target, a name and one link that exists', () => {
    const bad = (input: Parameters<typeof createGoal>[1]) => () => createGoal(db, input, ctx);
    expect(bad({ name: 'X', targetCents: 0, categoryId: 'reise' })).toThrow(CategoryRuleError);
    expect(bad({ name: '  ', targetCents: 100, categoryId: 'reise' })).toThrow(CategoryRuleError);
    expect(bad({ name: 'X', targetCents: 100, categoryId: 'reise', accountId: 'spar' })).toThrow(
      CategoryRuleError,
    );
    expect(bad({ name: 'X', targetCents: 100, categoryId: 'nope' })).toThrow(EntityNotFoundError);
  });

  it('switching the link clears the other side; undo restores the row', () => {
    const goal = travel();
    const { goal: moved, groupId } = updateGoal(db, goal.id, { accountId: 'spar' }, ctx);
    expect(moved).toMatchObject({ categoryId: null, accountId: 'spar' });
    undo(db, { groupId }, ctx);
    expect(getGoal(db, goal.id, MONTH)).toMatchObject({ categoryId: 'reise', accountId: null });
  });

  it('delete, undo and restore', () => {
    const goal = travel();
    const { groupId } = deleteGoal(db, goal.id, ctx);
    expect(listGoals(db, MONTH)).toHaveLength(0);
    undo(db, { groupId }, ctx);
    expect(listGoals(db, MONTH)).toHaveLength(1);
    deleteGoal(db, goal.id, ctx);
    restoreGoal(db, goal.id, ctx);
    expect(listGoals(db, MONTH)).toHaveLength(1);
  });
});

describe('adoptGoalAsCategoryTarget', () => {
  it('writes a by_date target in one audit group that one undo removes', () => {
    const goal = travel();
    const { groupId } = adoptGoalAsCategoryTarget(db, goal.id, MONTH, ctx);
    const tree = db.select().from(categoryTarget).all();
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      categoryId: 'reise',
      kind: 'by_date',
      amountCents: 300_000,
      targetDate: '2027-07-31',
      validFrom: MONTH,
      deletedAt: null,
    });
    undo(db, { groupId }, ctx);
    expect(
      db
        .select()
        .from(categoryTarget)
        .all()
        .filter((t) => t.deletedAt === null),
    ).toEqual([]);
  });

  it('needs a category and a date', () => {
    const noDate = createGoal(db, { name: 'A', targetCents: 100, categoryId: 'reise' }, ctx).goal;
    const account = createGoal(
      db,
      { name: 'B', targetCents: 100, targetDate: '2027-01-31', accountId: 'spar' },
      ctx,
    ).goal;
    expect(() => adoptGoalAsCategoryTarget(db, noDate.id, MONTH, ctx)).toThrow(CategoryRuleError);
    expect(() => adoptGoalAsCategoryTarget(db, account.id, MONTH, ctx)).toThrow(CategoryRuleError);
  });
});
