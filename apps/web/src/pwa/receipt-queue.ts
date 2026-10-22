import {
  ApiError,
  notifyApiWrite,
  queuedReceiptUpload,
  type ReceiptUploadAcknowledgment,
} from '../api/http';
import {
  acknowledgeReceiptUpload,
  beginReceiptQueue,
  claimReceiptUpload,
  listReceiptUploads,
  rejectReceiptUpload,
  updateReceiptUploadStatus,
  withReceiptQueueLock,
  type ReceiptUploadFailure,
} from './receipt-queue-store';

function failureReason(error: unknown): ReceiptUploadFailure {
  if (!(error instanceof ApiError)) return 'cleanup';
  if (error.status === 401) return 'login';
  if (error.code === 'idempotency_conflict') return 'conflict';
  if (error.status >= 500 || error.code === 'invalid_receipt_ack') return 'server';
  if (error.status === 0) return 'offline';
  return 'rejected';
}

/** Fixed UI text only: no server detail, filename, request contents or financial diagnostics. */
export function receiptQueueReason(reason: ReceiptUploadFailure) {
  const messages: Record<ReceiptUploadFailure, string> = {
    offline: 'Keine Verbindung. Der Beleg bleibt auf diesem Gerät.',
    login: 'Bitte erneut anmelden. Der Beleg bleibt auf diesem Gerät.',
    server: 'Serverempfang unklar. Bitte denselben Beleg erneut senden.',
    conflict: 'Der Sendeschlüssel ist bereits anders belegt. Bitte den Serverstand prüfen.',
    rejected: 'Der Server hat den Beleg abgelehnt. Datei und Buchungsziel prüfen.',
    cleanup: 'Der Belegspeicher ist nicht verfügbar. Bitte denselben Eintrag erneut prüfen.',
  };
  return messages[reason];
}

/**
 * One bounded FIFO pass; a blocked file stops only this file queue, never saved bookings/text
 * capture. Callers may wake it on online/focus/manual retry. No loop or background auth claim.
 */
export const sendReceiptQueue = (
  onSent: (result: ReceiptUploadAcknowledgment) => void = () => undefined,
) =>
  withReceiptQueueLock(async () => {
    let sent = 0;
    if (navigator.onLine === false) return { sent };
    for (const item of await listReceiptUploads()) {
      const token = await beginReceiptQueue();
      // Native atomic claim loses to an earlier cancellation; no POST follows a missing row.
      if (!(await claimReceiptUpload(token, item.id))) continue;
      let result: ReceiptUploadAcknowledgment;
      try {
        result = await queuedReceiptUpload(token, item.id);
        await acknowledgeReceiptUpload(token, item.id);
      } catch (error) {
        const blocked = failureReason(error);
        try {
          if (
            error instanceof ApiError &&
            [400, 413, 415, 422].includes(error.status) &&
            blocked === 'rejected'
          ) await rejectReceiptUpload(token, item.id);
          else await updateReceiptUploadStatus(token, item.id, blocked);
        } catch {
          // A newer privacy fence must never be bypassed to recreate a failure/old payload.
          return { sent, blocked: 'cleanup' as const };
        }
        return { sent, blocked };
      }
      sent++;
      try {
        notifyApiWrite();
        onSent(result);
      } catch {
        /* A failed refresh/render cannot retry an already acknowledged and removed intent. */
      }
    }
    return { sent };
  });
