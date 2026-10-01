import type { ForecastItem } from '../forecast';
import type { AllocMonth } from '../ledger/alloc';
import type {
  AssignmentEvent,
  CardBalance,
  DebtLoan,
  MonthFlow,
  MoneyEvent,
  SinkingFund,
} from '../kpi';
import type { ClassTarget, WealthPosition } from '../wealth';

export type RuleStatus = 'ok' | 'warn' | 'bad';

/** What the engine says about one rule on one day. `null` instead means "nicht bewertbar". */
export interface RuleEvaluation {
  status: RuleStatus;
  /** The figure as shown (de-AT), e.g. "2,4 Monate". */
  valueText: string;
  /** Something is for the owner to do (Warnung or verletzt). */
  actionNeeded: boolean;
  /** The concrete next step; `null` when the rule is erfüllt. */
  actionText: string | null;
  /** Machine-readable facts behind the figure. */
  detail: Record<string, unknown>;
}

/**
 * Everything the rules read, assembled in one place (`ruleInputs` in `@budget/db`). A part that is
 * `null` (or empty) means the data is missing: the rule is then "nicht bewertbar". Parameters are
 * not known when inputs are assembled, so each part is a superset the rule narrows by its params.
 */
export interface RuleInputs {
  /** The day the rules are evaluated for. */
  asOf: string;
  /** Last full month (`YYYY-MM`): the month itself when `asOf` is its last day. */
  refMonth: string;
  /** R01: assigned money per month (`allocationMonth`), the reference month and the 11 before. */
  allocByMonth: Record<string, AllocMonth> | null;
  /** R02 */
  emergency: {
    reserveCents: number;
    needSpending: ReadonlyArray<{ month: string; cents: number }>;
    firstMonth: string;
  } | null;
  /** R03: signed events on the budget accounts (transfers between them left out). */
  moneyEvents: ReadonlyArray<MoneyEvent>;
  /** R04: salary days of the last 12 months, assignments to Zukunft and what Zukunft asks. */
  payYourself: {
    salaryDays: ReadonlyArray<string>;
    assignments: ReadonlyArray<AssignmentEvent>;
    targetCents: number;
  } | null;
  /** R05 */
  sinkingFunds: ReadonlyArray<SinkingFund>;
  /** R06 */
  cards: ReadonlyArray<CardBalance>;
  /** R07: the liquidity forecast of the budget accounts. */
  forecast: {
    startDay: string;
    startCents: number;
    items: ReadonlyArray<ForecastItem>;
    /** Planned variable spending per month (positive cents). */
    variableMonthlyCents: number;
    overdraftLimitCents: number;
  } | null;
  /** R08, R10: monthly net income. */
  netIncomeMonthlyCents: number | null;
  /** R08: monthly loan payments (rate incl. interest). */
  loanPaymentsMonthlyCents: number;
  /** R10 */
  fixedCosts: { fixedMonthlyCents: number; periodicAnnualCents: number } | null;
  /** R09 */
  debt: {
    loans: ReadonlyArray<DebtLoan & { name: string }>;
    /** Extra repayments (Sondertilgung) paid per month, positive cents. */
    extraRepayments: ReadonlyArray<{ month: string; cents: number }>;
    /** Money assigned to investing this month. */
    investingAssignedCents: number;
  } | null;
  /** R11: income and consumption of the last 24 full months. */
  flows: ReadonlyArray<MonthFlow>;
  /** R12: special payments per month with what is still undistributed. */
  windfall: ReadonlyArray<{
    month: string;
    windfallCents: number;
    /** Part of the windfall still in "Zu verteilen" at the end of the month. */
    undistributedCents: number;
    /** Assigned that month per category id (the rule picks the Genuss envelopes). */
    assignedByCategory: Record<string, number>;
  }>;
  /** R13 to R15: positions with their security kind, class and platform (institution). */
  positions: ReadonlyArray<WealthPosition>;
  classTargets: ReadonlyArray<ClassTarget>;
  /** Labels for ids in details and texts. */
  names: {
    assetClasses: Record<string, string>;
    securities: Record<string, string>;
    platforms: Record<string, string>;
  };
  /** R16 */
  freedom: {
    investedCents: number;
    annualSpendCents: number;
    /** Progress three months ago (bp); `null` without data then. */
    previousProgressBp: number | null;
  } | null;
}
