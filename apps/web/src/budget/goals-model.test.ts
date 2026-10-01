import { describe, expect, it } from 'vitest';
import type { GoalView } from './goals-api';
import { goalBar, goalGroups, goalLine, planSummary, shortMonth } from './goals-model';

const goal = (over: Partial<GoalView> = {}): GoalView => ({
  id: 'g1',
  name: 'Urlaub',
  targetCents: 300_000,
  targetDate: '2027-07-31',
  categoryId: 'reise',
  accountId: null,
  note: null,
  savedCents: 54_000,
  remainingCents: 246_000,
  monthsLeft: 10,
  neededMonthlyCents: 24_600,
  averageRateCents: 25_000,
  forecastMonth: '2027-07',
  status: 'on_track',
  ...over,
});

describe('shortMonth', () => {
  it('uses the Austrian short names', () => {
    expect(shortMonth('2027-01')).toBe('Jän 2027');
    expect(shortMonth('2027-03')).toBe('Mär 2027');
  });
});

describe('goalGroups', () => {
  it('splits into Offen and Erreicht with sums, and leaves empty groups out', () => {
    const groups = goalGroups([
      goal({ id: 'a' }),
      goal({ id: 'b', status: 'behind' }),
      goal({
        id: 'c',
        status: 'reached',
        savedCents: 300_000,
        remainingCents: 0,
        neededMonthlyCents: 0,
      }),
    ]);
    expect(groups.map((g) => [g.key, g.no, g.rows.map((r) => r.id)])).toEqual([
      ['open', 1, ['a', 'b']],
      ['reached', 2, ['c']],
    ]);
    expect(groups[0]?.totals).toEqual({
      targetCents: 600_000,
      savedCents: 108_000,
      remainingCents: 492_000,
      neededMonthlyCents: 49_200,
    });
    expect(goalGroups([goal()]).map((g) => g.no)).toEqual([1]);
    expect(goalGroups([])).toEqual([]);
  });
});

describe('goalBar', () => {
  it('fills by saved and ticks the target at the end while it is not reached', () => {
    expect(goalBar(goal())).toEqual({ fill: 0.18, tick: 1 });
  });
  it('an over-saved goal shows the target inside the fill', () => {
    expect(goalBar(goal({ savedCents: 400_000 }))).toEqual({ fill: 1, tick: 0.75 });
  });
  it('an empty target does not divide by zero', () => {
    expect(goalBar({ savedCents: 0, targetCents: 0 })).toEqual({ fill: 0, tick: 0 });
  });
});

describe('goalLine', () => {
  it('says what the forecast says', () => {
    expect(goalLine(goal(), '2026-09')).toEqual({ tone: 'ok', text: 'im Plan · fertig Jul 2027' });
    expect(goalLine(goal({ status: 'reached' }), '2026-09')).toEqual({
      tone: 'done',
      text: 'erreicht',
    });
  });
  it('names the missing monthly amount when behind', () => {
    const slow = goal({ status: 'behind', averageRateCents: 24_000, forecastMonth: '2027-08' });
    expect(goalLine(slow, '2026-09').text).toBe('hinter Plan · 6,00 € je Monat mehr nötig');
  });
  it('says so when nothing was saved lately or the date has come', () => {
    expect(goalLine(goal({ status: 'behind', averageRateCents: 0 }), '2026-09').text).toBe(
      'hinter Plan · zuletzt nichts gespart',
    );
    expect(goalLine(goal({ status: 'behind', targetDate: '2026-09-30' }), '2026-09').text).toBe(
      'hinter Plan · Zieldatum erreicht, Rest offen',
    );
  });
});

describe('planSummary', () => {
  it('counts reached goals as in plan', () => {
    expect(planSummary([goal(), goal({ status: 'behind' }), goal({ status: 'reached' })])).toBe(
      '2 von 3 im Plan',
    );
  });
});
