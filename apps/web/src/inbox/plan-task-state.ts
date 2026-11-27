import { useQuery } from '@tanstack/react-query';
import { budgetQuery } from '../budget/budget-api';
import { heuteQuery } from '../heute/api';
import { useBalancePeriod } from '../heute/use-balance-period';
import { useMonth } from '../shell/use-month';

/** Open plan problems, read from the same sources as Heute › "Als Nächstes". */
export interface PlanTaskState {
  month: string;
  /** Zu verteilen of the month; negative = zu viel zugewiesen. */
  assignmentCents: number | undefined;
  overspentCount: number;
  /** Ungedeckt aus dem Vormonat (the Plan month summary figure); 0 when none. */
  uncoveredCents?: number | undefined;
}

export function usePlanTaskState(enabled: boolean): PlanTaskState | undefined {
  const [month] = useMonth();
  const { period } = useBalancePeriod();
  const heute = useQuery({ ...heuteQuery(month, period), enabled });
  const budget = useQuery({ ...budgetQuery(month), enabled });
  const readyBudget =
    !budget.isError && !budget.isPlaceholderData && budget.data?.summary?.month === month
      ? budget.data
      : undefined;
  const readyHeute =
    !heute.isError &&
    !heute.isPlaceholderData &&
    (heute.data as { stand?: { month?: string } } | undefined)?.stand?.month === month
      ? heute.data
      : undefined;
  if (!enabled || (!readyBudget && !readyHeute)) return undefined;
  return {
    month: readyHeute?.stand.today.slice(0, 7) ?? month,
    assignmentCents: readyBudget?.summary.toBeAssignedCents,
    uncoveredCents: readyBudget?.summary.uncoveredCents,
    overspentCount:
      readyHeute?.nextSteps.items.filter((item) => item.kind === 'overspent').length ?? 0,
  };
}
