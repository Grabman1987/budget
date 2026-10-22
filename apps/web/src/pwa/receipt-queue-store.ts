/** Device-only raw files, not encrypted storage or proof of an authenticated session. */
export type ReceiptUploadFailure =
  'offline' | 'login' | 'server' | 'conflict' | 'rejected' | 'cleanup';
export interface QueuedReceiptUpload {
  id: string;
  createdAt: number;
  blob: Blob;
  filename: string;
  mime: string;
  bookingId?: string;
  uncertain: boolean;
  failure?: ReceiptUploadFailure;
}
export interface ReceiptQueueToken {
  epoch: string;
  generation: number;
}

declare const recoveryTicketBrand: unique symbol;
/** Opaque, one-use, in-memory privacy snapshot; no raw files or authentication material. */
export interface ReceiptQueueRecoveryTicket {
  readonly [recoveryTicketBrand]: true;
}
interface RecoverySnapshot {
  pending: string[];
  completed: string[];
  epoch: unknown;
}
const recoveryTickets = new WeakMap<ReceiptQueueRecoveryTicket, RecoverySnapshot>();

const DATABASE = 'budget-receipt-uploads';
const SIGNAL = 'budget-receipt-queue-epoch';
const HOLD = 'budget-receipt-queue-signout.';
const STORAGE_PROBE = 'budget-receipt-queue-storage-capability-check.';
const TIMEOUT = 3000;
const LIMIT = 15 * 1024 * 1024;
const listeners = new Set<() => void>();
const knownHolds = new Set<string>();
let generation = 0;
let privacyGeneration = 0;
export const receiptQueuePrivacyGeneration = () => privacyGeneration;
let observing = false;
let observedEpoch: string | null | undefined;
let channel: BroadcastChannel | undefined;
let pending: Promise<unknown> = Promise.resolve();
const unavailable = () =>
  new Error(
    'Beleg nicht auf dem Gerät gespeichert. Lass die Dateiauswahl geöffnet und versuch es erneut.',
  );
const fenced = () =>
  new Error('Der Belegspeicher wird gerade geleert. Es wurde kein Beleg gespeichert.');
function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* A failed render cannot bypass a storage fence. */
    }
  }
}
function listChanged() {
  notifyListeners();
  try {
    channel?.postMessage('list');
  } catch {
    /* Persistence, not notification, establishes durability. */
  }
}
function invalidate(privacy = true) {
  generation++;
  if (privacy) privacyGeneration++;
  notifyListeners();
}
function announce() {
  invalidate();
  try {
    channel?.postMessage('changed');
  } catch {
    /* Storage events independently fence other tabs. */
  }
}
function observeCurrentFence() {
  try {
    const current = localStorage.getItem(SIGNAL);
    if (held() || current !== observedEpoch) {
      observedEpoch = current;
      invalidate();
    }
  } catch {
    invalidate();
  }
}
function observe() {
  if (observing) return;
  observing = true;
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === SIGNAL || event.key?.startsWith(HOLD))
      observeCurrentFence();
  });
  try {
    if ('BroadcastChannel' in globalThis) {
      channel = new BroadcastChannel(DATABASE);
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const data = event.data;
        if (data === 'list') notifyListeners();
        else if (typeof data === 'object' && data !== null && 'kind' in data) {
          if (
            data.kind === 'hold' &&
            'id' in data &&
            typeof data.id === 'string' &&
            data.id.startsWith(HOLD)
          ) {
            if (!knownHolds.has(data.id)) {
              knownHolds.add(data.id);
              invalidate();
            }
          } else if (data.kind === 'release' && 'ids' in data && Array.isArray(data.ids)) {
            let changed = false;
            for (const id of data.ids)
              if (typeof id === 'string') changed = knownHolds.delete(id) || changed;
            if (changed) invalidate();
          }
        } else observeCurrentFence();
      };
    }
  } catch {
    /* Durable nonfinancial storage markers remain required. */
  }
}
function held() {
  return knownHolds.size > 0 || Object.keys(localStorage).some((key) => key.startsWith(HOLD));
}
function marker() {
  try {
    if (held()) throw fenced();
    // Readable storage alone cannot guarantee that the next logout can fence raw files.
    const probe = `${STORAGE_PROBE}${crypto.randomUUID()}`;
    localStorage.setItem(probe, 'pending');
    try {
      if (localStorage.getItem(probe) !== 'pending') throw fenced();
    } finally {
      localStorage.removeItem(probe);
    }
    return localStorage.getItem(SIGNAL);
  } catch {
    throw fenced();
  }
}
export function subscribeReceiptQueue(listener: () => void) {
  observe();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let request: IDBOpenDBRequest;
    const timer = setTimeout(fail, TIMEOUT);
    function fail() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(unavailable());
    }
    try {
      request = indexedDB.open(DATABASE, 1);
    } catch {
      fail();
      return;
    }
    request.onupgradeneeded = () => {
      request.result.createObjectStore('intents', { keyPath: 'id' });
      request.result.createObjectStore('meta');
    };
    request.onerror = request.onblocked = fail;
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(request.result);
    };
  });
}
async function access<T>(
  mode: IDBTransactionMode,
  operation: (tx: IDBTransaction, finish: (value: T) => void) => void,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(['meta', 'intents'], mode);
      let value: T;
      let failure: unknown;
      const timer = setTimeout(() => tx.abort(), TIMEOUT);
      tx.oncomplete = () => {
        clearTimeout(timer);
        resolve(value);
      };
      tx.onerror = tx.onabort = () => {
        clearTimeout(timer);
        reject(failure ?? unavailable());
      };
      try {
        operation(tx, (result) => {
          value = result;
        });
      } catch (error) {
        failure = error;
        tx.abort();
      }
    });
  } finally {
    db.close();
  }
}

