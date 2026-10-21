import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { auditLog, booking, categoryTarget, envelopeMonth, savingsGoal } from '../schema';
import { undo } from './audit';
import { createBooking, createTransfer } from './bookings';
import { assignMany, moveMoney } from './budget';
import { createCategory, createCategoryGroup } from './categories';
import { accounts } from './entities';
import { CategoryRuleError } from './errors';
import { completeGoal, createGoal, fundGoalRate, getGoal, updateGoal } from './goals';
import { planMonthViews } from './plan-months';
import { accountBalances } from './queries';

const MONTH = '2026-10';
const ACTOR = { actor: 'synthetic-goal-604' };
let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

function day(value: string) {
  vi.setSystemTime(new Date(`${value}T10:00:00Z`));
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  day('2026-10-01');
  opened = createTestDatabase();
  // The standard SQLite audit/default clock must share the application's synthetic day.
  // Keep real writer-created snapshots; never UPDATE audit timestamps into invented history.
  opened.sqlite.function('strftime', { varargs: true }, (...args) => {
    if (args.length !== 2 || args[0] !== '%Y-%m-%dT%H:%M:%fZ' || args[1] !== 'now')
      throw new Error('Unexpected synthetic clock request');
    return new Date().toISOString();
  });
  db = opened.db;
});
afterEach(() => {
  opened?.close();
  vi.useRealTimers();
});

