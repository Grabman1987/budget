import type { DebtCandidate, LoanPlanView, StrategyView } from '@budget/db';
import type { LoanMeasure, LoanScenarioInput } from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';

export type { DebtCandidate, LoanPlanView, StrategyView };

export const LOAN_PLAN_KEY = [...LEDGER_KEY, 'loan-plan'] as const;
export const DEBT_STRATEGY_KEY = [...LEDGER_KEY, 'debt-strategy'] as const;
const root = '/api/wealth/debts';
const enc = encodeURIComponent;

export const loanPlanQuery = (id: string, asOf: string) =>
  queryOptions({
    queryKey: [...LOAN_PLAN_KEY, id, asOf],
    retry: false,
    queryFn: () => request<LoanPlanView>('GET', `${root}/${enc(id)}/plan?asOf=${asOf}`),
  });

export const previewLoanScenario = (id: string, asOf: string, measures: LoanMeasure[]) =>
  request<LoanPlanView>('POST', `${root}/${enc(id)}/plan/preview`, { asOf, measures });

export interface RateChangeInput {
  validFrom: string;
  rateBp: number;
}
export type WriteResult = { id: string; groupId: string };
export const saveRateChange = (loanId: string, changeId: string | null, input: RateChangeInput) =>
  request<WriteResult>(
    changeId ? 'PUT' : 'POST',
    `${root}/${enc(loanId)}/rate-changes${changeId ? `/${enc(changeId)}` : ''}`,
    input,
  );
export const deleteRateChange = (loanId: string, changeId: string) =>
  request<{ groupId: string }>('DELETE', `${root}/${enc(loanId)}/rate-changes/${enc(changeId)}`);

export const saveScenario = (loanId: string, scenarioId: string | null, input: LoanScenarioInput) =>
  request<WriteResult>(
    scenarioId ? 'PUT' : 'POST',
    `${root}/${enc(loanId)}/scenarios${scenarioId ? `/${enc(scenarioId)}` : ''}`,
    input,
  );
export const deleteScenario = (loanId: string, scenarioId: string) =>
  request<{ groupId: string }>('DELETE', `${root}/${enc(loanId)}/scenarios/${enc(scenarioId)}`);

export const strategyCandidatesQuery = (asOf: string) =>
  queryOptions({
    queryKey: [...DEBT_STRATEGY_KEY, asOf],
    retry: false,
    queryFn: () =>
      request<{ asOf: string; startMonth: string; debts: DebtCandidate[] }>(
        'GET',
        `${root}/strategies?asOf=${asOf}`,
      ),
  });

export interface StrategyRequest {
  asOf: string;
  startMonth: string;
  extraCents: number;
  debts: Array<{
    accountId: string;
    rateBp: number;
    minimumCents: number;
    monthlyFeeCents: number;
  }>;
}
export const compareStrategies = (input: StrategyRequest) =>
  request<StrategyView>('POST', `${root}/strategies`, input);
