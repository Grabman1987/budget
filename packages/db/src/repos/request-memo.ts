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
 *    commits, so the entries of an executor are dropped as soon as either one moves.
 *  - A rollback restores the old state but not the counter, so an entry computed inside a
 *    transaction must never be served after it. Entries are therefore kept per executor: a
 *    transaction handle (or savepoint) has its own entries that die with it, and the plain
 *    database handle is not memoised while a transaction is open on its connection.
 *  - Stored values are cloned in and out, so a caller that edits a result cannot change what the
 *    next caller receives.
 */
interface Entries {
  stamp: string;
  values: Map<string, unknown>;
}
interface Memo {
  byExecutor: WeakMap<object, Entries>;
}

const storage = new AsyncLocalStorage<Memo>();

export function runWithRequestMemo<T>(fn: () => T): T {
  return storage.run({ byExecutor: new WeakMap() }, fn);
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
  const memo = storage.getStore();
  const connection = connectionOf(db);
  if (!memo || !connection || (!isTransaction(db) && connection.inTransaction)) return compute();
  const stamp = databaseStamp(db);
  let entries = memo.byExecutor.get(db);
  if (!entries || entries.stamp !== stamp) {
    entries = { stamp, values: new Map() };
    memo.byExecutor.set(db, entries);
  }
  if (entries.values.has(key)) {
    const stored = entries.values.get(key);
    return (clone ? structuredClone(stored) : stored) as T;
  }
  const value = compute();
  // `compute` only reads; if it wrote anyway the stamp has moved and nothing may be stored.
  if (databaseStamp(db) === stamp) entries.values.set(key, clone ? structuredClone(value) : value);
  return value;
}
