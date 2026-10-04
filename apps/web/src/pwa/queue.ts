import { ApiError } from '../api/http';
import { createBooking, type BookingCreate } from '../ledger/api';
import type { BookingDraft } from '../ledger/booking-model';
import {
  deleteQueued,
  listQueue,
  putQueued,
  withQueueLock,
  type QueuedBooking,
} from './queue-store';

export function queueReason(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return 'Keine Verbindung. Der Eintrag bleibt auf diesem Gerät.';
    if (error.status === 401) return 'Bitte erneut anmelden. Der Eintrag bleibt auf diesem Gerät.';
    if (
      error.code === 'reconciled_locked' ||
      error.code === 'month_locked' ||
      error.code === 'month_closed'
    )
      return 'Der Zeitraum ist gesperrt. Öffne ihn wieder oder ändere das Datum.';
    if (error.code === 'idempotency_conflict')
      return 'Der Server kennt diesen Eintrag bereits mit anderen Feldern. Prüfe die Buchungen.';
    if (
      error.code === 'account_closed' ||
      error.code === 'account_deleted' ||
      error.code === 'category_deleted'
    )
      return error.detail ?? 'Konto oder Kategorie nicht mehr verfügbar.';
    if (error.status >= 500)
      return 'Der Server ist vorübergehend nicht verfügbar. Versuche es erneut.';
    return 'Die Buchung wurde abgelehnt. Prüfe Konto, Kategorie und weitere Felder.';
  }
  return error instanceof Error ? error.message : 'Die Warteschlange ist nicht verfügbar.';
}

async function deliver(item: QueuedBooking) {
  // Persist uncertainty before POST: crashes and lost responses must keep the original key/body.
  await putQueued({ ...item, uncertain: true });
  try {
    const result = await createBooking(item.input, item.id);
    await deleteQueued(item.id);
    return result;
  } catch (error) {
    const uncertain =
      !(error instanceof ApiError) ||
      error.status === 0 ||
      error.status >= 500 ||
      error.code === 'idempotency_conflict';
    await putQueued({ ...item, uncertain, reason: queueReason(error) });
    throw error;
  }
}

/** A new capture is durable before any POST. HTTP rejection stays reviewable in the queue. */
export async function submitCapture(input: BookingCreate, draft: BookingDraft) {
  return withQueueLock(async () => {
    const existing = await listQueue();
    const item: QueuedBooking = {
      id: crypto.randomUUID(),
      createdAt: Math.max(Date.now(), (existing.at(-1)?.createdAt ?? 0) + 1),
      input,
      draft,
      uncertain: false,
    };
    await putQueued(item);
    if (!navigator.onLine) return null;
    // Older captures retain priority, including a conflict awaiting an owner decision.
    if ((await listQueue())[0]?.id !== item.id) return null;
    try {
      return await deliver(item);
    } catch {
      return null;
    }
  });
}

/** Strict FIFO: a rejected item holds later captures until edited or removed by the owner. */
export const sendQueue = (
  onSent: (result: Awaited<ReturnType<typeof createBooking>>) => void,
  heldItem: () => string | undefined = () => undefined,
) =>
  withQueueLock(async () => {
    if (!navigator.onLine) return;
    for (const item of await listQueue()) {
      if (heldItem() === item.id) break;
      try {
        onSent(await deliver(item));
      } catch {
        break;
      }
    }
  });

/** Background Sync is only a wake-up hint for open pages, never a required delivery path. */
export async function requestQueueSync() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const sync = (
    registration as
      (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }) | undefined
  )?.sync;
  await sync?.register('budget-bookings');
}
