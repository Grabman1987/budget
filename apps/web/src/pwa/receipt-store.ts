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
const PROBE_KEY = 'budget-receipt-storage-probe';
const INITIAL_EPOCH = 'initial';
const UUID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
export class ReceiptStorageError extends Error {
  constructor(readonly code: 'unavailable' | 'cleared') {
    super(
      code === 'cleared' ? 'Receipt queue was cleared.' : 'Receipt device storage unavailable.',
    );
  }
}

const observed = new Set<string>();
const revoked = new Set<string>();
// Subscribe independently of UI mounting. Only opaque epoch identifiers cross this channel.
const revocations = (() => {
  try {
    if (typeof window === 'undefined' || !window.BroadcastChannel) return undefined;
    const channel = new window.BroadcastChannel('budget-receipt-revocations');
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data as { epochs?: unknown } | null;
      if (data && Array.isArray(data.epochs))
        for (const epoch of data.epochs)
          if (typeof epoch === 'string' && (epoch === INITIAL_EPOCH || UUID.test(epoch)))
            revoked.add(epoch);
    };
    return channel;
  } catch {
    return undefined;
  }
})();

function storedEpoch(): string {
  try {
    const epoch = localStorage.getItem(EPOCH_KEY) ?? INITIAL_EPOCH;
    if (epoch !== INITIAL_EPOCH && !UUID.test(epoch)) throw new ReceiptStorageError('unavailable');
    return epoch;
  } catch {
    throw new ReceiptStorageError('unavailable');
  }
}
/** Synchronous, before any lock, database-open or file-read await. No file data enters localStorage. */
export function receiptEpoch(): string {
  // This new raw-file queue requires cross-context serialization; the text queue is unchanged.
  if (!navigator.locks) throw new ReceiptStorageError('unavailable');
  const epoch = storedEpoch();
  observed.add(epoch);
  if (revoked.has(epoch)) throw new ReceiptStorageError('cleared');
  try {
    // Reads alone do not establish a usable logout fence. Probe without ever rewriting an epoch:
    // writing back a captured value could rewind a concurrent tab's newer wipe.
    localStorage.setItem(PROBE_KEY, crypto.randomUUID());
    localStorage.removeItem(PROBE_KEY);
  } catch {
    throw new ReceiptStorageError('unavailable');
  }
  const current = storedEpoch();
  if (current !== epoch || revoked.has(current)) throw new ReceiptStorageError('cleared');
  return epoch;
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
  access<ReceiptIntent[]>(epoch, 'readonly', (store, result, guard) => {
    const read = store.getAll();
    read.onsuccess = guard(() => {
      const rows = (read.result as ReceiptIntent[]).sort(
        (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
      );
      let remaining = rows.length;
      if (!remaining) return result(rows);
      rows.forEach((row, index) => {
        const state = store.transaction.objectStore('meta').get(row.id);
        state.onsuccess = guard(() => {
          rows[index] = {
            ...row,
            ...(state.result as Pick<ReceiptIntent, 'uncertain' | 'reason'>),
          };
          if (--remaining === 0) result(rows);
        });
      });
    });
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
      // The physical Blob is written exactly once. Re-putting an IndexedDB Blob onto its own
      // key can invalidate its backing file in WebKit; mutable delivery state lives separately.
      const state = { uncertain: true, reason };
      store.transaction.objectStore('meta').put(state, id).onsuccess = () =>
        result({ ...item, ...state });
    });
  });

/** Only the first acknowledged cleanup wins. */
export const finishReceiptIntent = (id: string, epoch: string) =>
  access<boolean>(epoch, 'readwrite', (store, result, guard) => {
    const read = store.get(id);
    read.onsuccess = guard(() => {
      if (!read.result) return result(false);
      store.transaction.objectStore('meta').delete(id);
      store.delete(id).onsuccess = () => result(true);
    });
  });

/** Rotate the cross-tab fence synchronously, then clear files and the database fence atomically. */
export async function clearReceiptIntents(): Promise<void> {
  const epoch = crypto.randomUUID();
  let previous: string | undefined;
  // Logical revocation precedes storage access/awaits, including a failed rotation or blocked open.
  try {
    previous = storedEpoch();
    observed.add(previous);
  } catch {
    // Already-observed tickets must still be revoked when even reads have become unavailable.
  }
  for (const previous of observed) revoked.add(previous);
  try {
    revocations?.postMessage({ epochs: [...revoked] });
  } catch {
    // A failed notification must not prevent the local/durable revocation attempts.
  }
  let storageFailed = false;
  try {
    localStorage.setItem(EPOCH_KEY, epoch);
  } catch {
    storageFailed = true;
  }
  const clear = async () => {
    const db = await database();
    try {
      // Check ownership after the open/lock wait, including failed rotations. Never overwrite a
      // newer clear's database fence or erase its fresh captures. An unreadable owner fails closed.
      if (storedEpoch() !== (storageFailed ? previous : epoch)) return;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['files', 'meta'], 'readwrite');
        tx.onabort = tx.onerror = () => reject(new ReceiptStorageError('unavailable'));
        tx.oncomplete = () => resolve();
        tx.objectStore('files').clear();
        tx.objectStore('meta').clear();
        tx.objectStore('meta').put(epoch, 'epoch');
      });
    } finally {
      db.close();
    }
  };
  // Separate from network/generation locks. A bounded sign-out may return while this remains held;
  // subsequent clears wait, and their new epoch cannot capture until the database fence matches.
  if (navigator.locks) await navigator.locks.request('budget-receipt-clears', clear);
  else await clear(); // Best-effort removal only: this browser cannot admit new receipt intents.
  if (storageFailed) throw new ReceiptStorageError('unavailable');
}

export function withReceiptLock<T>(epoch: string, run: () => Promise<T>): Promise<T> {
  assertReceiptEpoch(epoch);
  const current = () => {
    assertReceiptEpoch(epoch);
    return run();
  };
  // An old, stalled open/send must not hold a fresh post-sign-out capture behind its lock.
  return navigator.locks.request(`budget-receipt-intents:${epoch}`, current);
}
