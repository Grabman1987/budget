import { goalTotals, type GoalTotals } from '@budget/domain';
import { eur } from '../ledger/format';
import type { GoalView } from './goals-api';

/** View model of Plan › Sparziele: groups, bar geometry and the status line. No arithmetic on money
 * beyond what the domain already delivered (`goalTotals`). */

export interface GoalGroup {
  key: 'open' | 'reached' | 'completed';
  no: number;
  title: string;
  rows: GoalView[];
  totals: GoalTotals;
}

const SHORT_MONTH = [
  'Jän',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

/** `2027-07` to "Jul 2027". */
export const shortMonth = (month: string): string =>
  `${SHORT_MONTH[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(0, 4)}`;

/** Reached, open and retained completed goals; no record disappears on completion. */
export const goalState = (goal: GoalView) => goal.lifecycle?.state ?? (goal.status === 'reached' ? 'reached' : 'open');

export function goalGroups(goals: readonly GoalView[]): GoalGroup[] {
  const groups: Array<Omit<GoalGroup, 'no' | 'totals'>> = [
    { key: 'reached', title: 'Erreicht', rows: goals.filter((g) => goalState(g) === 'reached') },
    { key: 'open', title: 'Offen', rows: goals.filter((g) => goalState(g) === 'open') },
    { key: 'completed', title: 'Abgeschlossen', rows: goals.filter((g) => goalState(g) === 'completed') },
  ];
  return groups
    .filter((g) => g.rows.length > 0)
    .map((g, i) => ({ ...g, no: i + 1, totals: goalTotals(g.rows.map((row) => ({ ...row, neededMonthlyCents: row.funding?.conflict ? null : row.funding?.monthlyCents ?? row.neededMonthlyCents }))) }));
}

/**
 * Bar of one goal: the fill is what is saved, the ink tick the target. The bar is as long as the
 * larger of both, so a goal that is over-saved shows its target inside the fill.
 */
export function goalBar(goal: Pick<GoalView, 'savedCents' | 'targetCents'>): {
  fill: number;
  tick: number;
} {
  const scale = Math.max(goal.savedCents, goal.targetCents, 1);
  return { fill: goal.savedCents / scale, tick: goal.targetCents / scale };
}

export interface GoalLine {
  tone: 'done' | 'ok' | 'warn';
  text: string;
}

/** The short status under the bar: what the forecast says, and what is missing if it is late. */
export function goalLine(goal: GoalView, month: string): GoalLine {
  if (goalState(goal) === 'completed') return { tone: 'done', text: 'abgeschlossen' };
  if (goalState(goal) === 'reached') return { tone: 'done', text: 'erreicht' };
  if (goal.status === 'on_track')
    return {
      tone: 'ok',
      text: goal.forecastMonth ? `im Plan · fertig ${shortMonth(goal.forecastMonth)}` : 'im Plan',
    };
  if (goal.targetDate !== null && goal.targetDate.slice(0, 7) <= month)
    return { tone: 'warn', text: 'hinter Plan · Zieldatum erreicht, Rest offen' };
  if (goal.averageRateCents <= 0)
    return { tone: 'warn', text: 'hinter Plan · zuletzt nichts gespart' };
  const more = (goal.neededMonthlyCents ?? 0) - goal.averageRateCents;
  return { tone: 'warn', text: `hinter Plan · ${eur(Math.max(more, 0))} je Monat mehr nötig` };
}

/** "3 von 5 im Plan" for the group note; reached goals count as in plan. */
export const planSummary = (goals: readonly GoalView[]): string =>
  `${goals.filter((g) => g.status !== 'behind').length} von ${goals.length} im Plan`;
