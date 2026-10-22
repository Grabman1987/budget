import type {
  CloseWork,
  CloseStep,
  MonthCloseState,
  closePlanHistory,
  closeDeviations,
} from '@budget/domain';
import type { AccountSummary, InboxEntry, HeuteOccurrence, OnePager, MonthCloseReconciliationPreview } from '@budget/db';
import type { ReconcileRequest } from '../ledger/api';
import type { ReconcileResult } from '../ledger/types';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import type { EnvelopeSummary, BudgetMonthView } from '../budget/budget-api';
import type { WithValuationNotes } from '../ledger/valuation-hint';
export interface NextClosePlan {
  month: string;
  payday: string;
  budget: BudgetMonthView;
  previousAssigned: Record<string, number>;
  history: ReturnType<typeof closePlanHistory>;
  payments: HeuteOccurrence[];
}
export interface MonthCloseView extends WithValuationNotes {
  month: string;
  end: string;
  asOf: string;
  state: MonthCloseState;
  work: CloseWork[];
  steps: CloseStep[];
  navigation: {
    currentStep: number;
    nextStep: number;
    nextByStep: Record<number, number>;
    completedTasks: number;
    totalTasks: number;
  };
  sourceRevision: string;
  unchangedConfirmation?: MonthCloseReconciliationPreview;
  close: { changedSinceClose: boolean; legacyMarker: boolean };
  result: {
    report: OnePager;
    checkedAccounts: number;
    totalAccounts: number;
    deferredAccounts: number;
    assignedCents: number;
    overspentCount: number;
    overspentCents: number;
    carryInCents: number;
    sourceMonth: string;
    destinationMonth: string;
  } | null;
  inbox: InboxEntry[];
  accounts: Array<
    AccountSummary & {
      manual: boolean;
      holdingValued?: boolean;
      valueCents: number;
      lastValuedOn: string | null;
      done: boolean;
    }
  >;
  overspent: EnvelopeSummary[];
  nextPlan: NextClosePlan;
  deviations: ReturnType<typeof closeDeviations>;
}
export const monthCloseQuery = (month: string) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'month-close', month],
    queryFn: () => request<MonthCloseView>('GET', `/api/month-close/${month}`),
  });
export const saveMonthClose = (
  month: string,
  patch: Pick<Partial<MonthCloseState>, 'currentStep' | 'decisions'> & {
    close?: true;
    sourceRevision?: string;
  },
) =>
  request<{ groupId: string; changedCount?: number }>(
    'PATCH',
    `/api/month-close/${month}`,
    patch,
  );

export const confirmUnchangedCloseAccounts = (month: string, input: {
  accountIds: string[]; asOf: string; revision: string;
}) => request<{ groupId: string; changedCount: number; reconciliations: { accountId: string; reconciliationId: string }[] }>(
  'POST', `/api/month-close/${encodeURIComponent(month)}/reconcile-unchanged`, input,
);
export const reconcileCloseAccount = (month: string, accountId: string,
  input: ReconcileRequest & { sourceRevision: string; note?: string },
) => request<{ result: ReconcileResult }>('POST',
  `/api/month-close/${encodeURIComponent(month)}/accounts/${encodeURIComponent(accountId)}/reconciliation`, input);
