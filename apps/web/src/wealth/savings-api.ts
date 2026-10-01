import type { SavingsPlanInput, SavingsPlanChange, SavingsPlanRecord } from '@budget/db';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
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
