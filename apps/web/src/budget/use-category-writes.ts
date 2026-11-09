import { useToast } from '@budget/ui';
import { queryOptions, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/http';
import { undoGroup } from '../ledger/api';
import { errorText } from '../ledger/labels';
import { LEDGER_KEY } from '../ledger/queries';
import { EXPECTED_KEY } from '../expected/api';
import { fetchCategories } from './api';
import { overAssignmentHint } from './plan-model';
import { planHistory } from './plan-history';

/** Categories feed the pick lists, the budget and the booking lists: a write refreshes all. */
export const CATEGORIES_KEY = ['categories'] as const;
export const BUDGET_KEY = ['budget'] as const;
export const GOALS_KEY = ['goals'] as const;
const AFFECTED = [
  CATEGORIES_KEY,
  BUDGET_KEY,
  GOALS_KEY,
  LEDGER_KEY,
  EXPECTED_KEY,
  ['ledger-lookups'],
  ['payslip-intake'],
  ['payslip-source'],
  ['payroll'],
  ['income-month-rules'],
  ['bank-sync'],
] as const;

export const categoriesQuery = () =>
  queryOptions({ queryKey: CATEGORIES_KEY, queryFn: fetchCategories });

/**
 * Run a write of the category system or the budget, refresh everything it touches and offer
 * "Rückgängig" (the whole audit group) with "Wiederholen" afterwards. Errors show as a toast.
 */
export function useBudgetWrite() {
  const qc = useQueryClient();
  const toast = useToast();
  const history = planHistory(qc);
  const refresh = () =>
    Promise.all(AFFECTED.map((queryKey) => qc.invalidateQueries({ queryKey: [...queryKey] })));

  const offer = (message: string, label: 'Rückgängig' | 'Wiederholen', groupId: string) => {
    const action = {
      label,
      run: () => {
        if (history.snapshot() !== action) return;
        history.set(null);
        toast.dismiss();
        const revision = history.revision();
        const toastRevision = toast.revision();
        const current = () => history.revision() === revision && toast.revision() === toastRevision;
        void (async () => {
          try {
            const undone = await undoGroup(groupId);
            await refresh();
            if (current() && label === 'Rückgängig')
              offer('Rückgängig gemacht.', 'Wiederholen', undone.groupId);
          } catch (error) {
            // A later write owns the feedback; never resurrect an older action over it.
            if (!current()) return;
            // A refusal is final (the stored state changed): plain message, no retry button.
            if (error instanceof ApiError && error.code === 'undo_refused') {
              toast.show({ message: `${label} nicht möglich. Bitte prüfe den aktuellen Stand.` });
              return;
            }
            offer(`${label} nicht möglich. ${errorText(error)}`, label, groupId);
          }
        })();
      },
    };
    toast.show({
      message,
      actionLabel: label,
      onAction: action.run,
      onDismiss: () => {
        if (history.snapshot() === action) history.set(null);
      },
    });
    history.set(action);
  };

  return async function write<T extends { groupId: string }>(
    run: () => Promise<T>,
    message: (result: T) => string,
  ): Promise<T | undefined> {
    history.set(null);
    toast.dismiss();
    const revision = history.revision();
    const toastRevision = toast.revision();
    const current = () => history.revision() === revision && toast.revision() === toastRevision;
    try {
      const result = await run();
      await refresh();
      if (!current()) return result;
      const hint =
        'toBeAssignedCents' in result && typeof result.toBeAssignedCents === 'number'
          ? overAssignmentHint(result.toBeAssignedCents)
          : undefined;
      // A stale quick-fill or an exhausted pool may produce no audit entries.
      if (!result.groupId || ('changedCount' in result && result.changedCount === 0)) {
        toast.show({ message: message(result) });
        return result;
      }
      offer([message(result), hint].filter(Boolean).join(' · '), 'Rückgängig', result.groupId);
      return result;
    } catch (error) {
      if (current()) toast.show({ message: errorText(error) });
      return undefined;
    }
  };
}
