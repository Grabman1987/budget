import { useToast } from '@budget/ui';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  bulkDeleteBookings,
  bulkUpdateBookings,
  createBooking,
  deleteBooking,
  patchBooking,
  undoGroup,
  type BookingCreate,
  type BookingPatch,
  type BulkResult,
} from './api';
import { applyBulk, mapCachedBookings, patchListed, type BulkSet, type Names } from './cache';
import { flashRows } from './flash';
import { pluralBookings } from './format';
import { errorText } from './labels';
import { LEDGER_KEY, lookupsQuery, payeesQuery } from './queries';
import type { ListedBooking, WriteResult } from './types';

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
  const settled = () => qc.invalidateQueries({ queryKey: LEDGER_KEY });

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
              onAction: () => void undoGroup(undone.groupId).then(settled),
            });
          },
          (error: unknown) => toast.show({ message: errorText(error) }),
        );
      },
    });
  const failed = (what: string) => (error: unknown) =>
    toast.show({ message: `${what} nicht gespeichert. ${errorText(error, '')}`.trim() });

  const create = useMutation({
    mutationFn: (input: BookingCreate) => createBooking(input),
    onSuccess: ({ bookings, groupId }) => {
      flashRows(bookings.map((b) => b.id));
      offerUndo(bookings.length > 1 ? 'Umbuchung gebucht.' : 'Buchung gespeichert.', groupId);
    },
    onSettled: settled,
  });

  const patch = useMutation({
    mutationFn: ({ id, patch: body }: { id: string; patch: BookingPatch }) =>
      patchBooking(id, body),
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
    mutationFn: ({ id, unlock }: { id: string; unlock?: boolean }) => deleteBooking(id, unlock),
    onMutate: ({ id }) => optimistic(qc, (b) => (b.id === id ? null : b)),
    onError: (error, _vars, snapshot) => {
      rollback(qc, snapshot);
      failed('Löschen')(error);
    },
    onSuccess: ({ groupId }: WriteResult) => offerUndo('Buchung gelöscht.', groupId),
    onSettled: settled,
  });

  const bulk = useMutation({
    mutationFn: (vars: { ids: string[]; set: BulkSet } | { ids: string[]; remove: true }) =>
      'remove' in vars ? bulkDeleteBookings(vars.ids) : bulkUpdateBookings(vars.ids, vars.set),
    onMutate: (vars) => {
      const ids = new Set(vars.ids);
      const names = namesFrom(qc);
      if (!('remove' in vars)) flashRows(vars.ids);
      return optimistic(qc, (b) => {
        if (!ids.has(b.id)) return b;
        return 'remove' in vars ? null : applyBulk(b, vars.set, names);
      });
    },
    onError: (error, _vars, snapshot) => {
      rollback(qc, snapshot);
      failed('Änderung')(error);
    },
    onSuccess: (result: BulkResult, vars) => {
      const verb = 'remove' in vars ? 'gelöscht' : 'geändert';
      const skipped =
        result.skipped.length > 0
          ? ` ${result.skipped.length} übersprungen (Aufteilung, Umbuchung oder geprüft).`
          : '';
      offerUndo(`${pluralBookings(result.changed.length)} ${verb}.${skipped}`, result.groupId);
    },
    onSettled: settled,
  });

  return { create, patch, remove, bulk, offerUndo };
}
