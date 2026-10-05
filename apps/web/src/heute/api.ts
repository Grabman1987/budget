import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import type { WithValuationNotes } from '../ledger/valuation-hint';

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
  status: 'expected' | 'received' | 'deviating' | 'missed';
  amountCents: number;
  accountId: string | null;
  accountName: string | null;
  contactName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryClass: string | null;
  covered: boolean | null;
}

export interface Heute extends WithValuationNotes {
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
    actual: number[];
    previous: number[];
    fixedDays: number[];
    forecast: number[];
    previousMonth: string;
    figures: {
      spentCents: number;
      planToDateCents: number;
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
      }
    | HeuteUnavailable;
  netWorth:
    | {
        liquidCents: number;
        investedCents: number;
        receivableCents: number;
        debtCents: number;
        totalCents: number;
        asOf: string;
        previousMonthEndCents: number;
        deltaCents: number;
        deltaBp: number | null;
        series: Array<{ day: string; cents: number }>;
      }
    | HeuteUnavailable;
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
