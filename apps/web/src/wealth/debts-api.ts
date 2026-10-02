import type { DebtAccount, DebtsView } from '@budget/db';
import type { PayoffPlan } from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
export type { DebtAccount, DebtsView };
export interface DebtScenario {
  asOf: string;
  startMonth: string;
  rateBp: number;
  paymentCents: number;
  extraCents: number;
  monthlyFeeCents: number;
}
export interface DebtProjection extends DebtScenario {
  accountId: string;
  currency: string;
  balanceCents: number;
  plan: PayoffPlan;
}
export const debtsQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'debts'],
    retry: false,
    queryFn: () => request<DebtsView>('GET', '/api/wealth/debts'),
  });
export const projectDebt = (id: string, input: DebtScenario) =>
  request<DebtProjection>('POST', `/api/wealth/debts/${encodeURIComponent(id)}/projection`, input);