function fixture(openingCents = 500000, startMonth = MONTH) {
  // Real audited writers only: no forged lifecycle points, target ownership or audit snapshots.
  accounts.create(db, { id: 'cash-604', name: 'Synthetic budget', type: 'checking', role: 'budget', onBudget: true, currency: 'EUR', openingDate: '2026-10-01', openingBalanceCents: openingCents }, ACTOR);
  accounts.create(db, { id: 'reserve-604', name: 'Synthetic reserve', type: 'savings', role: 'reserve', onBudget: true, currency: 'EUR', openingDate: '2026-10-01', openingBalanceCents: 0 }, ACTOR);
  const group = createCategoryGroup(db, 'Synthetic goals', ACTOR);
  const source = createCategory(db, { name: 'Synthetic goal envelope', groupId: group.id, class: 'future', kind: 'saving', stage: 3 }, ACTOR);
  const other = createCategory(db, { name: 'Synthetic other envelope', groupId: group.id, class: 'need', kind: 'variable', stage: 2 }, ACTOR);
  const { goal } = createGoal(db, { name: 'Synthetic October goal', categoryId: source.id, targetCents: 120000, targetDate: '2026-12-31', startMonth }, ACTOR, MONTH, '2026-10-01');
  return { goalId: goal.id, categoryId: source.id, otherId: other.id };
}
function plan(categoryId: string, month = MONTH, today = '2026-10-01') {
  const view = planMonthViews(db, [month], {}, today)[month]!;
  const envelope = view.summary.envelopes.find((row) => row.categoryId === categoryId);
  expect(envelope).toBeDefined();
  return { envelope: envelope!, tba: view.summary.toBeAssignedCents };
}
function goal(goalId: string, today = '2026-10-01', month = MONTH) {
  return getGoal(db, goalId, month, today);
}
function auditGroup(groupId: string) {
  return db.select().from(auditLog).where(eq(auditLog.groupId, groupId)).all();
}
function liveBookings() {
  return db.select().from(booking).where(isNull(booking.deletedAt)).all();
}
function unchangedReadOrRefusal(run: () => void) {
  const bytes = opened.sqlite.serialize();
  const changes = opened.sqlite.prepare('SELECT total_changes() AS n').get();
  run();
  expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
  expect(opened.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(changes);
  expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
}

describe('canonical Plan funding and real DB goal lifecycle (#604)', () => {
  it('shows40000 rate, adds only25000 after15000 assignment, refuses stale intent and really undoes/redoes that one assignment', () => {
    const ids = fixture();
    expect(plan(ids.categoryId)).toMatchObject({ envelope: { goalCents: 40000, needCents: 40000, assignedCents: 0, availableCents: 0 }, tba: 500000 });
    const initialToken = goal(ids.goalId).funding!.reviewToken;
    assignMany(db, MONTH, [{ categoryId: ids.categoryId, assignedCents: 15000 }], ACTOR);
    const partial = goal(ids.goalId);
    expect(partial).toMatchObject({ savedCents: 15000, funding: { monthlyCents: 40000, remainingCents: 25000, conflict: null } });
    // This old future-only forecast is intentionally NOT the current Plan rate or action amount.
    expect(partial.neededMonthlyCents).toBe(52500);
    expect(plan(ids.categoryId)).toMatchObject({ envelope: { goalCents: 40000, needCents: 25000, assignedCents: 15000, availableCents: 15000 }, tba: 485000 });
    unchangedReadOrRefusal(() => {
      expect(() => fundGoalRate(db, ids.goalId, MONTH, initialToken, ACTOR, '2026-10-01')).toThrow(CategoryRuleError);
    });
    const funded = fundGoalRate(db, ids.goalId, MONTH, partial.funding!.reviewToken, ACTOR, '2026-10-01');
    expect(funded).toMatchObject({ changedCount: 1, assignedCents: 25000 });
    expect(auditGroup(funded.groupId).map((row) => row.entityType)).toEqual(['envelope_month']);
    expect(db.select().from(envelopeMonth).where(and(eq(envelopeMonth.categoryId, ids.categoryId), isNull(envelopeMonth.deletedAt))).all()).toHaveLength(1);
    expect(plan(ids.categoryId)).toMatchObject({ envelope: { goalCents: 40000, needCents: 0, assignedCents: 40000, availableCents: 40000 }, tba: 460000 });
    expect(goal(ids.goalId).funding).toMatchObject({ monthlyCents: 40000, remainingCents: 0, conflict: null });
    unchangedReadOrRefusal(() => {
      const repeated = fundGoalRate(db, ids.goalId, MONTH, goal(ids.goalId).funding!.reviewToken, ACTOR, '2026-10-01');
      expect(repeated).toMatchObject({ changedCount: 0, assignedCents: 0 });
      expect(auditGroup(repeated.groupId)).toHaveLength(0);
    });
    const undone = undo(db, { groupId: funded.groupId }, ACTOR);
    expect(undone.entries).toHaveLength(1);
    expect(plan(ids.categoryId)).toMatchObject({ envelope: { assignedCents: 15000, goalCents: 40000, needCents: 25000, availableCents: 15000 }, tba: 485000 });
    expect(goal(ids.goalId).funding).toMatchObject({ monthlyCents: 40000, remainingCents: 25000 });
    expect(undo(db, { groupId: undone.groupId }, ACTOR).entries).toHaveLength(1);
    expect(plan(ids.categoryId)).toMatchObject({ envelope: { assignedCents: 40000, goalCents: 40000, needCents: 0 }, tba: 460000 });
    expect(liveBookings()).toEqual([]);
    expect(accountBalances(db).find((row) => row.accountId === 'cash-604')?.balanceCents).toBe(500000);
  });

  it('uses the selected start month, blocks October before a November start, and undoes the explicit start edit', () => {
    const ids = fixture(500000, '2026-11');
    const future = goal(ids.goalId);
    expect(future.effectiveStartMonth).toBe('2026-11');
    expect(future.funding?.conflict).not.toBeNull();
    expect(plan(ids.categoryId).envelope).toMatchObject({ target: null, goalCents: 0, assignedCents: 0 });
    expect(goal(ids.goalId, '2026-10-01', '2026-11').funding).toMatchObject({ monthlyCents: 60000, remainingCents: 60000, conflict: null });
    expect(plan(ids.categoryId, '2026-11').envelope).toMatchObject({ goalCents: 60000, needCents: 60000, target: { validFrom: '2026-11' } });
    unchangedReadOrRefusal(() => {
      expect(() => fundGoalRate(db, ids.goalId, MONTH, future.funding!.reviewToken, ACTOR, '2026-10-01')).toThrow(CategoryRuleError);
    });
    const changed = updateGoal(db, ids.goalId, { startMonth: MONTH }, ACTOR, MONTH, '2026-10-01');
    expect(goal(ids.goalId)).toMatchObject({ effectiveStartMonth: MONTH, funding: { monthlyCents: 40000, remainingCents: 40000, conflict: null } });
    expect(plan(ids.categoryId).envelope).toMatchObject({ goalCents: 40000, needCents: 40000, target: { validFrom: MONTH } });
    undo(db, { groupId: changed.groupId }, ACTOR);
    expect(goal(ids.goalId).effectiveStartMonth).toBe('2026-11');
    expect(plan(ids.categoryId).envelope.target).toBeNull();
    expect(db.select().from(categoryTarget).where(and(eq(categoryTarget.categoryId, ids.categoryId), isNull(categoryTarget.deletedAt))).all().map((row) => row.validFrom)).toEqual(['2026-11']);
    expect(liveBookings()).toEqual([]);
  });

  it('retains proven reaching after reassignment and a neutral transfer, then completes only on a real expense with financial Undo/Redo', () => {
    const ids = fixture();
    expect(goal(ids.goalId).lifecycle).toMatchObject({ state: 'open', reason: null, evidence: 'proven' });
    day('2026-10-02');
    assignMany(db, MONTH, [{ categoryId: ids.categoryId, assignedCents: 120000 }], ACTOR);
    expect(goal(ids.goalId, '2026-10-02').lifecycle).toEqual({ state: 'reached', reason: null, reachedOn: '2026-10-02', completedOn: null, evidence: 'proven' });
    day('2026-10-03');
    moveMoney(db, MONTH, ids.categoryId, ids.otherId, 10000, ACTOR);
    expect(goal(ids.goalId, '2026-10-03')).toMatchObject({ savedCents: 110000, lifecycle: { state: 'reached', completedOn: null, evidence: 'proven' } });
    createTransfer(db, { fromAccountId: 'cash-604', toAccountId: 'reserve-604', date: '2026-10-03', amountCents: 5000 }, ACTOR);
    expect(goal(ids.goalId, '2026-10-03')).toMatchObject({ savedCents: 110000, lifecycle: { state: 'reached', reason: null, completedOn: null, evidence: 'proven' } });
    expect(liveBookings().map((row) => row.amountCents).sort((a, b) => a - b)).toEqual([-5000, 5000]);
    day('2026-10-04');
    const expenseGroup = randomUUID();
    const bookingId = createBooking(db, { accountId: 'cash-604', date: '2026-10-04', amountCents: -2000, splits: [{ categoryId: ids.categoryId, amountCents: -2000 }] }, { ...ACTOR, groupId: expenseGroup });
    expect(auditGroup(expenseGroup).map((row) => row.entityType).sort()).toEqual(['booking', 'booking_split']);
    expect(goal(ids.goalId, '2026-10-04')).toMatchObject({ savedCents: 108000, lifecycle: { state: 'completed', reason: 'expense', reachedOn: '2026-10-02', completedOn: '2026-10-04', evidence: 'proven' } });
    expect(plan(ids.categoryId, MONTH, '2026-10-04')).toMatchObject({ envelope: { availableCents: 108000, assignedCents: 110000 }, tba: 380000 });
    expect(liveBookings()).toHaveLength(3);
    const undone = undo(db, { groupId: expenseGroup }, ACTOR);
    expect(undone.entries).toHaveLength(2);
    expect(goal(ids.goalId, '2026-10-04')).toMatchObject({ savedCents: 110000, lifecycle: { state: 'reached', reason: null, reachedOn: '2026-10-02', completedOn: null, evidence: 'proven' } });
    expect(liveBookings()).toHaveLength(2);
    expect(db.select().from(booking).where(eq(booking.id, bookingId)).get()).toMatchObject({ id: bookingId, deletedAt: expect.any(String) });
    expect(undo(db, { groupId: undone.groupId }, ACTOR).entries).toHaveLength(2);
    expect(goal(ids.goalId, '2026-10-04').lifecycle).toMatchObject({ state: 'completed', reason: 'expense', completedOn: '2026-10-04', evidence: 'proven' });
    expect(liveBookings()).toHaveLength(3);
    expect(db.select().from(savingsGoal).where(eq(savingsGoal.id, ids.goalId)).get()?.deletedAt).toBeNull();
    expect(accountBalances(db).find((row) => row.accountId === 'cash-604')?.balanceCents).toBe(493000);
    expect(accountBalances(db).find((row) => row.accountId === 'reserve-604')?.balanceCents).toBe(5000);
  });

  it('stores manual completion without money writes, keeps repeated completion a no-op and restores intent through real Undo/Redo', () => {
    const ids = fixture();
    const balances = accountBalances(db);
    const assigned = db.select().from(envelopeMonth).all();
    day('2026-10-03');
    const completed = completeGoal(db, ids.goalId, '2026-10-03', ACTOR);
    expect(completed.changedCount).toBe(1);
    expect(auditGroup(completed.groupId).map((row) => row.entityType)).toEqual(['savings_goal']);
    expect(goal(ids.goalId, '2026-10-03').lifecycle).toMatchObject({ state: 'completed', reason: 'manual', completedOn: '2026-10-03' });
    unchangedReadOrRefusal(() => {
      const repeated = completeGoal(db, ids.goalId, '2026-10-04', ACTOR);
      expect(repeated.changedCount).toBe(0); expect(auditGroup(repeated.groupId)).toHaveLength(0);
      const current = goal(ids.goalId, '2026-10-03');
      expect(() => fundGoalRate(db, ids.goalId, MONTH, current.funding!.reviewToken, ACTOR, '2026-10-03')).toThrow(CategoryRuleError);
    });
    const undone = undo(db, { groupId: completed.groupId }, ACTOR);
    expect(undone.entries).toHaveLength(1);
    expect(goal(ids.goalId, '2026-10-03').lifecycle).toMatchObject({ state: 'open', reason: null, completedOn: null });
    expect(undo(db, { groupId: undone.groupId }, ACTOR).entries).toHaveLength(1);
    expect(goal(ids.goalId, '2026-10-03').lifecycle).toMatchObject({ state: 'completed', reason: 'manual', completedOn: '2026-10-03' });
    expect(accountBalances(db)).toEqual(balances);
    expect(db.select().from(envelopeMonth).all()).toEqual(assigned);
    expect(liveBookings()).toEqual([]);
    expect(db.select().from(savingsGoal).where(eq(savingsGoal.id, ids.goalId)).get()?.deletedAt).toBeNull();
  });

  it('refuses the remaining25000 when only5000 is assignable without a partial assignment or audit write', () => {
    const ids = fixture(20000);
    assignMany(db, MONTH, [{ categoryId: ids.categoryId, assignedCents: 15000 }], ACTOR);
    const current = goal(ids.goalId);
    expect(current.funding).toMatchObject({ monthlyCents: 40000, remainingCents: 25000, conflict: null });
    expect(plan(ids.categoryId).tba).toBe(5000);
    unchangedReadOrRefusal(() => {
      expect(() => fundGoalRate(db, ids.goalId, MONTH, current.funding!.reviewToken, ACTOR, '2026-10-01')).toThrow(CategoryRuleError);
    });
    expect(plan(ids.categoryId)).toMatchObject({ envelope: { assignedCents: 15000, needCents: 25000, availableCents: 15000 }, tba: 5000 });
    expect(accountBalances(db).find((row) => row.accountId === 'cash-604')?.balanceCents).toBe(20000);
    expect(liveBookings()).toEqual([]);
  });
});
