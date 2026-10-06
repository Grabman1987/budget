import type { CloseWork, CloseStep, MonthCloseState } from '@budget/domain';
import type { AccountSummary, InboxEntry } from '@budget/db';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import type { EnvelopeSummary } from '../budget/budget-api';
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
}
export const monthCloseQuery = (month: string) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'month-close', month],
    queryFn: () => request<MonthCloseView>('GET', `/api/month-close/${month}`),
  });
export const saveMonthClose = (month: string, patch: Partial<MonthCloseState>) =>
  request<{ groupId: string }>('PATCH', `/api/month-close/${month}`, patch);