/** Native holds remain authoritative when LS failed. Completed IDs fence delayed reservations. */
function nativeHoldState(
  tx: IDBTransaction,
  done: (pending: string[], completed: Set<string>) => void,
) {
  const pending: string[] = [],
    completed = new Set<string>();
  const request = tx.objectStore('meta').openCursor();
  request.onsuccess = () => {
    try {
      const cursor = request.result;
      if (!cursor) {
        done(pending, completed);
        return;
      }
      if (typeof cursor.key === 'string' && cursor.key.startsWith(HOLD)) {
        if (cursor.value === 'pending') pending.push(cursor.key);
        if (cursor.value === 'complete') completed.add(cursor.key);
      }
      cursor.continue();
    } catch {
      tx.abort();
    }
  };
}
function nativeHolds(tx: IDBTransaction, done: (ids: string[]) => void) {
  nativeHoldState(tx, (pending) => done(pending));
}
function publishHold(id: string) {
  try {
    channel?.postMessage({ kind: 'hold', id });
  } catch {
    /* Native/LS holds remain independent. */
  }
}
function releaseKnown(ids: string[]) {
  let changed = false;
  for (const id of ids) changed = knownHolds.delete(id) || changed;
  if (changed) invalidate();
  try {
    channel?.postMessage({ kind: 'release', ids });
  } catch {
    /* Native/LS holds govern raw access. */
  }
}

/** Initialize/repair only this queue. Lost wipe markers never authorize old files. */
export async function beginReceiptQueue(): Promise<ReceiptQueueToken> {
  observe();
  marker(); // Unavailable durable cross-tab fences disable persistence, rather than claim success.
  const epoch = await access<string>('readwrite', (tx, finish) => {
    const meta = tx.objectStore('meta');
    nativeHolds(tx, (holds) => {
      if (holds.length) {
        tx.abort();
        return;
      }
      const request = meta.get('epoch');
      request.onsuccess = () => {
        try {
          const signal = marker();
          const previous: unknown = request.result;
          if (typeof previous === 'string' && previous === signal) {
            finish(previous);
            return;
          }
          // New storage, missing marker or a wipe that did not commit: discard old provenance.
          const next = crypto.randomUUID();
          localStorage.setItem(SIGNAL, next);
          tx.objectStore('intents').clear();
          meta.delete('lastCreatedAt');
          meta.put(next, 'epoch');
          invalidate(false);
          finish(next);
        } catch {
          tx.abort();
        }
      };
    });
  });
  if (marker() !== epoch) throw fenced();
  observedEpoch = epoch;
  return { epoch, generation };
}
export function receiptQueueTokenCurrent(token: ReceiptQueueToken): boolean {
  try {
    return token.generation === generation && marker() === token.epoch;
  } catch {
    return false;
  }
}
async function guarded<T>(
  token: ReceiptQueueToken,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, finish: (value: T) => void) => void,
): Promise<T> {
  if (!receiptQueueTokenCurrent(token)) throw fenced();
  const result = await access<T>(mode, (tx, finish) => {
    nativeHolds(tx, (holds) => {
      if (holds.length) {
        tx.abort();
        return;
      }
      const request = tx.objectStore('meta').get('epoch');
      request.onsuccess = () => {
        if (request.result !== token.epoch || !receiptQueueTokenCurrent(token)) {
          tx.abort();
          return;
        }
        try {
          operation(tx.objectStore('intents'), finish);
        } catch {
          tx.abort();
        }
      };
    });
  });
  if (!receiptQueueTokenCurrent(token)) throw fenced();
  return result;
}

