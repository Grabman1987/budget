import { useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

type Action = { label: 'Rückgängig' | 'Wiederholen'; run: () => void };
/** The toolbar exposes the same latest audited action as the budget toast. */
const stores = new WeakMap<QueryClient, ReturnType<typeof createStore>>();
function createStore() {
  let action: Action | null = null;
  let revision = 0;
  const listeners = new Set<() => void>();
  return {
    snapshot: () => action,
    revision: () => revision,
    set(next: Action | null) {
      revision += 1;
      action = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export function planHistory(client: QueryClient) {
  let store = stores.get(client);
  if (!store) {
    store = createStore();
    stores.set(client, store);
  }
  return store;
}
export function usePlanHistory() {
  const store = planHistory(useQueryClient());
  return useSyncExternalStore(store.subscribe, store.snapshot, () => null);
}
