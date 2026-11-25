import { todayInVienna } from '@budget/domain';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { isMonth, monthOf, shiftMonth } from '../nav/month';
import { snapshotEpoch } from './snapshots';

/**
 * Stale-while-revalidate across reloads: the last successful answers of the key read queries are
 * kept in IndexedDB and put back into the query cache at startup, so Heute, Plan and the sidebar
 * render at once with the last known data while fresh data loads (restored entries keep their old
 * timestamp, so they count as stale and are read again at once).
 *
 * Privacy and safety:
 * - Rows carry the offline-snapshot epoch. The epoch is replaced on login and revoked on sign-out
 *   and session loss, so rows of another or ended session are neither written nor restored.
 *   `clearDeviceFinancialData` also empties this store.
 * - The store is per device and only holds the allow-listed read queries below, never mutations.
 * - A changed build (cache buster) or an age over a day drops the row.
 */
const DATABASE = 'budget-query-cache';
const STORE = 'entries';
const MAX_AGE_MS = 24 * 3_600_000;
const SAVE_DELAY_MS = 1_000;
const RESTORE_TIMEOUT_MS = 300;
const BUSTER = String(import.meta.env['VITE_BUDGET_BUILD'] ?? 'dev');

interface Entry {
  hash: string;
  key: QueryKey;
  epoch: string;
  buster: string;
  updatedAt: number;
  data: unknown;
}

function recentMonths(): Set<string> {
  const today = todayInVienna().slice(0, 7);
  const local = monthOf(new Date());
  return new Set([today, shiftMonth(today, -1), local, shiftMonth(local, -1)]);
}

/** The allow-list: Heute, accounts, Plan of the current month, goals, positions, inbox count. */
export function isPersistedQuery(key: QueryKey): boolean {
  const [root, family, a] = key;
  if (root === 'budget') return key.length === 2 && isMonth(family) && recentMonths().has(family);
  if (root === 'goals') return key.length === 2 && isMonth(family) && recentMonths().has(family);
  if (root !== 'ledger') return false;
  switch (family) {
    case 'heute':
      return key.length === 4 && isMonth(a) && recentMonths().has(a);
    case 'accounts':
    case 'portfolio-positions':
      return key.length === 2;
    case 'liquidity-report':
      return true;
    case 'inbox':
      return key.length === 3 && a === 'count';
    default:
      return false;
  }
}

const hashOf = (key: QueryKey) => JSON.stringify(key);

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'hash' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const result = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(result ? (result.result as T) : undefined);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Sign-out and session loss: drops every persisted answer. */
export async function clearPersistedQueries(): Promise<void> {
  await withStore('readwrite', (store) => store.clear());
}

let restoring = false;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

async function save(client: QueryClient, key: QueryKey): Promise<void> {
  const state = client.getQueryState(key);
  if (state?.status !== 'success' || state.data === undefined) return;
  const epoch = await snapshotEpoch();
  if (!epoch) return;
  // Re-read after the await: a sign-out in between must not write.
  if (!(await snapshotEpoch())) return;
  const entry: Entry = {
    hash: hashOf(key),
    key,
    epoch,
    buster: BUSTER,
    updatedAt: state.dataUpdatedAt,
    data: state.data,
  };
  await withStore('readwrite', (store) => store.put(entry));
}

/**
 * Puts the persisted answers back into the cache (bounded by a short timeout so a blocked
 * IndexedDB never delays the first paint) and starts saving new successful reads.
 */
export async function startQueryPersistence(client: QueryClient): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    restore(client).catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, RESTORE_TIMEOUT_MS);
    }),
  ]);
  clearTimeout(timer);
  client.getQueryCache().subscribe((event) => {
    if (restoring || event.type !== 'updated' || event.action.type !== 'success') return;
    const key = event.query.queryKey;
    if (!isPersistedQuery(key)) return;
    const hash = hashOf(key);
    clearTimeout(timers.get(hash));
    timers.set(
      hash,
      setTimeout(() => {
        timers.delete(hash);
        void save(client, key).catch(() => undefined);
      }, SAVE_DELAY_MS),
    );
  });
}

async function restore(client: QueryClient): Promise<void> {
  const epoch = await snapshotEpoch();
  if (!epoch) return;
  const rows = (await withStore<Entry[]>('readonly', (store) => store.getAll())) ?? [];
  const now = Date.now();
  const drop: string[] = [];
  restoring = true;
  try {
    for (const row of rows) {
      const usable =
        row.epoch === epoch &&
        row.buster === BUSTER &&
        now - row.updatedAt < MAX_AGE_MS &&
        isPersistedQuery(row.key);
      if (!usable) drop.push(row.hash);
      else if (!client.getQueryData(row.key))
        client.setQueryData(row.key, row.data, { updatedAt: row.updatedAt });
    }
  } finally {
    restoring = false;
  }
  if (drop.length)
    await withStore('readwrite', (store) => {
      for (const hash of drop) store.delete(hash);
    });
}