/** An explicit selection commits a fresh immutable payload before transport is permitted. */
export async function enqueueReceiptUpload(
  file: File,
  bookingId?: string,
): Promise<QueuedReceiptUpload> {
  if (!(file instanceof File) || !file.size) throw new Error('Bitte einen Beleg auswählen.');
  if (file.size > LIMIT) throw new Error('Ein Beleg darf höchstens 15 MB groß sein.');
  if (bookingId !== undefined && (!bookingId || bookingId.length > 128))
    throw new Error('Ungültige Buchung für den Beleg.');
  const token = await beginReceiptQueue();
  const item: QueuedReceiptUpload = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    blob: file.slice(0, file.size, file.type),
    filename: file.name,
    mime: file.type,
    ...(bookingId === undefined ? {} : { bookingId }),
    uncertain: false,
  };
  await guarded<void>(token, 'readwrite', (store, finish) => {
    const meta = store.transaction.objectStore('meta');
    const last = meta.get('lastCreatedAt');
    last.onsuccess = () => {
      try {
        item.createdAt = Math.max(
          Date.now(),
          typeof last.result === 'number' ? last.result + 1 : 0,
        );
        store.add(item);
        meta.put(item.createdAt, 'lastCreatedAt');
        finish(undefined);
      } catch {
        store.transaction.abort();
      }
    };
  });
  // A list refresh does not invalidate a concurrent request's provenance.
  listChanged();
  return item;
}
export async function listReceiptUploads(): Promise<QueuedReceiptUpload[]> {
  const token = await beginReceiptQueue();
  return guarded(token, 'readonly', (store, finish) => {
    const request = store.getAll();
    request.onsuccess = () =>
      finish(
        (request.result as QueuedReceiptUpload[]).sort(
          (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
        ),
      );
  });
}

/** Claim and cancellation serialize in the same native store, even without Web Locks. */
export async function claimReceiptUpload(token: ReceiptQueueToken, id: string) {
  const claimed = await guarded<boolean>(token, 'readwrite', (store, finish) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result as QueuedReceiptUpload | undefined;
      if (!current) {
        finish(false);
        return;
      }
      try {
        store.put({ ...current, uncertain: true });
        finish(true);
      } catch {
        store.transaction.abort();
      }
    };
  });
  if (claimed) listChanged();
  return claimed;
}

/** The sealed multipart helper reads the durable payload, never a caller-supplied replacement. */
export function claimedReceiptUpload(token: ReceiptQueueToken, id: string) {
  return guarded<QueuedReceiptUpload | undefined>(token, 'readonly', (store, finish) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result as QueuedReceiptUpload | undefined;
      finish(current?.uncertain ? current : undefined);
    };
  });
}

/** Never use an acknowledgment to cancel: an uncertain intent must check its server result first. */
export async function cancelUnsentReceiptUpload(id: string) {
  const token = await beginReceiptQueue();
  const outcome = await guarded<'missing' | 'cancelled' | 'uncertain'>(
    token,
    'readwrite',
    (store, finish) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const current = request.result as QueuedReceiptUpload | undefined;
        if (!current) finish('missing');
        else if (current.uncertain) finish('uncertain');
        else {
          try {
            store.delete(id);
            finish('cancelled');
          } catch {
            store.transaction.abort();
          }
        }
      };
    },
  );
  if (outcome === 'uncertain')
    throw new Error('Serverempfang unklar. Bitte zuerst mit demselben Beleg erneut senden.');
  if (outcome === 'cancelled') listChanged();
  return outcome === 'cancelled';
}

