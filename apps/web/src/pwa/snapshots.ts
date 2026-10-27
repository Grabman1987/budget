import { todayInVienna } from '@budget/domain';

/** Four explicitly approved offline reads. This store never contains credentials or request headers. */
export type SnapshotKind = 'heute' | 'accounts' | 'plan' | 'bookings';
export interface Snapshot<T = unknown> {
  kind: SnapshotKind;
  key: string;
  fetchedAt: number;
  epoch: string;
  data: T;
}

const DATABASE = 'budget-offline-views';
const CHANNEL = 'budget-offline-signout';
const READ_PERMISSION = 'budget-offline-read-epoch';
const TAB_ID = String(Math.random());
let revoked = false;
let generation = 0;
let offlineUnavailable = false;
let activating: Promise<void> | undefined;
let activatingFor: number | undefined;
export const snapshotGeneration = () => generation;

export const setOfflineUnavailable = (value: boolean) => {
  offlineUnavailable = value;
};
export const offlineReadOnly = () =>
  (typeof navigator !== 'undefined' && !navigator.onLine) || offlineUnavailable;
/** A completed new login can start a new snapshot generation in the same tab. */
export const resumeSnapshots = () => {
  revoked = false;
};
function readPermission(): string | null {
  try {
    return localStorage.getItem(READ_PERMISSION);
  } catch {
    return null;
  }
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DATABASE, 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('views', { keyPath: 'kind' });
      open.result.createObjectStore('meta');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

/** Captured before a network read; null disables persistence when IndexedDB is unavailable. */
export async function snapshotEpoch(): Promise<string | null> {
  if (revoked) return null;
  const permission = readPermission();
  if (!permission) return null;
  try {
    const db = await database();
    try {
      return await new Promise<string | null>((resolve) => {
        const tx = db.transaction('meta', 'readonly');
        const get = tx.objectStore('meta').get('epoch');
        get.onsuccess = () => resolve(
          !revoked && readPermission() === permission && get.result === permission
            ? permission
            : null,
        );
        get.onerror = () => resolve(null);
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/** A known authenticated session may grant offline reads only after old rows are cleared. */
export function activateSnapshots(expectedGeneration: number): Promise<void> {
  if (revoked || generation !== expectedGeneration) return Promise.resolve();
  if (activating && activatingFor === expectedGeneration) return activating;
  activatingFor = expectedGeneration;
  activating = (async () => {
    if (await snapshotEpoch()) return;
    const epoch = await physicallyClearSnapshots();
    if (revoked || generation !== expectedGeneration) return;
    try {
      localStorage.setItem(READ_PERMISSION, epoch);
    } catch {
      // A quota/blocked store grants no offline read permission.
    }
  })().finally(() => {
    if (activatingFor === expectedGeneration) {
      activating = undefined;
      activatingFor = undefined;
    }
  });
  return activating;
}

/** Immediately fences this tab while the physical wipe opens IndexedDB. */
export function revokeSnapshots(): void {
  revoked = true;
  generation += 1;
  try {
    localStorage.removeItem(READ_PERMISSION);
  } catch {
    /* The physical clear is still attempted; no successful-clear claim follows a failure. */
  }
  if ('BroadcastChannel' in globalThis) {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ source: TAB_ID });
    channel.close();
  }
}

export function subscribeSnapshotEpoch(changed: () => void): () => void {
  let deliveredGeneration = generation;
  const receive = () => {
    if (!revoked) {
      revoked = true;
      generation += 1;
      try { localStorage.removeItem(READ_PERMISSION); } catch { /* Clear still runs in sender. */ }
    }
    if (deliveredGeneration !== generation) {
      deliveredGeneration = generation;
      changed();
    }
  };
  const storage = (event: StorageEvent) => {
    if (event.key === READ_PERMISSION && event.newValue === null) receive();
  };
  window.addEventListener('storage', storage);
  const channel = 'BroadcastChannel' in globalThis ? new BroadcastChannel(CHANNEL) : null;
  if (channel) channel.onmessage = (event: MessageEvent<{ source: string }>) => {
    if (event.data?.source !== TAB_ID) receive();
  };
  return () => {
    window.removeEventListener('storage', storage);
    channel?.close();
  };
}

/** One atomic transaction prevents a delayed old read from repopulating after a completed wipe. */
export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  if (revoked || readPermission() !== snapshot.epoch) return;
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['meta', 'views'], 'readwrite');
      const current = tx.objectStore('meta').get('epoch');
      current.onsuccess = () => {
        if (!revoked && readPermission() === snapshot.epoch && current.result === snapshot.epoch)
          tx.objectStore('views').put(snapshot);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function readSnapshots(): Promise<Partial<Record<SnapshotKind, Snapshot>>> {
  if (revoked) return {};
  const permission = readPermission();
  if (!permission) return {};
  const db = await database();
  try {
    return await new Promise<Partial<Record<SnapshotKind, Snapshot>>>((resolve, reject) => {
      const tx = db.transaction(['meta', 'views'], 'readonly');
      const current = tx.objectStore('meta').get('epoch');
      const rows = tx.objectStore('views').getAll();
      tx.oncomplete = () => {
        resolve(revoked || readPermission() !== permission || current.result !== permission ? {} : Object.fromEntries(
          (rows.result as Snapshot[])
            .filter((row) => row.epoch === permission)
            .map((row) => [row.kind, row]),
        ));
      };
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Keeps the database schema, but physically removes every financial row. */
async function physicallyClearSnapshots(): Promise<string> {
  const epoch = crypto.randomUUID();
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['meta', 'views'], 'readwrite');
      tx.objectStore('meta').put(epoch, 'epoch');
      tx.objectStore('views').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  return epoch;
}

export async function clearSnapshots(): Promise<void> {
  revokeSnapshots();
  await physicallyClearSnapshots();
}

/** Only the primary read for each approved view; no filtered/older bookings or historic Plan. */
export function snapshotRequest(path: string): { kind: SnapshotKind; key: string } | null {
  if (!path.startsWith('/api/')) return null;
  const url = new URL(path, 'https://budget.invalid');
  if (url.pathname === '/api/accounts' && !url.search) return { kind: 'accounts', key: path };
  if (/^\/api\/budget\/\d{4}-\d{2}$/.test(url.pathname) && !url.search) {
    if (url.pathname.endsWith(todayInVienna().slice(0, 7))) return { kind: 'plan', key: path };
  }
  if (url.pathname === '/api/heute' && url.searchParams.size === 2) {
    const month = url.searchParams.get('month');
    const period = url.searchParams.get('period');
    if (/^\d{4}-\d{2}$/.test(month ?? '') && (period === 'month' || period === 'payday'))
      return { kind: 'heute', key: path };
  }
  if (url.pathname === '/api/bookings') {
    const keys = [...url.searchParams.keys()];
    if (keys.length === 2 && keys.includes('to') && keys.includes('limit') &&
      url.searchParams.get('limit') === '50' &&
      url.searchParams.get('to') === todayInVienna())
      return { kind: 'bookings', key: path };
  }
  return null;
}
