import { useToast } from '@budget/ui';
import { queryOptions, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/http';
import { undoGroup } from '../ledger/api';
import { errorText } from '../ledger/labels';
import { LEDGER_KEY } from '../ledger/queries';
import { EXPECTED_KEY } from '../expected/api';
import { fetchCategories } from './api';

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
  const refresh = () =>
    Promise.all(AFFECTED.map((queryKey) => qc.invalidateQueries({ queryKey: [...queryKey] })));
  const refreshView = async () => {
    try {
      await refresh();
      return true;
    } catch {
      // A failed read after a committed write must not erase its receipt or Undo action.
      return false;
    }
  };

  const failed = (action: 'Rückgängig' | 'Wiederholen', error: unknown) =>
    toast.show({
      message: `${action} nicht möglich. ${
        error instanceof ApiError && error.code === 'undo_refused'
          ? 'Bitte prüfe den aktuellen Stand.'
          : errorText(error)
      }`,
    });

  return async function write<T extends { groupId: string }>(
    run: () => Promise<T>,
    message: (result: T) => string,
  ): Promise<T | undefined> {
    let result: T;
    try {
      result = await run();
    } catch (error) {
      toast.show({ message: errorText(error) });
      return undefined;
    }
    const refreshed = await refreshView();
    const successMessage = `${message(result)}${refreshed ? '' : ' Andere Ansichten konnten nicht aktualisiert werden.'}`;
    // A stale quick-fill or an exhausted pool may produce no audit entries.
    if ('changedCount' in result && result.changedCount === 0) {
      toast.show({ message: successMessage });
      return result;
    }
    toast.show({
      message: successMessage,
      actionLabel: 'Rückgängig',
      onAction: () =>
        void undoGroup(result.groupId).then(
          async (undone) => {
            const undoRefreshed = await refreshView();
            toast.show({
              message: undoRefreshed ? 'Rückgängig gemacht.' :
                'Rückgängig gemacht. Andere Ansichten konnten nicht aktualisiert werden.',
              actionLabel: 'Wiederholen',
              onAction: () =>
                void undoGroup(undone.groupId).then(async () => {
                  if (!(await refreshView()))
                    toast.show({ message: 'Wiederholt. Andere Ansichten konnten nicht aktualisiert werden.' });
                }, (error: unknown) => failed('Wiederholen', error)),
            });
          },
          (error: unknown) => failed('Rückgängig', error),
        ),
    });
    return result;
  };
}
