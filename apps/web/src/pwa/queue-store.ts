import type { BookingCreate } from '../ledger/api';
import type { BookingDraft } from '../ledger/booking-model';
import type { AccountType } from '../ledger/types';

export interface QueuedBooking {
  id: string;
  createdAt: number;
  input: BookingCreate;
  draft: BookingDraft;
  reason?: string;
  /** A lost response might already have booked this exact payload. Resolve before editing. */
  uncertain: boolean;
}

// Only form choices, never balances, API responses, cookies or authentication material.
export interface CaptureChoices {
  accounts: {
    id: string;
    name: string;
    type: AccountType;
    onBudget: boolean;
    sortOrder: number;
    closedAt: string | null;
  }[];
  categories: {
    id: string;
    name: string;
    group: string;
    cls: 'need' | 'want' | 'future' | null;
    kind: string;
    hidden: boolean;
    availableCents: null;
  }[];
  contacts: { id: string; name: string }[];
  incomeTypes: { id: string; name: string }[];
  projects: { id: string; name: string; archivedAt?: string | null }[];
}

const DATABASE = 'budget-capture';
export const QUEUE_CHANGED = 'budget-queue-changed';
let channel: BroadcastChannel | undefined;
function changed() {
  window.dispatchEvent(new Event(QUEUE_CHANGED));
  if ('BroadcastChannel' in globalThis) {
    channel ??= new BroadcastChannel(DATABASE);
    channel.postMessage('changed');
  }
}
export function subscribeQueue(fn: () => void) {
  window.addEventListener(QUEUE_CHANGED, fn);
  const listener = 'BroadcastChannel' in globalThis ? new BroadcastChannel(DATABASE) : undefined;
  listener?.addEventListener('message', fn);
  return () => {
    window.removeEventListener(QUEUE_CHANGED, fn);
    listener?.close();
  };
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DATABASE, 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('bookings', { keyPath: 'id' });
      open.result.createObjectStore('choices');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () =>
      reject(new Error('Gerätespeicher nicht verfügbar. Die Eingaben bleiben im Formular.'));
  });
}

async function access<T>(
  store: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = operation(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () =>
        reject(
          new Error(
            'Nicht auf dem Gerät gespeichert. Lass das Formular geöffnet und versuch es erneut.',
          ),
        );
    });
  } finally {
    db.close();
  }
}

export const listQueue = async () =>
  ((await access('bookings', 'readonly', (s) => s.getAll())) as QueuedBooking[]).sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
export async function putQueued(item: QueuedBooking) {
  await access('bookings', 'readwrite', (s) => s.put(item));
  changed();
}
export async function deleteQueued(id: string) {
  await access('bookings', 'readwrite', (s) => s.delete(id));
  changed();
}
export const readChoices = () =>
  access<CaptureChoices | undefined>('choices', 'readonly', (s) => s.get('capture'));
export const saveChoices = (choices: CaptureChoices) =>
  access('choices', 'readwrite', (s) => s.put(choices, 'capture'));

// All tab writers share a lock. The fallback still serializes one page; API keys guard delivery.
let pending: Promise<unknown> = Promise.resolve();
export function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  if (navigator.locks) return navigator.locks.request('budget-capture', fn);
  const next = pending.then(fn, fn);
  pending = next.catch(() => undefined);
  return next;
}

export async function editQueued(id: string, input: BookingCreate, draft: BookingDraft) {
  await withQueueLock(async () => {
    const current = (await listQueue()).find((item) => item.id === id);
    if (!current) throw new Error('Dieser Eintrag wurde bereits gesendet oder gelöscht.');
    if (current.uncertain)
      throw new Error(
        'Prüfe zuerst mit „Jetzt senden“, ob der Server diese Buchung schon erhalten hat.',
      );
    const { reason, ...rest } = current;
    void reason;
    await putQueued({ ...rest, input, draft });
  });
}
export async function removeQueued(id: string) {
  await withQueueLock(async () => {
    const current = (await listQueue()).find((item) => item.id === id);
    if (current?.uncertain)
      throw new Error(
        'Prüfe zuerst mit „Jetzt senden“, ob der Server diese Buchung schon erhalten hat.',
      );
    await deleteQueued(id);
  });
}
