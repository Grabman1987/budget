import { addDays } from '../date';
import type { BudgetClass } from '../ledger/alloc';
import {
  targetNeed,
  waterfallFill,
  type CategoryTarget,
  type TargetEnvelope,
  type WaterfallRow,
} from '../ledger/targets';

/**
 * Rule checks R04, R05, R06, R09 and R12 (concept §3.5) as pure functions. They return the facts
 * (what is covered, what is missing); turning them into erfüllt / Warnung / verletzt with
 * configurable thresholds is the job of the rule engine. Money is integer cents.
 */

// ---- R05 Sinking Funds ----

export interface SinkingFund {
  id: string;
  /** A periodic category: a rhythm of more than one month or a target with a date. */
  target: CategoryTarget;
  envelope: TargetEnvelope;
}

export interface SinkingFundsCovered {
  covered: number;
  total: number;
  /** Funds that fall short, with what this month still has to assign to be in time. */
  uncovered: { id: string; shortCents: number; dueMonth: string | null }[];
}

/**
 * R05: a periodic expense is funded when this month's assignment meets the share that `targetNeed`
 * asks for, so the envelope is full on the due date.
 */
export function sinkingFundsCovered(funds: ReadonlyArray<SinkingFund>): SinkingFundsCovered {
  const uncovered: SinkingFundsCovered['uncovered'] = [];
  for (const f of funds) {
    const need = targetNeed(f.target, f.envelope);
    if (need.needCents > 0)
      uncovered.push({ id: f.id, shortCents: need.needCents, dueMonth: need.dueMonth });
  }
  return { covered: funds.length - uncovered.length, total: funds.length, uncovered };
}

// ---- R06 Kreditkarte ----

export interface CardBalance {
  id: string;
  /** What is owed on the card (positive); 0 or less = nothing owed. */
  owedCents: number;
  /** Available in the card envelope ("Kartenzahlung"); may be negative. */
  availableCents: number;
}

export interface CardCovered {
  /** Every card balance is covered (true without cards). */
  allCovered: boolean;
  cards: (CardBalance & { covered: boolean; shortCents: number })[];
}

/** R06: the card balance is always covered by the card envelope (balance <= available). */
export function cardCovered(cards: ReadonlyArray<CardBalance>): CardCovered {
  const rows = cards.map((c) => {
    const shortCents = c.owedCents <= 0 ? 0 : Math.max(0, c.owedCents - c.availableCents);
    return { ...c, covered: shortCents === 0, shortCents };
  });
  return { allCovered: rows.every((c) => c.covered), cards: rows };
}

// ---- R12 Windfall ----

/** 10 % for enjoyment (Genuss), in basis points. */
export const WINDFALL_ENJOY_BP = 1000;

export interface WindfallSplit {
  amountCents: number;
  /** The Genuss share: `amount x bp / 10.000`, rounded to whole cents. */
  enjoyCents: number;
  /** What goes through the waterfall. */
  restCents: number;
  /** Waterfall distribution of the rest per row id. */
  fill: Record<string, number>;
  /** Part of the rest the waterfall could not place (all needs are met). */
  leftoverCents: number;
}

/** R12: a special payment splits into 10 % Genuss and the rest by waterfall. */
export function windfallSplit(input: {
  amountCents: number;
  rows: ReadonlyArray<WaterfallRow>;
  enjoyBp?: number;
}): WindfallSplit {
  const amount = Math.max(0, input.amountCents);
  const enjoyCents = Math.round((amount * (input.enjoyBp ?? WINDFALL_ENJOY_BP)) / 10_000);
  const restCents = amount - enjoyCents;
  const fill = waterfallFill(input.rows, restCents);
  const placed = Object.values(fill).reduce((a, v) => a + v, 0);
  return { amountCents: amount, enjoyCents, restCents, fill, leftoverCents: restCents - placed };
}

export interface WindfallCheck {
  expectedEnjoyCents: number;
  /** Assigned to Genuss minus the expected share (positive = more than 10 %). */
  enjoyDiffCents: number;
  /** Not assigned anywhere: still "Zu verteilen". */
  undistributedCents: number;
  enjoyWithinShare: boolean;
  fullyDistributed: boolean;
  ok: boolean;
}

/**
 * Checks how a special payment was actually distributed: no more than the Genuss share went to
 * enjoyment, and everything is assigned a job.
 */
