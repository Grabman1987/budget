import { ApiError } from '../api/http';
import { createBooking, patchBooking, readBookingDelivery } from '../ledger/api';
import type { BookingDraft } from '../ledger/booking-model';
import {
  completeQueued,
  deleteQueued,
  setQueuedSending,
  listQueue,
  putQueued,
  withQueueLock,
  type QueuedBooking,
} from './queue-store';

/**
 * A definite refusal (4xx, or an unhandled 500 with its error id) is not retried and does not
 * block later entries. Connection loss, 401, 408/429 and 502-504 stay in the queue (#1144).
 */
export const isRejection = (error: unknown): boolean =>
  error instanceof ApiError &&
  ((error.status >= 400 &&
    error.status < 500 &&
    ![401, 408, 429].includes(error.status) &&
    error.code !== 'idempotency_conflict') ||
    (error.status === 500 && error.code === 'server_error'));

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
    if (isRejection(error))
      return error.status === 500
        ? // Only the API's fixed, data-free fallback is safe to retain from an unhandled error.
          error.detail === 'Die Anfrage konnte nicht verarbeitet werden.'
          ? error.detail
          : 'Der Server konnte diese Buchung nicht verarbeiten.'
        : (error.detail ??
            'Die Buchung wurde abgelehnt. Prüfe Konto, Kategorie und weitere Felder.');
    if (error.status >= 500)
      return 'Der Server ist vorübergehend nicht verfügbar. Versuche es erneut.';
    return 'Die Buchung wurde abgelehnt. Prüfe Konto, Kategorie und weitere Felder.';
  }
  return error instanceof Error ? error.message : 'Die Warteschlange ist nicht verfügbar.';
}

async function deliver(item: QueuedBooking) {
  setQueuedSending(item.id, true);
  let uncertain = item.uncertain;
  let checking = uncertain;
  try {
    const { reason: _reason, rejected: _rejected, errorId: _errorId, ...pending } = item;
    void _reason;
    void _rejected;
    void _errorId;
    await putQueued({ ...pending, sending: true });
    // An unavailable check must never fall through to POST or release the original payload.
    const intent = item.change
      ? { type: 'patch' as const, ...item.change }
      : item.input.type !== 'change'
        ? { type: 'create' as const, input: item.input }
        : null;
    if (!intent) throw new Error('Ungültiger Warteschlangeneintrag.');
    const previous = uncertain ? (await readBookingDelivery(item.id, intent)).result : null;
    checking = false;
    if (previous === null && item.rejected && item.uncertain) {
      // A parked HTTP 500 may still have been committed: only now, with the server saying it did
      // not receive the entry, is it safe to edit or delete it. No new POST here.
      await putQueued({ ...item, uncertain: false, sending: false });
      return null;
    }
    uncertain = true;
    await putQueued({ ...pending, uncertain: true, sending: true });
    const result =
      previous ??
      (intent.type === 'patch'
        ? await patchBooking(intent.bookingId, intent.patch, item.id)
        : await createBooking(intent.input, item.id));
    await completeQueued({
      id: item.id,
      bookingIds: result.bookings.map((booking) => booking.id),
      savedAt: result.savedAt ?? new Date().toISOString(),
    });
    return result;
  } catch (error) {
    uncertain =
      uncertain &&
      (!(error instanceof ApiError) ||
        error.status === 0 ||
        error.status >= 500 ||
        error.code === 'idempotency_conflict');
    // A failed receipt check (including session expiry) cannot prove the original POST failed.
    if (checking) uncertain = true;
    // A server answer is final: the same idempotency key is kept for the corrected resend.
    const refusal = !checking && error instanceof ApiError && isRejection(error) ? error : null;
    // A 500 may have committed before failing: it stays unclear until a delivery check says so.
    if (refusal && refusal.status !== 500) uncertain = false;
    const { rejected: _r, errorId: _e, ...base } = item;
    void _r;
    void _e;
    const keep =
      checking && item.rejected
        ? { rejected: true as const, ...(item.errorId ? { errorId: item.errorId } : {}) }
        : {};
    await putQueued({
      ...base,
      ...keep,
      uncertain,
      sending: false,
      reason: queueReason(error),
      ...(refusal
        ? { rejected: true as const, ...(refusal.errorId ? { errorId: refusal.errorId } : {}) }
        : {}),
    });
    throw error;
  } finally {
    setQueuedSending(item.id, false);
  }
}

/** A new capture is durable before any POST. HTTP rejection stays reviewable in the queue. */
export async function submitCapture(
  input: QueuedBooking['input'],
  draft: BookingDraft,
  change?: QueuedBooking['change'],
) {
  return withQueueLock(async () => {
    const existing = await listQueue();
    const pending = change
      ? existing.find((item) => item.change?.bookingId === change.bookingId)
      : undefined;
    if (pending?.uncertain) {
      if (JSON.stringify(pending.change?.patch) === JSON.stringify(change?.patch)) return null;
      throw new Error(
        'Für diese Buchung wartet bereits eine Änderung. Prüfe zuerst ihren Speicherstatus.',
      );
    }
    const item: QueuedBooking = {
      // A definite refusal has not claimed its key: correction/retry retains the same intent.
      id: pending?.id ?? crypto.randomUUID(),
      createdAt: pending?.createdAt ?? Math.max(Date.now(), (existing.at(-1)?.createdAt ?? 0) + 1),
      input,
      draft,
      uncertain: false,
      ...(change ? { change } : {}),
    };
    await putQueued(item);
    if (!navigator.onLine) return null;
    // Older captures retain priority, including a conflict awaiting an owner decision.
    if ((await listQueue()).find((row) => !row.rejected)?.id !== item.id) return null;
    try {
      return await deliver(item);
    } catch (error) {
      // Keep definite edit refusals actionable in the form. Unclear receipt stays queued and
      // closes capture through booking_queued, so a later acknowledgement cannot duplicate repeat.
      if (
        change &&
        error instanceof ApiError &&
        error.status > 0 &&
        error.status < 500 &&
        error.code !== 'idempotency_conflict'
      )
        throw error;
      return null;
    }
  });
}

/** Explicitly discarding a refused edit must not leave it blocking later captures. */
export const discardRejectedChange = (bookingId: string) =>
  withQueueLock(async () => {
    const item = (await listQueue()).find((row) => row.change?.bookingId === bookingId);
    if (item?.reason && !item.uncertain && !item.sending) await deleteQueued(item.id);
  });

/** FIFO; a rejected item is parked as a draft and later entries continue (#1144). */
export const sendQueue = (
  onSent: (result: Awaited<ReturnType<typeof createBooking>>) => void,
  heldItem: () => string | undefined = () => undefined,
  /** Only the owner's explicit "Jetzt senden" tries a rejected draft again. */
  retryRejected = false,
) =>
  withQueueLock(async () => {
    if (!navigator.onLine) return;
    for (const item of await listQueue()) {
      if (heldItem() === item.id) break;
      if (item.rejected && !retryRejected) continue;
      try {
        const sent = await deliver(item);
        if (sent) onSent(sent);
      } catch (error) {
        if (isRejection(error)) continue;
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