/** Status changes cannot replace bytes, filename, target or key; uncertainty never rolls back. */
export async function updateReceiptUploadStatus(
  token: ReceiptQueueToken,
  id: string,
  failure?: ReceiptUploadFailure,
) {
  await guarded<void>(token, 'readwrite', (store, finish) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result as QueuedReceiptUpload | undefined;
      if (!current) {
        finish(undefined);
        return;
      }
      const { failure: previous, ...rest } = current;
      void previous;
      try {
        store.put({ ...rest, uncertain: true, ...(failure === undefined ? {} : { failure }) });
        finish(undefined);
      } catch {
        store.transaction.abort();
      }
    };
  });
  listChanged();
}
/** A complete validation rejection proves that this immutable upload has no server action.
 * Unlike network/auth/5xx/conflict replies, it can safely be cancelled without a fresh key retry.
 */
export async function rejectReceiptUpload(token: ReceiptQueueToken, id: string) {
  await guarded<void>(token, 'readwrite', (store, finish) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result as QueuedReceiptUpload | undefined;
      if (current) store.put({ ...current, uncertain: false, failure: 'rejected' });
      finish(undefined);
    };
  });
  listChanged();
}

export async function acknowledgeReceiptUpload(token: ReceiptQueueToken, id: string) {
  await guarded<void>(token, 'readwrite', (store, finish) => {
    store.delete(id);
    finish(undefined);
  });
  listChanged();
}

/** Separate from the text-booking lock. Server idempotency guards cross-tab fallback delivery. */
export function withReceiptQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  if (navigator.locks) return navigator.locks.request(DATABASE, fn);
  const next = pending.then(fn, fn);
  pending = next.catch(() => undefined);
  return next;
}

/**
 * Explicit intent fences this context synchronously and starts native persistence immediately.
 * Caller starts clear immediately, independently of logout HTTP; await ready/clear, then release
 * only after HTTP settles. Native fallback remains authoritative if the LS fence cannot be written.
 * Session expiry never calls this. Failed native persistence/clear is never reported successful.
 */
export function holdReceiptQueueForSignOut() {
  return receiptQueueHold();
}
function receiptQueueHold(recovery?: RecoverySnapshot) {
  observe();
  const id = `${HOLD}${crypto.randomUUID()}`;
  knownHolds.add(id);
  invalidate();
  let localStorageFence = false;
  try {
    localStorage.setItem(id, 'pending');
    localStorageFence = true;
  } catch {
    /* Immediate intent broadcast and native metadata persist independently below. */
  }
  publishHold(id);
  const ready = access<boolean>('readwrite', (tx, finish) => {
    const meta = tx.objectStore('meta'),
      request = meta.get(id);
    request.onsuccess = () => {
      try {
        if (request.result === 'complete') {
          finish(false);
          return;
        }
        meta.put('pending', id);
        finish(true);
      } catch {
        tx.abort();
      }
    };
  }).then((active) =>
    active
      ? { localStorageFence, nativeFence: true as const }
      : { localStorageFence, nativeFence: false as const, recovered: true as const },
  );
  void ready.catch(() => undefined); // The returned ready/clear/release still reject explicitly.
  let cleared = false;
  return {
    ready,
    async clear() {
      await ready;
      const result = await access<
        { stale: true; completed: string[] } | { stale: false; localMarkerUpdated: boolean }
      >('readwrite', (tx, finish) => {
        const meta = tx.objectStore('meta');
        const own = meta.get(id);
        own.onsuccess = () => {
          try {
            if (own.result !== 'pending') {
              tx.abort();
              return;
            }
            function wipe() {
              const epoch = crypto.randomUUID();
              let localMarkerUpdated = false;
              try {
                localStorage.setItem(SIGNAL, epoch);
                localMarkerUpdated = true;
              } catch {
                /* Native epoch and ALL newer native holds remain durable. */
              }
              tx.objectStore('intents').clear();
              meta.delete('lastCreatedAt');
              meta.put(epoch, 'epoch');
              // Completion and erase share this transaction; late reservations cannot resurrect IDs.
              for (const captured of recovery?.pending ?? []) meta.put('complete', captured);
              finish({ stale: false, localMarkerUpdated });
            }
            if (!recovery) {
              wipe();
              return;
            }
            const epoch = meta.get('epoch');
            epoch.onsuccess = () => {
              let stale = epoch.result !== recovery.epoch;
              const completed: string[] = [];
              let remaining = recovery.pending.length;
              const checked = () => {
                if (remaining) return;
                if (stale) {
                  // Retire ONLY this unused recovery reservation. Never erase on a stale ticket.
                  meta.put('complete', id);
                  finish({ stale: true, completed });
                } else wipe();
              };
              for (const captured of recovery.pending) {
                const request = meta.get(captured);
                request.onsuccess = () => {
                  if (request.result === 'complete') {
                    completed.push(captured);
                    stale = true;
                  } else if (request.result !== undefined && request.result !== 'pending') {
                    stale = true;
                  }
                  remaining--;
                  checked();
                };
              }
              checked();
            };
          } catch {
            tx.abort();
          }
        };
      });
      if (result.stale) {
        for (const completed of [id, ...result.completed]) localStorage.removeItem(completed);
        releaseKnown([id, ...result.completed]);
        throw fenced();
      }
      cleared = true;
      announce();
      return { nativeCleared: true as const, localMarkerUpdated: result.localMarkerUpdated };
    },
    async release() {
      await ready;
      // A completed explicit recovery may already have cleared this old intent.
      const present = await access<boolean>('readonly', (tx, finish) => {
        const request = tx.objectStore('meta').get(id);
        request.onsuccess = () => finish(request.result === 'pending');
      });
      if (present && !cleared) throw fenced();
      try {
        if (localStorage.getItem(id) !== null) localStorage.removeItem(id);
      } catch {
        throw fenced();
      }
      if (present)
        await access<void>('readwrite', (tx, finish) => {
          tx.objectStore('meta').put('complete', id);
          finish(undefined);
        });
      releaseKnown([id]);
    },
  };
}