export function windfallCheck(input: {
  amountCents: number;
  assignedEnjoyCents: number;
  assignedOtherCents: number;
  enjoyBp?: number;
}): WindfallCheck {
  const expectedEnjoyCents = Math.round(
    (Math.max(0, input.amountCents) * (input.enjoyBp ?? WINDFALL_ENJOY_BP)) / 10_000,
  );
  const enjoyDiffCents = input.assignedEnjoyCents - expectedEnjoyCents;
  const undistributedCents =
    input.amountCents - input.assignedEnjoyCents - input.assignedOtherCents;
  const enjoyWithinShare = enjoyDiffCents <= 0;
  const fullyDistributed = undistributedCents <= 0;
  return {
    expectedEnjoyCents,
    enjoyDiffCents,
    undistributedCents,
    enjoyWithinShare,
    fullyDistributed,
    ok: enjoyWithinShare && fullyDistributed,
  };
}

// ---- R04 Pay yourself first ----

export interface AssignmentEvent {
  /** `YYYY-MM-DD` on which the money was assigned to an envelope. */
  day: string;
  class: BudgetClass;
  /** Signed: moving money out of an envelope is negative. */
  amountCents: number;
}

export interface PayYourselfFirstOccurrence {
  salaryDay: string;
  /** Assigned to Zukunft envelopes from the salary day up to `withinDays` later. */
  fundedCents: number;
  targetCents: number;
  ok: boolean;
}

export interface PayYourselfFirst {
  occurrences: PayYourselfFirstOccurrence[];
  /** Every salary was followed by a funded Zukunft; `null` without salaries. */
  ok: boolean | null;
}

/** Owner decision: Zukunft is funded within 3 days after the salary. */
export const PAY_YOURSELF_FIRST_DAYS = 3;

/**
 * R04: for each salary occurrence, the Zukunft targets must be funded within `withinDays` days
 * (the salary day included).
 */
export function payYourselfFirst(input: {
  salaryDays: ReadonlyArray<string>;
  assignments: ReadonlyArray<AssignmentEvent>;
  /** What the Zukunft envelopes ask for per salary (their targets for the month). */
  targetCents: number;
  withinDays?: number;
}): PayYourselfFirst {
  const within = input.withinDays ?? PAY_YOURSELF_FIRST_DAYS;
  const occurrences = [...input.salaryDays].sort().map((salaryDay) => {
    const end = addDays(salaryDay, within);
    const fundedCents = input.assignments
      .filter((a) => a.class === 'future' && a.day >= salaryDay && a.day <= end)
      .reduce((s, a) => s + a.amountCents, 0);
    return {
      salaryDay,
      fundedCents,
      targetCents: input.targetCents,
      ok: fundedCents >= input.targetCents,
    };
  });
  return {
    occurrences,
    ok: occurrences.length === 0 ? null : occurrences.every((o) => o.ok),
  };
}

// ---- R09 Tilgungsreihenfolge ----

export interface DebtLoan {
  id: string;
  /** Interest rate p.a. in basis points (500 = 5 %). */
  rateBp: number;
  /** Open balance (positive). */
  balanceCents: number;
}

export type DebtStrategy = 'avalanche' | 'snowball';

/** Interest above 5 % counts as expensive debt. */
export const EXPENSIVE_DEBT_BP = 500;

export interface DebtOrder {
  /** Loans above the threshold in repayment order. */
  priority: DebtLoan[];
  /** Extra repayment per loan in that order, limited to the open balance. */
  allocations: { id: string; cents: number }[];
  /** What is left for investing after the expensive loans got their extra repayment. */
  toInvestCents: number;
  /** Open loans above the threshold exist: investing must wait (R09). */
  expensiveDebtOpen: boolean;
}

/**
 * R09: loans above the rate threshold get extra repayment before invest contributions. Avalanche
 * (default) repays the highest rate first, snowball the smallest balance first.
 */
export function debtOrder(input: {
  loans: ReadonlyArray<DebtLoan>;
  /** Money available for extra repayment and investing after all minimum payments. */
  availableCents: number;
  strategy?: DebtStrategy;
  thresholdBp?: number;
}): DebtOrder {
  const threshold = input.thresholdBp ?? EXPENSIVE_DEBT_BP;
  const snowball = input.strategy === 'snowball';
  const priority = input.loans
    .filter((l) => l.rateBp > threshold && l.balanceCents > 0)
    .sort((a, b) =>
      snowball
        ? a.balanceCents - b.balanceCents || b.rateBp - a.rateBp || a.id.localeCompare(b.id)
        : b.rateBp - a.rateBp || a.balanceCents - b.balanceCents || a.id.localeCompare(b.id),
    );
  let left = Math.max(0, input.availableCents);
  const allocations: DebtOrder['allocations'] = [];
  for (const loan of priority) {
    const cents = Math.min(loan.balanceCents, left);
    if (cents > 0) {
      allocations.push({ id: loan.id, cents });
      left -= cents;
    }
  }
  return { priority, allocations, toInvestCents: left, expensiveDebtOpen: priority.length > 0 };
}
