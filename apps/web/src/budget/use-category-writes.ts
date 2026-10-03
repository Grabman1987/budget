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
    try {
      const result = await run();
      await refresh();
      toast.show({
        message: message(result),
        actionLabel: 'Rückgängig',
        onAction: () =>
          void undoGroup(result.groupId).then(
            async (undone) => {
              await refresh();
              toast.show({
                message: 'Rückgängig gemacht.',
                actionLabel: 'Wiederholen',
                onAction: () =>
                  void undoGroup(undone.groupId).then(refresh, (error: unknown) =>
                    failed('Wiederholen', error),
                  ),
              });
            },
            (error: unknown) => failed('Rückgängig', error),
          ),
      });
      return result;
    } catch (error) {
      toast.show({ message: errorText(error) });
      return undefined;
    }
  };
}
