import type { AccountReviewStatus, PlannedEventOccurrence, LiquidityReport } from '@budget/domain';
import type { freedomInvestmentBasis } from '@budget/db';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import type { ValuationSource, WithValuationNotes } from '../ledger/valuation-hint';

export interface AccountReminder {
  accountId: string;
  accountName: string;
  days: number;
  action: 'reconcile' | 'value';
  dueOn?: string | null;
  checkedOn?: string | null;
  policy?: AccountReviewStatus['policy'];
  supported?: boolean;
}

export interface HeuteUnavailable {
  unavailable: { reason: 'missing_price' | 'missing_fx'; message: string; asOf: string };
}

export type HeutePeriod = 'month' | 'payday';

export interface HeuteOccurrence {
  occurrenceId: string | null;
  paymentId: string;
  name: string;
  kind: 'outflow' | 'inflow';
  dueDate: string;
  status: 'expected' | 'received' | 'deviating' | 'missed' | 'skipped';
  amountCents: number;
  accountId: string | null;
  accountName: string | null;
  contactName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryClass: string | null;
  covered: boolean | null;
}

/** A copied canonical result, excluding the six-month verdict and movement detail. */
export type HeuteForecastReport = Pick<
  LiquidityReport,
  | 'startDay'
  | 'startCents'
  | 'horizon'
  | 'horizonDays'
  | 'points'
  | 'eventMarks'
  | 'low'
  | 'scheduledInflows'
>;
export type HeuteForecast35d = {
  asOf: string;
  horizon: '35d';
  levers: [];
} & ({ available: boolean; report: HeuteForecastReport | null } | HeuteUnavailable);

export interface Heute extends WithValuationNotes {
  /** Selected signed basis; separate from the positive investment assets in netWorth. */
  investmentBasis?: { asOf: string } & (
    ReturnType<typeof freedomInvestmentBasis> | HeuteUnavailable
  );
  /** Optional for saved responses from before the canonical compact-forecast contract. */
  forecast35d?: HeuteForecast35d;
  valuationSources?: ValuationSource[];
  monthResult: { earnedCents: number; consumptionCents: number; savedCents: number };
  budgetAnswer: {
    spentCents: number;
    plannedCents: number;
    remainingCents: number;
    day: number;
    daysInMonth: number;
  };
  nearestGoal: { id: string; name: string; savedCents: number; remainingCents: number } | null;
  planningAccuracy?: { count: number; hits: number; meanAbsoluteBp: number | null };
  dailyBudget: { remainingDays: number; perDayCents: number | null };
  stand: {
    today: string;
    month: string;
    period: HeutePeriod;
    from: string;
    to: string;
    payday: { day: string; source: 'payday_rule'; daysToPayday: number };
    budgetBalanceCents: number;
  };
  lead: {
    needCents: number;
    wantCents: number;
    openCents: number;
    freeCents: number;
    daysToPayday: number;
    chain: Array<{ label: string; value: number; op?: '+' | '-' | '='; result?: boolean }>;
    items: {
      need: Array<{ id: string; name: string; class: 'need' | 'want'; availableCents: number }>;
      want: Array<{ id: string; name: string; class: 'need' | 'want'; availableCents: number }>;
      open: Array<{ id: string; label: string; day: string; cents: number }>;
    };
  };
  balance: {
    actual: Array<{ day: string; balanceCents: number }>;
    forecast: Array<{
      day: string;
      balanceCents: number;
      variableCents: number;
      items: { cents: number; label?: string }[];
    }>;
    salary: { day: string; cents: number } | null;
    low: { day: string; index: number; cents: number } | null;
  };
  pace: {
    month: string;
    daysInMonth: number;
    todayDay: number;
    plan: number[];
    expected: number[];
    actual: number[];
    income: number[];
    previous: number[];
    fixedDays: number[];
    forecast: number[];
    previousMonth: string;
    figures: {
      spentCents: number;
      planToDateCents: number;
      expectedToDateCents: number;
      deltaCents: number;
      forecastEndCents: number;
      forecastAvailable: boolean;
      limitCents: number;
      variableSoFarCents: number;
      openFixedCents: number;
      over: boolean;
    };
  };
  pinned: Array<{
    id: string;
    name: string;
    icon: string | null;
    class: 'need' | 'want' | 'future' | null;
    availableCents: number;
    assignedCents: number;
    budgetedCents: number;
    spentCents: number;
    paceMarkCents: number;
    overspentCents: number;
  }>;
  upcoming14: HeuteOccurrence[];
  upcomingEvents: PlannedEventOccurrence[];
  accountReminders: AccountReminder[];
  financeCheck:
    | {
        counts: { ok: number; warn: number; bad: number; total: number; notEvaluated: number };
        keyRules: Array<{
          code: string;
          name: string;
          stage: number | null;
          status: 'ok' | 'warn' | 'bad';
          valueText: string;
          actionNeeded: boolean;
          actionText: string | null;
        }>;
        actionRules: Array<{
          code: string;
          name: string;
          status: 'warn' | 'bad';
          valueText: string;
          actionText: string | null;
        }>;
      }
    | HeuteUnavailable;
  netWorth:
    | {
        liquidCents: number;
        assetsCents: number;
        liabilitiesCents: number;
        monthChange:
          | { deltaCents: number; investmentsInCents: number; marketCents: number }
          | HeuteUnavailable;
        investedCents: number;
        receivableCents: number;
        debtCents: number;
        totalCents: number;
        asOf: string;
        previousMonthEndCents: number | null;
        yearAgoCents: number | null;
        yearAgoDay: string;
        yearDeltaCents: number | null;
        deltaCents: number | null;
        deltaBp: number | null;
        series: Array<{
          day: string;
          cents: number | null;
          unavailable?: HeuteUnavailable['unavailable'];
        }>;
      }
    | HeuteUnavailable;
  attention: {
    inboxCount: number;
    pendingCount: number;
    pendingBefore: string;
    loanTermsMissing: boolean;
    quoteReview?: { securityIds: string[]; count: number };
    monthCloseTasks?: {
      tasks: Array<{ id: string; kind: 'close' | 'close-changed'; month: string; target: string }>;
      unavailable: Array<{ month: string | null; reason: 'legacy' | 'invalid_state' }>;
    };
    contactReminders?: {
      items: Array<{
        contactId: string;
        contactName: string;
        oldestDate: string;
        overdueCents: number;
      }>;
      unavailableCount: number;
    };
  };
  lastBookings: Array<{
    id: string;
    date: string;
    payeeName: string | null;
    categoryName: string | null;
    categoryClass: string | null;
    memo: string | null;
    amountCents: number;
    status: string;
    accountName: string;
  }>;
  nextSteps: {
    items: Array<{
      kind: 'overspent' | 'uncategorized';
      urgent: boolean;
      categoryId: string | null;
      categoryName: string | null;
      cents: number;
      count: number;
    }>;
    count: number;
  };
}

// Today reads the ledger, so capture, budget edits and their undo/redo refresh it together.
export const HEUTE_KEY = [...LEDGER_KEY, 'heute'] as const;

export const heuteQuery = (month: string, period: HeutePeriod) =>
  queryOptions({
    queryKey: [...HEUTE_KEY, month, period],
    queryFn: () =>
      request<Heute>('GET', `/api/heute?period=${period}&month=${encodeURIComponent(month)}`),
  });
