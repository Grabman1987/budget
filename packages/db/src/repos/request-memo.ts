import { AsyncLocalStorage } from 'node:async_hooks';
import type Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import type { Executor } from './types';

/**
 * Per-request memo for expensive read models (a valuation of one day is read by several callers of
 * the same request: the rule inputs, the Finanz-Check, Heute). Outside `runWithRequestMemo`
 * (scripts, tests) nothing is memoised.
 *
 * Safety: an entry never outlives a change of the database.
 *  - SQLite's `total_changes()` counts every row this connection writes (also in a transaction that
 *    is rolled back later, and it never goes down) and `data_version` moves when another connection
 *    commits, so the connection's entries are dropped as soon as either one moves.
 *  - A rollback restores the old state but not the counter, so transaction reads are never stored.
 *    The plain database handle is not memoised while a transaction is open on its connection.
 *  - A transaction may still read what the plain handle stored, as long as the stamp is the same:
 *    nothing was written since, so the transaction sees the state those entries were computed on
 *    (read-only transactions of one request share the budget ledger instead of reading it again).
 *  - `memoized` stores values cloned in and out, so a caller that edits a result cannot change what the
 *    next caller receives.
 */
interface Entries {
  stamp: string;
  values: Map<string, unknown>;
}
interface Memo {
  /** Entries of the plain database handle, per connection: the committed state. */
  byConnection: WeakMap<object, Entries>;
}

const storage = new AsyncLocalStorage<Memo>();

export function runWithRequestMemo<T>(fn: () => T): T {
  return storage.run({ byConnection: new WeakMap() }, fn);
}

interface ReadSnapshotMemo {
  active: boolean;
  connection: Database.Database;
  stamp: string;
  values: Map<string, unknown>;
}
const readSnapshots = new AsyncLocalStorage<ReadSnapshotMemo>();

/**
 * Explicit synchronous read-transaction scope only. Ordinary transaction memo policy below is
 * unchanged; entries here cannot survive the callback, a connection change or any database write.
 */
export function withReadSnapshotMemo<T>(db: Executor, read: () => T): T {
  const connection = connectionOf(db);
  if (!connection || !isTransaction(db) || !connection.inTransaction)
    throw new Error('A read snapshot requires an active transaction');
  const stamp = databaseStamp(db);
  const snapshot: ReadSnapshotMemo = { active: true, connection, stamp, values: new Map() };
  return readSnapshots.run(snapshot, () => {
    try {
      const value = read();
      if (value !== null && (typeof value === 'object' || typeof value === 'function') && 'then' in value)
        throw new Error('A read snapshot must be synchronous');
      if (databaseStamp(db) !== stamp)
        throw new Error('The database changed during the read snapshot');
      return value;
    } finally {
      snapshot.active = false;
      snapshot.values.clear();
    }
  });
}

/** The connection under a database or transaction handle (`session.client` on both). */
const connectionOf = (db: Executor): Database.Database | undefined =>
  (db as unknown as { session?: { client?: Database.Database } }).session?.client;

const isTransaction = (db: Executor): boolean =>
  typeof (db as unknown as { rollback?: unknown }).rollback === 'function';

/** Changes whenever this connection or another one writes (see the safety notes above). */
export function databaseStamp(db: Executor): string {
  const row = db.get<{ changes: number; version: number }>(
    sql`select total_changes() as changes, (select data_version from pragma_data_version) as version`,
  );
  return `${row.changes}:${row.version}`;
}

/** `compute()` once per key and database state within the current request. */
export function memoized<T>(db: Executor, key: string, compute: () => T): T {
  return memoizedEntry(db, key, compute, true);
}

/**
 * Like `memoized`, but every caller receives the stored object itself: no copy of large row sets.
 * Only for read models whose callers never change what they get (they filter, map and sum).
 */
export function memoizedShared<T>(db: Executor, key: string, compute: () => T): T {
  return memoizedEntry(db, key, compute, false);
}

function memoizedEntry<T>(db: Executor, key: string, compute: () => T, clone: boolean): T {
  const connection = connectionOf(db);
  const snapshot = readSnapshots.getStore();
  if (snapshot?.active && connection && connection === snapshot.connection && connection.inTransaction) {
    const stamp = databaseStamp(db);
    if (snapshot.stamp !== stamp) {
      snapshot.stamp = stamp;
      snapshot.values.clear();
    }
    if (snapshot.values.has(key)) {
      const value = snapshot.values.get(key);
      return (clone ? structuredClone(value) : value) as T;
    }
    const value = compute();
    if (databaseStamp(db) === stamp) snapshot.values.set(key, clone ? structuredClone(value) : value);
    return value;
  }
  const memo = storage.getStore();
  if (!memo || !connection || (!isTransaction(db) && connection.inTransaction)) return compute();
  const stamp = databaseStamp(db);
  const transaction = isTransaction(db);
  if (transaction) {
    const committed = memo.byConnection.get(connection);
    if (committed?.stamp === stamp && committed.values.has(key)) {
      const stored = committed.values.get(key);
      return (clone ? structuredClone(stored) : stored) as T;
    }
    return compute();
  }
  let entries = memo.byConnection.get(connection);
  if (!entries || entries.stamp !== stamp) {
    entries = { stamp, values: new Map() };
    memo.byConnection.set(connection, entries);
  }
  const source = entries.values.has(key) ? entries : undefined;
  if (source) {
    const stored = source.values.get(key);
    return (clone ? structuredClone(stored) : stored) as T;
  }
  const value = compute();
  // `compute` only reads; if it wrote anyway the stamp has moved and nothing may be stored.
  if (databaseStamp(db) === stamp) entries.values.set(key, clone ? structuredClone(value) : value);
  return value;
}
