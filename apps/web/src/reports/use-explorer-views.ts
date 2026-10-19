import {
  legacyExplorerViews,
  type ExplorerViewsChange,
  type ExplorerViewsWrite,
} from '@budget/domain';
import { useToast } from '@budget/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { undoGroup } from '../ledger/api';
import { errorText } from '../ledger/labels';
import { EXPLORER_VIEWS_KEY } from './explorer-views';
import {
  acknowledgeExplorerPromotion,
  changeSavedExplorerViews,
  savedExplorerViewsQuery,
  SAVED_EXPLORER_KEY,
} from './explorer-view-api';

const localRaw = () => {
  try {
    return localStorage.getItem(EXPLORER_VIEWS_KEY);
  } catch {
    return null;
  }
};

export function useExplorerViews() {
  const saved = useQuery(savedExplorerViewsQuery());
  const qc = useQueryClient();
  const toast = useToast();
  const [raw, setRaw] = useState(localRaw);
  const [retry, setRetry] = useState(0);
  const [migrationError, setMigrationError] = useState('');
  const [writing, setWriting] = useState(false);
  const legacy = legacyExplorerViews(raw);
  const revision = saved.data?.revision;
  const unavailable = saved.data?.unavailable;

  const attempt = useRef('');
  const promotion = useMutation({
    mutationFn: ({ revision, raw }: { revision: string; raw: string }) =>
      changeSavedExplorerViews(revision, {
        kind: 'import',
        views: legacyExplorerViews(raw).views,
      }),
    onMutate: () => setMigrationError(''),
    onSuccess: (response, source) => {
      if (response.unavailable || response.schemaVersion !== 1) {
        setMigrationError(
          'Gespeicherte Ansichten sind nicht verfügbar. Lokale Daten bleiben erhalten.',
        );
        return;
      }
      let acknowledged = false;
      try {
        acknowledged = acknowledgeExplorerPromotion(
          localStorage,
          source.raw,
          legacyExplorerViews(source.raw).pending,
          response,
        );
      } catch {
        /* Blocked storage cannot acknowledge the preserved source. */
      }
      if (acknowledged) setRaw(localRaw());
      else
        setMigrationError(
          'Lokale Daten bleiben bis zur Bestätigung erhalten. Bitte erneut versuchen.',
        );
      qc.setQueryData(SAVED_EXPLORER_KEY, response);
    },
    onError: (error: unknown) =>
      setMigrationError(`Lokale Ansichten bleiben erhalten. ${errorText(error)}`),
  });
  const promote = promotion.mutate;
  useEffect(() => {
    if (!revision || unavailable || raw === null || !legacyExplorerViews(raw).views.length) return;
    // StrictMode and unrelated revision refreshes must not dispatch the same promotion twice.
    // Failures remain explicit and retryable; the source is never cleared before acknowledgment.
    const key = JSON.stringify([raw, retry]);
    if (attempt.current === key) return;
    attempt.current = key;
    promote({ revision, raw });
  }, [revision, unavailable, raw, retry, promote]);
  const promoting = promotion.isPending;

  const refresh = () => qc.invalidateQueries({ queryKey: SAVED_EXPLORER_KEY });
  const offerUndo = (groupId: string, message: string) =>
    toast.show({
      message,
      actionLabel: 'Rückgängig',
      onAction: () =>
        void undoGroup(groupId).then(
          async (undone) => {
            await refresh();
            toast.show({
              message: 'Rückgängig gemacht.',
              actionLabel: 'Wiederholen',
              onAction: () =>
                void undoGroup(undone.groupId).then(refresh, (error: unknown) =>
                  toast.show({ message: errorText(error) }),
                ),
            });
          },
          (error: unknown) =>
            toast.show({ message: `Rückgängig nicht möglich. ${errorText(error)}` }),
        ),
    });
  const write = async (
    change: ExplorerViewsChange,
    message: string,
  ): Promise<ExplorerViewsWrite | undefined> => {
    if (!saved.data || saved.data.unavailable || writing || promoting) return;
    setWriting(true);
    try {
      const response = await changeSavedExplorerViews(saved.data.revision, change);
      qc.setQueryData(SAVED_EXPLORER_KEY, response);
      if (response.changed) offerUndo(response.groupId, message);
      else toast.show({ message });
      return response;
    } catch (error) {
      toast.show({ message: errorText(error) });
      await refresh();
      return undefined;
    } finally {
      setWriting(false);
    }
  };
  return {
    ...saved,
    views: saved.data?.views ?? [],
    write,
    busy: writing || promoting,
    migrationError,
    unavailableLocalCount: legacy.pending.length + Number(legacy.unreadable),
    retryMigration: async () => {
      const fresh = await saved.refetch();
      if (fresh.isError) {
        setMigrationError(`Lokale Ansichten bleiben erhalten. ${errorText(fresh.error)}`);
        return;
      }
      setRaw(localRaw());
      setRetry((value) => value + 1);
    },
  };
}
