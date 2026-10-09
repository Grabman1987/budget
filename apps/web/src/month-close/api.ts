import type {
  CloseWork,
  CloseStep,
  MonthCloseState,
  closePlanHistory,
  closeDeviations,
} from '@budget/domain';
import type { AccountSummary, InboxEntry, HeuteOccurrence } from '@budget/db';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import type { EnvelopeSummary, BudgetMonthView } from '../budget/budget-api';
export interface NextClosePlan {
  month: string;
  payday: string;
  budget: BudgetMonthView;
  previousAssigned: Record<string, number>;
  history: ReturnType<typeof closePlanHistory>;
  payments: HeuteOccurrence[];
}
export interface MonthCloseView {
  month: string;
  end: string;
  asOf: string;
  state: MonthCloseState;
  work: CloseWork[];
  steps: CloseStep[];
  inbox: InboxEntry[];
  accounts: Array<
    AccountSummary & {
      manual: boolean;
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
  patch: Pick<Partial<MonthCloseState>, 'currentStep' | 'decisions'> & { close?: true },
) => request<{ groupId: string }>('PATCH', `/api/month-close/${month}`, patch);
