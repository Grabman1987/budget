import { useToast } from '@budget/ui';
import { queryOptions, useQueryClient } from '@tanstack/react-query';
import { undoGroup } from '../ledger/api';
import { errorText } from '../ledger/labels';
import { HEUTE_KEY } from '../heute/api';
import { FREEDOM_KEY } from '../wealth/freedom-api';
import { evaluateRules, fetchCheck, fetchRules } from './api';

export const RULES_KEY = ['rules'] as const;
export const RULES_CHECK_KEY = ['rules-check'] as const;

export const rulesQuery = () => queryOptions({ queryKey: RULES_KEY, queryFn: fetchRules });
export const rulesCheckQuery = () =>
  queryOptions({ queryKey: RULES_CHECK_KEY, queryFn: fetchCheck });

/**
 * Run a write of the rule book, re-derive the stored results (the panel shows the newest one),
 * refresh the lists and offer "Rückgängig" (the whole audit group) with "Wiederholen" afterwards.
 */
export function useRuleWrite() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: [...RULES_KEY] }),
      qc.invalidateQueries({ queryKey: [...RULES_CHECK_KEY] }),
      qc.invalidateQueries({ queryKey: HEUTE_KEY }),
      qc.invalidateQueries({ queryKey: FREEDOM_KEY }),
    ]);
  const refresh = async () => {
    await invalidate();
    // Derived data, re-derived in the background: the panel shows the newest stored result as
    // soon as it is there, and a failed evaluation leaves the older results in place.
    void evaluateRules()
      .then(invalidate)
      .catch(() => undefined);
  };

  return async function write<T extends { groupId: string }>(
    run: () => Promise<T>,
    message: (result: T) => string,
    restored?: { undo: () => void; redo: () => void },
  ): Promise<T | undefined> {
    try {
      const result = await run();
      toast.show({
        message: message(result),
        actionLabel: 'Rückgängig',
        onAction: () =>
          void undoGroup(result.groupId).then(
            async (undone) => {
              await refresh();
              restored?.undo();
              toast.show({
                message: 'Rückgängig gemacht.',
                actionLabel: 'Wiederholen',
                onAction: () =>
                  void undoGroup(undone.groupId).then(async () => {
                    await refresh();
                    restored?.redo();
                  }),
              });
            },
            (error: unknown) => toast.show({ message: errorText(error) }),
          ),
      });
      await refresh();
      return result;
    } catch (error) {
      toast.show({ message: errorText(error) });
      return undefined;
    }
  };
}
