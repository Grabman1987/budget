import { useToast } from '@budget/ui';
import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import {
  bulkDeleteBookings,
  bulkUpdateBookings,
  deleteBooking,
  patchBooking,
  undoGroup,
  type BookingCreate,
  type BookingPatch,
  type BulkResult,
} from './api';
import { applyBulk, mapCachedBookings, patchListed, type BulkSet, type Names } from './cache';
import { BUDGET_KEY } from '../budget/use-category-writes';
import { flashRows } from './flash';
import { bulkSummary, errorText, redoFailedText } from './labels';
import { LEDGER_KEY, lookupsQuery, payeesQuery } from './queries';
import type { BookingPage, ListedBooking, WriteResult } from './types';
import type { BookingDraft } from './booking-model';
import { submitCapture, requestQueueSync } from '../pwa/queue';

const BOOKINGS_KEY = [...LEDGER_KEY, 'bookings'] as const;

type Snapshot = ReturnType<QueryClient['getQueriesData']>;

/** Names for optimistic views come from the caches the panel and lists already filled. */
function namesFrom(qc: QueryClient): Names {
  const lookups = qc.getQueryData(lookupsQuery().queryKey);
  const payees = qc.getQueryData(payeesQuery().queryKey);
  return {
    category: (id) => (id ? (lookups?.categories.find((c) => c.id === id)?.name ?? null) : null),
    payee: (id) => (id ? (payees?.payees.find((p) => p.id === id)?.name ?? null) : null),
  };
}

/** Change every cached booking list, remembering what it looked like for a rollback. */
async function optimistic(
  qc: QueryClient,
  fn: (b: ListedBooking) => ListedBooking | null,
): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: BOOKINGS_KEY });
  const snapshot = qc.getQueriesData({ queryKey: BOOKINGS_KEY });
  qc.setQueriesData({ queryKey: BOOKINGS_KEY }, (data) =>
    mapCachedBookings(data as Parameters<typeof mapCachedBookings>[0], fn),
  );
  return snapshot;
}

const rollback = (qc: QueryClient, snapshot: Snapshot | undefined) => {
  for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data);
};

/**
 * Writes of the ledger with optimistic updates and rollback: edits, deletes and bulk edits show at
 * once and are restored when the server refuses; every write ends with a refetch. Each success
 * shows a toast with "Rückgängig" (undo of the whole action) that offers "Wiederholen" afterwards.
 */
export function useLedgerWrites() {
  const qc = useQueryClient();
  const toast = useToast();
  // A booking moves account balances (ledger) and the Available of its category (budget).
  const settled = () => {
    // Invalidation reuses an initial pending fetch with no data. Discard pre-write booking reads
    // first, or an empty account's old response can satisfy the refresh after its first capture.
    void qc.cancelQueries({ queryKey: BOOKINGS_KEY }).then(() => {
      // Restart cursor lists after a write, rather than refetching every older page.
      qc.setQueriesData<InfiniteData<BookingPage>>(
        { queryKey: [...BOOKINGS_KEY, 'infinite'] },
        (data) =>
          data && { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
      );
      // Active figures refresh in the background; inactive wealth stays stale for its next visit.
      // Returning immediately keeps every refetch (including a visible wealth page) off save's path.
      void qc.invalidateQueries({ queryKey: LEDGER_KEY });
      void qc.invalidateQueries({ queryKey: BUDGET_KEY });
      void qc.invalidateQueries({ queryKey: ['expected'] });
    });
  };

  const offerUndo = (message: string, groupId: string) =>
    toast.show({
      message,
      actionLabel: 'Rückgängig',
      onAction: () => {
        void undoGroup(groupId).then(
          (undone) => {
            void settled();
            toast.show({
              message: 'Rückgängig gemacht.',
              actionLabel: 'Wiederholen',
              onAction: () =>
                void undoGroup(undone.groupId).then(settled, (error: unknown) =>
                  toast.show({ message: redoFailedText(error) }),
                ),
            });
          },
          (error: unknown) => toast.show({ message: errorText(error) }),
        );
      },
    });
  const failed = (what: string) => (error: unknown) =>
    toast.show({ message: `${what} nicht gespeichert. ${errorText(error, '')}`.trim() });

  const create = useMutation({
    networkMode: 'always',
    mutationFn: ({ input, draft }: { input: BookingCreate; draft: BookingDraft }) =>
      submitCapture(input, draft),
    onSuccess: (result) => {
      if (!result) {
        toast.show({ message: 'Auf diesem Gerät gespeichert · Wartet auf Verbindung.' });
        void requestQueueSync().catch(() => undefined);
        return;
      }
      const { bookings, groupId } = result;
      flashRows(bookings.map((b) => b.id));
      offerUndo(bookings.length > 1 ? 'Umbuchung gebucht.' : 'Buchung gespeichert.', groupId);
    },
    onSettled: settled,
  });

  const patch = useMutation({
    mutationFn: ({ id, patch: body, key }: { id: string; patch: BookingPatch; key?: string }) =>
      patchBooking(id, body, key),
    onMutate: async ({ id, patch: body }) => {
      const names = namesFrom(qc);
      flashRows([id]);
      return optimistic(qc, (b) => (b.id === id ? patchListed(b, body, names) : b));
    },
    onError: (error, _vars, snapshot) => {
      rollback(qc, snapshot);
      failed('Änderung')(error);
    },
    onSuccess: ({ groupId }) => offerUndo('Buchung geändert.', groupId),
    onSettled: settled,
  });

  const remove = useMutation({
    mutationFn: ({ id, unlock, previewRevision }: { id: string; unlock?: boolean; previewRevision?: string }) => deleteBooking(id, unlock, previewRevision),
    onMutate: ({ id }) => optimistic(qc, (b) => (b.id === id ? null : b)),
    onError: (error, _vars, snapshot) => {
      rollback(qc, snapshot);
      failed('Löschen')(error);
    },
    onSuccess: ({ groupId }: WriteResult) => offerUndo('Gelöscht.', groupId),
    onSettled: settled,
  });

  const bulk = useMutation({
    mutationFn: (vars: { ids: string[]; set: BulkSet } | { ids: string[]; remove: true; previewRevision: string }) =>
      'remove' in vars ? bulkDeleteBookings(vars.ids, vars.previewRevision) : bulkUpdateBookings(vars.ids, vars.set),
    // Eligibility is authoritative on the server. Never optimistically alter skipped rows.
    onMutate: () => qc.cancelQueries({ queryKey: BOOKINGS_KEY }),
    onError: (error) => failed('Änderung')(error),
    onSuccess: (result: BulkResult, vars) => {
      const changed = new Set(result.changed),
        names = namesFrom(qc);
      qc.setQueriesData({ queryKey: BOOKINGS_KEY }, (data) =>
        mapCachedBookings(data as Parameters<typeof mapCachedBookings>[0], (b) =>
          changed.has(b.id) ? ('remove' in vars ? null : applyBulk(b, vars.set, names)) : b,
        ),
      );
      if (result.changed.length) {
        flashRows(result.changed);
        offerUndo(bulkSummary(result, 'remove' in vars ? 'gelöscht' : 'geändert'), result.groupId);
      } else
        toast.show({ message: bulkSummary(result, 'remove' in vars ? 'gelöscht' : 'geändert') });
    },
    onSettled: settled,
  });

  return { create, patch, remove, bulk, offerUndo };
}
