import { todayInVienna } from '@budget/domain';
import { queryClient } from '../auth/status-query';
import { budgetQuery } from '../budget/budget-api';
import { goalsQuery } from '../budget/goals-api';
import { inboxCountQuery } from '../inbox/api';
import { accountsQuery } from '../ledger/queries';
import { shiftMonth } from '../nav/month';
import { currentMonth } from '../shell/use-month';
import { portfolioPositionsQuery } from '../wealth/portfolio-api';
import { heuteQuery, type HeutePeriod } from './api';
import { effectivePeriod } from './use-balance-period';

/** localStorage flag of the chosen balance period (see `useBalancePeriod`). */
const STORED_PERIOD_FLAG = 'budget-balance-month';

function storedMonthChoice(): boolean {
  try {
    return localStorage.getItem(STORED_PERIOD_FLAG) === '1';
  } catch {
    return false;
  }
}

/**
 * Starts every read of the start page at once, before the page chunk and the first response are
 * there: Heute, accounts, depot positions, Plan, goals (this and last month) and the inbox count
 * no longer wait for each other. Months and period are derived locally, the same way the page
 * derives them, so the page finds the requests already running (same query keys, deduplicated).
 * Failures are ignored here; the page shows them when it reads the same query itself.
 */
export function prefetchStartPage(search: {
  monat?: string | undefined;
  period?: HeutePeriod | undefined;
}): void {
  const month = search.monat ?? currentMonth();
  const period = effectivePeriod(month, currentMonth(), search.period, storedMonthChoice());
  const planMonth = todayInVienna().slice(0, 7);
  for (const options of [
    heuteQuery(month, period),
    accountsQuery(),
    portfolioPositionsQuery(),
    budgetQuery(month),
    goalsQuery(planMonth),
    goalsQuery(shiftMonth(planMonth, -1)),
    inboxCountQuery(),
  ])
    void queryClient.prefetchQuery(options as Parameters<typeof queryClient.prefetchQuery>[0]);
}
