/** Same-origin financial copies, never credentials. This is not encryption or cached authentication. */
export type OfflineView = 'today' | 'accounts' | 'plan' | 'bookings';
export interface ReadSnapshot<T = unknown> {
  view: OfflineView;
  params: string;
  fetchedAt: number;
  data: T;
  epoch: string;
}
export interface SnapshotToken {
  epoch: string;
  generation: number;
}

const DATABASE = 'budget-read-snapshots';
const SIGNAL = 'budget-read-snapshot-epoch'; // Nonfinancial wipe marker, not authentication.
const LOGOUT_PREFIX = 'budget-read-snapshot-logout.';
const STORAGE_PROBE = 'budget-read-snapshot-storage-check';
const STORAGE_TIMEOUT = 3000;
const listeners = new Set<() => void>();
let epoch: string | undefined;
let generation = 0;
let revision = 0;
let opening: Promise<void> | undefined;
let writesAllowed = false;
let writeHolds = 0;
let networkFailed = false;
let offlineViewer = false;
let channel: BroadcastChannel | undefined;
let observing = false;
const remoteHolds = new Set<string>();
const changed = () => {
  revision++;
  listeners.forEach((listener) => listener());
};
export const subscribeReadSnapshots = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const readSnapshotRevision = () => revision;
export const readSnapshotGeneration = () => generation;
export const networkUnavailable = () => networkFailed;
export const setNetworkUnavailable = (failed: boolean) => {
  if (networkFailed !== failed) {
    networkFailed = failed;
    changed();
  }
};
export const setOfflineViewer = (active: boolean) => {
  offlineViewer = active;
};
export const isOfflineViewer = () => offlineViewer;

function observeWipes() {
  if (observing || typeof window === 'undefined') return;
  observing = true;
  try {
    if (typeof indexedDB !== 'undefined' && 'BroadcastChannel' in globalThis) {
      channel = new BroadcastChannel(DATABASE);
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const data = event.data;
        if (typeof data === 'object' && data !== null && 'kind' in data) {
          if (data.kind === 'complete') remoteHolds.clear();
          if ('id' in data && typeof data.id === 'string') {
            if (data.kind === 'hold') remoteHolds.add(data.id);
            if (data.kind === 'release') remoteHolds.delete(data.id);
          }
        }
        invalidate();
      };
    }
  } catch {
    /* The independent storage event still invalidates other tabs. */
  }
  window.addEventListener('storage', (event) => {
    if (event.key === SIGNAL || event.key?.startsWith(LOGOUT_PREFIX)) invalidate();
  });
  window.addEventListener('online', () => setNetworkUnavailable(false));
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(fail, STORAGE_TIMEOUT);
    function fail() {
      settled = true;
      clearTimeout(timer);
      reject(new Error('Offline-Speicher nicht verfügbar.'));
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DATABASE, 1);
    } catch {
      fail();
      return;
    }
    request.onupgradeneeded = () => {
      request.result.createObjectStore('meta');
      request.result.createObjectStore('views', { keyPath: 'view' });
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (settled) request.result.close();
      else {
        settled = true;
        resolve(request.result);
      }
    };
    request.onerror = request.onblocked = fail;
  });
}

function signalEpoch() {
  try {
    return localStorage.getItem(SIGNAL);
  } catch {
    return undefined;
  }
}

function logoutKeys(): string[] {
  return Object.keys(localStorage).filter((key) => key.startsWith(LOGOUT_PREFIX));
}
function logoutPending(): boolean {
  if (writeHolds > 0 || remoteHolds.size > 0) return true;
  if (typeof window === 'undefined') return false;
  try {
    return logoutKeys().length > 0;
  } catch {
    return true;
  } // Inaccessible wipe fences never authorize a financial copy.
}

async function access<T>(
  mode: IDBTransactionMode,
  operation: (tx: IDBTransaction, finish: (value: T) => void) => void,
) {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(['meta', 'views'], mode);
      let value: T;
      const timer = setTimeout(() => tx.abort(), STORAGE_TIMEOUT);
      tx.oncomplete = () => {
        clearTimeout(timer);
        resolve(value);
      };
      tx.onerror = tx.onabort = () => {
        clearTimeout(timer);
        reject(new Error('Offline-Speicher nicht verfügbar.'));
      };
      operation(tx, (result) => {
        value = result;
      });
    });
  } finally {
    db.close();
  }
}

export function initializeReadSnapshots(): Promise<void> {
  observeWipes();
  if (opening) return opening;
  const started = generation;
  opening = access<{ current: string; fence: string | null }>('readwrite', (tx, finish) => {
    const meta = tx.objectStore('meta');
    const request = meta.get('epoch');
    request.onsuccess = () => {
      // Read-only localStorage cannot durably fence a pending logout in a newly opened tab.
      // Refuse financial copies in that mode even if IndexedDB itself still works.
      try {
        localStorage.setItem(STORAGE_PROBE, '1');
        localStorage.removeItem(STORAGE_PROBE);
      } catch {
        tx.abort();
        return;
      }
      const stored = request.result as string | undefined;
      const fence = signalEpoch();
      if (fence === undefined) {
        tx.abort();
        return;
      }
      // Never rewind to a marker's epoch: it may predate a successful wipe in another tab.
      const current =
        fence && fence !== stored ? crypto.randomUUID() : (stored ?? crypto.randomUUID());
      if (stored !== current || fence) tx.objectStore('views').clear();
      meta.put(current, 'epoch');
      finish({ current, fence });
    };
  })
    .then(({ current, fence }) => {
      try {
        if (fence && signalEpoch() === fence) localStorage.removeItem(SIGNAL);
      } catch {
        /* A remaining fence keeps captures and reads unavailable. */
      }
      if (generation === started) epoch = current;
    })
    .catch(() => {
      if (generation === started) epoch = undefined;
    });
  return opening;
}