/**
 * Prepare BEFORE starting a login/recovery/logout request. Native snapshot completion is the
 * capture boundary: every privacy intent created after this ticket is ready remains newer.
 * Optional preparation failure must not block login; without a ticket no queue repair is allowed.
 */
export async function prepareReceiptQueueRecovery(): Promise<ReceiptQueueRecoveryTicket> {
  observe();
  let captured: string[];
  try {
    captured = [...knownHolds, ...Object.keys(localStorage).filter((key) => key.startsWith(HOLD))];
  } catch {
    throw fenced();
  }
  const state = await access<RecoverySnapshot>('readonly', (tx, finish) =>
    nativeHoldState(tx, (ids, completed) => {
      const epoch = tx.objectStore('meta').get('epoch');
      epoch.onsuccess = () =>
        finish({
          pending: [...new Set([...captured.filter((id) => !completed.has(id)), ...ids])],
          completed: captured.filter((id) => completed.has(id)),
          epoch: epoch.result,
        });
    }),
  );
  const ticket = Object.freeze({}) as ReceiptQueueRecoveryTicket;
  recoveryTickets.set(ticket, state);
  return ticket;
}

/**
 * Consume ONLY after the prepared request actually confirms a new ceremony or completed logout.
 * Never merge later native/LS IDs: pending/unknown/newer holds survive async-open gaps.
 * Ordinary no-hold reauthentication retains bytes/key/epoch. Authenticated status is not a ceremony.
 */
export async function recoverReceiptQueueAfterConfirmedAction(
  action: 'new-login' | 'new-recovery' | 'completed-logout',
  ticket: ReceiptQueueRecoveryTicket,
) {
  if (!['new-login', 'new-recovery', 'completed-logout'].includes(action)) throw fenced();
  const state = recoveryTickets.get(ticket);
  if (!state) throw fenced();
  recoveryTickets.delete(ticket); // One-use even when later storage work fails.
  // Native-confirmed tombstones also repair a crash between native completion and LS cleanup.
  for (const id of state.completed) localStorage.removeItem(id);
  releaseKnown(state.completed);
  const previousHolds = state.pending;
  if (action !== 'completed-logout' && previousHolds.length === 0) {
    marker();
    return; // No erase or epoch change on ordinary no-hold reauthentication.
  }
  const recovery = receiptQueueHold(state);
  await recovery.clear();
  try {
    for (const id of previousHolds)
      if (localStorage.getItem(id) !== null) localStorage.removeItem(id);
  } catch {
    throw fenced();
  }
  releaseKnown(previousHolds);
  await recovery.release();
}
