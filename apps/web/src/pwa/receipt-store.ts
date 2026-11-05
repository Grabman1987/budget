/** Separate raw-file storage. The existing text capture database is deliberately untouched. */
export interface ReceiptIntent {
  id: string;
  epoch: string;
  createdAt: number;
  file: Blob;
  filename: string;
  bookingId?: string;
  uncertain: boolean;
  reason?:
    'network' | 'login_required' | 'rejected' | 'server_unavailable' | 'conflict' | undefined;
}

const DATABASE = 'budget-receipt-intents';
const EPOCH_KEY = 'budget-receipt-wipe-epoch';
const INITIAL_EPOCH = 'initial';
export class ReceiptStorageError extends Error {
  constructor(readonly code: 'unavailable' | 'cleared') {
    super(
      code === 'cleared' ? 'Receipt queue was cleared.' : 'Receipt device storage unavailable.',
    );
  }
}

/** Synchronous, before any lock, database-open or file-read await. No file data enters localStorage. */
export function receiptEpoch(): string {
  try {
    return localStorage.getItem(EPOCH_KEY) ?? INITIAL_EPOCH;
  } catch {
    throw new ReceiptStorageError('unavailable');
  }
}
export function assertReceiptEpoch(epoch: string): void {
  if (receiptEpoch() !== epoch) throw new ReceiptStorageError('cleared');
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let open: IDBOpenDBRequest;
    try {
      open = indexedDB.open(DATABASE, 1);
    } catch {
      reject(new ReceiptStorageError('unavailable'));
      return;
    }
    open.onupgradeneeded = () => {
      open.result.createObjectStore('files', { keyPath: 'id' });
      open.result.createObjectStore('meta');
    };
    open.onerror = open.onblocked = () => {
      settled = true;
      reject(new ReceiptStorageError('unavailable'));
    };
    open.onsuccess = () => {
      if (settled) return open.result.close();
      settled = true;
      open.result.onversionchange = () => open.result.close();
      resolve(open.result);
    };
  });
}

async function access<T>(
  epoch: string,
  mode: IDBTransactionMode,
  run: (
    store: IDBObjectStore,
    result: (value: T) => void,
    guard: (handler: () => void) => () => void,
  ) => void,
): Promise<T> {
  assertReceiptEpoch(epoch);
  const db = await database();
  try {
    assertReceiptEpoch(epoch);
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(['files', 'meta'], mode);
      let value: T;
      let failure: unknown;
      const guard = (handler: () => void) => () => {
        try {
          handler();
        } catch (error) {
          failure =
            error instanceof ReceiptStorageError ? error : new ReceiptStorageError('unavailable');
          tx.abort();
        }
      };
      tx.onabort = tx.onerror = () => reject(failure ?? new ReceiptStorageError('unavailable'));
      tx.oncomplete = () => {
        try {
          assertReceiptEpoch(epoch);
          resolve(value);
        } catch (error) {
          reject(error);
        }
      };
      const fence = tx.objectStore('meta').get('epoch');
      fence.onsuccess = () => {
        try {
          assertReceiptEpoch(epoch);
          if ((fence.result ?? INITIAL_EPOCH) !== epoch) throw new ReceiptStorageError('cleared');
          run(tx.objectStore('files'), (result) => (value = result), guard);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
    });
  } catch (error) {
    throw error instanceof ReceiptStorageError ? error : new ReceiptStorageError('unavailable');
  } finally {
    db.close();
  }
}

export const listReceiptIntents = (epoch = receiptEpoch()) =>
  access<ReceiptIntent[]>(epoch, 'readonly', (store, result) => {
    const read = store.getAll();
    read.onsuccess = () =>
      result(
        (read.result as ReceiptIntent[]).sort(
          (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
        ),
      );
  });

export const addReceiptIntent = (item: ReceiptIntent) =>
  access<ReceiptIntent>(item.epoch, 'readwrite', (store, result) => {
    store.add(item).onsuccess = () => result(item);
  });

/** Update only an existing intent; a delayed failure must never recreate a removed file. */
export const markReceiptIntent = (id: string, epoch: string, reason?: ReceiptIntent['reason']) =>
  access<ReceiptIntent | undefined>(epoch, 'readwrite', (store, result, guard) => {
    const read = store.get(id);
    read.onsuccess = guard(() => {
      const item = read.result as ReceiptIntent | undefined;
      if (!item) return result(undefined);
      const updated = { ...item, uncertain: true, reason };
      store.put(updated).onsuccess = () => result(updated);
    });
  });

/** Only the first acknowledged cleanup wins, even without Web Locks in two tabs. */
export const finishReceiptIntent = (id: string, epoch: string) =>
  access<boolean>(epoch, 'readwrite', (store, result, guard) => {
    const read = store.get(id);
    read.onsuccess = guard(() => {
      if (!read.result) return result(false);
      store.delete(id).onsuccess = () => result(true);
    });
  });

/** Rotate the cross-tab fence synchronously, then clear files and the database fence atomically. */
export async function clearReceiptIntents(): Promise<void> {
  const epoch = crypto.randomUUID();
  let storageFailed = false;
  try {
    localStorage.setItem(EPOCH_KEY, epoch);
  } catch {
    storageFailed = true;
  }
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['files', 'meta'], 'readwrite');
      tx.onabort = tx.onerror = () => reject(new ReceiptStorageError('unavailable'));
      tx.oncomplete = () => resolve();
      // A slower, older wipe must not overwrite a newer wipe or erase its fresh captures.
      if (!storageFailed && receiptEpoch() !== epoch) return;
      tx.objectStore('files').clear();
      tx.objectStore('meta').put(epoch, 'epoch');
    });
  } finally {
    db.close();
  }
  if (storageFailed) throw new ReceiptStorageError('unavailable');
}

const pending = new Map<string, Promise<unknown>>();
export function withReceiptLock<T>(epoch: string, run: () => Promise<T>): Promise<T> {
  const current = () => {
    assertReceiptEpoch(epoch);
    return run();
  };
  // An old, stalled open/send must not hold a fresh post-sign-out capture behind its lock.
  if (navigator.locks) return navigator.locks.request(`budget-receipt-intents:${epoch}`, current);
  const next = (pending.get(epoch) ?? Promise.resolve()).then(current, current);
  const tail = next.catch(() => undefined);
  pending.set(epoch, tail);
  void tail.finally(() => {
    if (pending.get(epoch) === tail) pending.delete(epoch);
  });
  return next;
}