export const snapshotAuthorizationToken = () => (!logoutPending() ? generation : undefined);

/** A real status response may enable future captures, never a query-cache auth value. */
export function allowReadSnapshotWrites(started: number | undefined): void {
  if (started !== undefined && started === generation && !logoutPending()) writesAllowed = true;
}

/** Logout is not finished while the server request is pending, even if a concurrent status says true. */
export function holdReadSnapshotWrites(): () => void {
  observeWipes();
  const id = crypto.randomUUID();
  writeHolds++;
  writesAllowed = false;
  try {
    localStorage.setItem(LOGOUT_PREFIX + id, '1');
  } catch {
    /* Independent broadcast below. */
  }
  try {
    channel?.postMessage({ kind: 'hold', id });
  } catch {
    /* Persistent fence remains. */
  }
  let released = false;
  return () => {
    if (!released) {
      writeHolds--;
      try {
        localStorage.removeItem(LOGOUT_PREFIX + id);
      } catch {
        /* Fail closed until real reauthentication. */
      }
      try {
        channel?.postMessage({ kind: 'release', id });
      } catch {
        /* Persistent fence remains. */
      }
    }
    released = true;
  };
}

/** Only call for a real completed logout, unauthenticated status or successful new login. */
export function completeSnapshotLogout(): void {
  try {
    for (const key of logoutKeys()) localStorage.removeItem(key);
  } catch {
    /* Fail closed. */
  }
  remoteHolds.clear();
  try {
    channel?.postMessage({ kind: 'complete' });
  } catch {
    /* Persistent epoch still protects writes. */
  }
}

/** Start before the HTTP request. A later sign-out invalidates this promise, too. */
export async function beginReadSnapshot(): Promise<SnapshotToken | undefined> {
  const started = generation;
  const allowed = writesAllowed && !logoutPending();
  await initializeReadSnapshots();
  return allowed && writesAllowed && !logoutPending() && generation === started && epoch
    ? { epoch, generation: started }
    : undefined;
}

export async function saveReadSnapshot<T>(
  token: SnapshotToken | undefined,
  snapshot: Omit<ReadSnapshot<T>, 'epoch'>,
): Promise<boolean> {
  if (
    !token ||
    !writesAllowed ||
    logoutPending() ||
    token.generation !== generation ||
    token.epoch !== epoch ||
    !['today', 'accounts', 'plan', 'bookings'].includes(snapshot.view) ||
    !Number.isFinite(snapshot.fetchedAt) ||
    snapshot.fetchedAt <= 0 ||
    typeof snapshot.params !== 'string'
  )
    return false;
  try {
    return await access<boolean>('readwrite', (tx, finish) => {
      const request = tx.objectStore('meta').get('epoch');
      request.onsuccess = () => {
        const signal = signalEpoch();
        if (
          !writesAllowed ||
          logoutPending() ||
          signal === undefined ||
          token.generation !== generation ||
          request.result !== token.epoch ||
          (signal && signal !== token.epoch)
        ) {
          finish(false);
          return;
        }
        tx.objectStore('views').put({ ...snapshot, epoch: token.epoch });
        finish(true);
      };
    });
  } catch {
    return false;
  }
}

export async function loadReadSnapshot<T>(
  view: OfflineView,
  params: string,
): Promise<ReadSnapshot<T> | undefined> {
  await initializeReadSnapshots();
  const started = generation;
  if (!epoch) return;
  try {
    const result = await access<ReadSnapshot<T> | undefined>('readonly', (tx, finish) => {
      const meta = tx.objectStore('meta').get('epoch');
      meta.onsuccess = () => {
        if (meta.result !== epoch) {
          finish(undefined);
          return;
        }
        const request = tx.objectStore('views').get(view);
        request.onsuccess = () => finish(request.result as ReadSnapshot<T> | undefined);
      };
    });
    const signal = signalEpoch();
    if (
      started !== generation ||
      result?.epoch !== epoch ||
      result.view !== view ||
      result.params !== params ||
      !Number.isFinite(result.fetchedAt) ||
      result.fetchedAt <= 0 ||
      signal === undefined ||
      logoutPending() ||
      (signal && signal !== result.epoch)
    )
      return;
    return result;
  } catch {
    return;
  }
}

function invalidate() {
  generation++;
  epoch = undefined;
  opening = undefined;
  writesAllowed = false;
  offlineViewer = false;
  changed(); // Hide displayed values before waiting for storage.
}

export async function clearReadSnapshots(): Promise<void> {
  observeWipes();
  invalidate();
  // An unsupported device cannot read or retain this store. Invalidate memory without starting
  // asynchronous storage bookkeeping; an existing but blocked IndexedDB still uses the fence below.
  if (typeof indexedDB === 'undefined') return;
  const next = crypto.randomUUID();
  try {
    localStorage.setItem(SIGNAL, next);
  } catch {
    /* Independent best-effort invalidation. */
  }
  try {
    channel?.postMessage('wipe');
  } catch {
    /* Storage marker and database still invalidate. */
  }
  try {
    await access<void>('readwrite', (tx, finish) => {
      tx.objectStore('views').clear();
      tx.objectStore('meta').put(next, 'epoch');
      finish(undefined);
    });
    // Keep the marker across reloads if erasure failed. A completed database transaction has
    // durably replaced the epoch, so its temporary localStorage fence is no longer needed.
    try {
      if (signalEpoch() === next) localStorage.removeItem(SIGNAL);
    } catch {
      /* Fail closed. */
    }
  } catch {
    /* Reads remain unavailable when storage is blocked. */
  }
}
