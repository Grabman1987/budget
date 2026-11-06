import { ApiError, notifyApiWrite, request } from '../api/http';
import {
  addReceiptIntent,
  assertReceiptEpoch,
  finishReceiptIntent,
  listReceiptIntents,
  markReceiptIntent,
  receiptEpoch,
  withReceiptLock,
  type ReceiptIntent,
} from './receipt-store';

export interface ReceiptAcknowledgement {
  receipt: { id: string; sha256: string; sizeBytes: number };
  groupId: string;
}
const UUID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
function acknowledged(value: unknown): value is ReceiptAcknowledgement {
  const data = value as Partial<ReceiptAcknowledgement> | null;
  return Boolean(
    data &&
    typeof data.groupId === 'string' &&
    UUID.test(data.groupId) &&
    data.receipt &&
    typeof data.receipt.id === 'string' &&
    UUID.test(data.receipt.id) &&
    typeof data.receipt.sha256 === 'string' &&
    /^[a-f\d]{64}$/.test(data.receipt.sha256) &&
    Number.isSafeInteger(data.receipt.sizeBytes) &&
    data.receipt.sizeBytes > 0,
  );
}

/** Headless capture only. Every explicit selection gets a fresh, durable identity before POST. */
export async function enqueueReceipt(file: File, bookingId?: string): Promise<ReceiptIntent> {
  const epoch = receiptEpoch();
  if (!file.size || file.size > 15 * 1024 * 1024) throw new ApiError(400, 'invalid_receipt_size');
  if (bookingId !== undefined && (!bookingId || bookingId.length > 128))
    throw new ApiError(400, 'invalid_receipt_target');
  return withReceiptLock(epoch, async () => {
    const rows = await listReceiptIntents(epoch);
    return addReceiptIntent({
      id: crypto.randomUUID(),
      epoch,
      createdAt: Math.max(Date.now(), (rows.at(-1)?.createdAt ?? 0) + 1),
      file: new Blob([file], { type: file.type }),
      filename: file.name,
      ...(bookingId === undefined ? {} : { bookingId }),
      uncertain: false,
    });
  });
}

function reason(error: unknown): ReceiptIntent['reason'] {
  if (!(error instanceof ApiError) || error.status === 0) return 'network';
  if (error.status === 401) return 'login_required';
  if (error.code === 'idempotency_conflict') return 'conflict';
  return error.status >= 500 ? 'server_unavailable' : 'rejected';
}

async function deliver(item: ReceiptIntent): Promise<ReceiptAcknowledgement | undefined> {
  // The stored immutable bytes/target, never caller replacements, define every retry.
  const marked = await markReceiptIntent(item.id, item.epoch);
  if (!marked) return;
  try {
    const form = new FormData();
    form.set('file', marked.file, marked.filename);
    if (marked.bookingId !== undefined) form.set('bookingId', marked.bookingId);
    form.set('uploadIntent', marked.id);
    assertReceiptEpoch(marked.epoch);
    const result = await request<unknown>('POST', '/api/receipts', form, {
      'Idempotency-Key': marked.id,
    });
    if (!acknowledged(result)) throw new ApiError(0, 'network');
    if (await finishReceiptIntent(marked.id, marked.epoch)) {
      assertReceiptEpoch(marked.epoch);
      notifyApiWrite();
      return result;
    }
  } catch (error) {
    // Keep failed/uncertain files for an explicit retry, but never resurrect a wiped/removed row.
    await markReceiptIntent(marked.id, marked.epoch, reason(error)).catch(() => undefined);
    throw error;
  }
}

/** Independent of the financial FIFO/lock: a file failure never rolls a booking back. */
export async function sendReceiptQueue(
  onSent: (reply: ReceiptAcknowledgement) => void = () => {},
): Promise<void> {
  const epoch = receiptEpoch();
  await withReceiptLock(epoch, async () => {
    if (!navigator.onLine) return;
    for (const item of await listReceiptIntents(epoch)) {
      try {
        const reply = await deliver(item);
        if (reply) {
          assertReceiptEpoch(epoch);
          onSent(reply);
        }
      } catch {
        break;
      }
    }
  });
}
