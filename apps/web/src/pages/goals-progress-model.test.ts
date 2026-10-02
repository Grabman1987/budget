import { describe, expect, it } from 'vitest';
import type { GoalView } from '../budget/goals-api';
import { goalReportRows } from './goals-progress-model';
const goal = (patch: Partial<GoalView> = {}): GoalView => ({
  id: 'goal',
  name: 'Reiseziel',
  categoryId: 'travel',
  accountId: null,
  targetCents: 300000,
  targetDate: '2027-07-31',
  note: null,
  savedCents: 85000,
  remainingCents: 215000,
  monthsLeft: 10,
  neededMonthlyCents: 21500,
  averageRateCents: 25000,
  forecastMonth: '2027-06',
  status: 'on_track',
  ...patch,
});
const categories = [{ id: 'travel', name: 'Reisen', class: 'want' }];
const accounts = [{ id: 'reserve', name: 'Reservekonto', currency: 'EUR' }];
describe('goal report source guard, without recalculating API money', () => {
  it('preserves the literal category oracle and linked EUR account figures exactly', () => {
    const p = goal();
    const account = goal({
      id: 'reserve-goal',
      categoryId: null,
      accountId: 'reserve',
      targetCents: 100000,
      savedCents: 30000,
      remainingCents: 70000,
      averageRateCents: 10000,
      neededMonthlyCents: 11667,
      monthsLeft: 6,
      targetDate: '2027-03-31',
      forecastMonth: '2027-04',
      status: 'behind',
    });
    const r = goalReportRows([p, account], categories, accounts);
    expect(r[0]!.progress).toBe(p);
    expect(r[0]).toMatchObject({
      source: { kind: 'category', id: 'travel', name: 'Reisen' },
      reason: null,
    });
    expect(r[1]!.progress).toBe(account);
    expect(r[1]).toMatchObject({
      source: { kind: 'account', id: 'reserve', name: 'Reservekonto' },
      reason: null,
    });
  });
  it('withholds figures for no source, missing/deleted source, both links and foreign currency', () => {
    const goals = [
      goal({ id: 'none', categoryId: null }),
      goal({ id: 'missing', categoryId: 'deleted' }),
      goal({ id: 'both', categoryId: 'other', accountId: 'other' }),
      goal({ id: 'usd', categoryId: null, accountId: 'usd' }),
    ];
    const r = goalReportRows(goals, categories, [
      ...accounts,
      { id: 'usd', name: 'Fremdkonto', currency: 'USD' },
    ]);
    expect(r.every((row) => row.progress === null && row.reason !== null)).toBe(true);
    expect(r.map((row) => row.id)).toEqual(['none', 'missing', 'both', 'usd']);
  });
  it('withholds every goal sharing a backing source, including a conflicting dual-link goal', () => {
    const r = goalReportRows(
      [
        goal(),
        goal({ id: 'second' }),
        goal({ id: 'a', categoryId: null, accountId: 'reserve' }),
        goal({ id: 'b', categoryId: null, accountId: 'reserve' }),
      ],
      categories,
      accounts,
    );
    expect(r.every((row) => row.progress === null)).toBe(true);
    const mixed = goalReportRows(
      [goal(), goal({ id: 'conflict', accountId: 'reserve' })],
      categories,
      accounts,
    );
    expect(mixed[0]!.progress).toBeNull();
  });
  it('retains genuine zero, reached and null forecast semantics while rejecting unsafe/missing figures', () => {
    const zero = goal({
      savedCents: 0,
      remainingCents: 300000,
      neededMonthlyCents: 30000,
      forecastMonth: null,
      averageRateCents: -1,
      status: 'behind',
    });
    expect(goalReportRows([zero], categories, accounts)[0]!.progress).toBe(zero);
    const reached = goal({
      savedCents: 300000,
      remainingCents: 0,
      forecastMonth: null,
      monthsLeft: null,
      neededMonthlyCents: 0,
      status: 'reached',
    });
    expect(goalReportRows([reached], categories, accounts)[0]!.progress).toBe(reached);
    expect(
      goalReportRows([goal({ savedCents: Number.MAX_SAFE_INTEGER + 1 })], categories, accounts)[0]!
        .progress,
    ).toBeNull();
    expect(
      goalReportRows(
        [goal({ neededMonthlyCents: undefined as unknown as number })],
        categories,
        accounts,
      )[0]!.progress,
    ).toBeNull();
    expect(goalReportRows([], categories, accounts)).toEqual([]);
  });
});
