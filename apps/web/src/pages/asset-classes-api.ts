import type { AssetClassesSettingsView } from '@budget/db';
import { queryOptions, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@budget/ui';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import { undoGroup } from '../ledger/api';
import { errorText } from '../ledger/labels';
export type { AssetClassesSettingsView } from '@budget/db';
export const assetSettingsQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'asset-settings'],
    retry: false,
    queryFn: () => request<AssetClassesSettingsView>('GET', '/api/asset-classes/settings'),
  });
export function useAssetWrite() {
  const qc = useQueryClient();
  const toast = useToast();
  const reverse = (groupId: string, redo = false) =>
    void undoGroup(groupId).then(
      async (r) => {
        await qc.invalidateQueries();
        toast.show({
          message: redo ? 'Wiederholt.' : 'Rückgängig gemacht.',
          actionLabel: redo ? 'Rückgängig' : 'Wiederholen',
          onAction: () => reverse(r.groupId, !redo),
        });
      },
      (error: unknown) => toast.show({ message: errorText(error) }),
    );
  return async (run: () => Promise<{ groupId: string }>, message: string) => {
    const result = await run();
    await qc.invalidateQueries();
    toast.show({ message, actionLabel: 'Rückgängig', onAction: () => reverse(result.groupId) });
  };
}
