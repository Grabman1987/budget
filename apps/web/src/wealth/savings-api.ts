import type {
  SavingsPlanInput,
  SavingsPlanChange,
  SavingsPlanRecord,
  SavingsExecutionProposal,
  TradeRow,
} from '@budget/db';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import type { ManualTrade } from './trade-api';
import { LEDGER_KEY } from '../ledger/queries';
export type { SavingsExecutionProposal } from '@budget/db';
export const savingsProposalsQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'savings-execution-proposals'],
    retry: false,
    queryFn: () =>
      request<{ proposals: SavingsExecutionProposal[] }>(
        'GET',
        '/api/savings-plans/execution-proposals',
      ),
  });
export const confirmSavings = (proposal: SavingsExecutionProposal, values: ManualTrade) =>
  request<{ trade: TradeRow; groupId: string }>(
    'POST',
    `/api/savings-plans/${encodeURIComponent(proposal.planId)}/confirm-execution`,
    {
      month: proposal.month,
      plannedDate: proposal.date,
      plannedAmountCents: proposal.amountCents,
      plannedCurrency: proposal.currency,
      date: values.date,
      unitsE8: values.unitsE8,
      amountCents: values.amountCents,
      feeCents: values.feeCents,
      note: values.note,
    },
  );
export type { SavingsPlanRecord } from '@budget/db';

export const savingsPlansQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'savings-plans'],
    retry: false,
    queryFn: () => request<{ plans: SavingsPlanRecord[] }>('GET', '/api/savings-plans?ended=1'),
  });
type Saved = { plan: SavingsPlanRecord; groupId: string };
export const createPlan = (input: SavingsPlanInput) =>
  request<Saved>('POST', '/api/savings-plans', input);
export const changePlan = (id: string, change: SavingsPlanChange & { from: string }) =>
  request<Saved>('PATCH', `/api/savings-plans/${encodeURIComponent(id)}`, change);
export const endPlan = (id: string, to: string) =>
  request<Saved>('POST', `/api/savings-plans/${encodeURIComponent(id)}/end`, { to });
