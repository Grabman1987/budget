import type { RunResult } from 'better-sqlite3';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from '../schema';

/**
 * Anything the repositories can run on: the database (`Db`) or a transaction handle. Repository
 * functions open their own (nested) transaction, so callers may compose them inside their own.
 */
export type Executor = BaseSQLiteDatabase<'sync', RunResult, typeof schema>;

/** Run `fn` in a transaction (a savepoint when `db` already is a transaction). */
export function runInTransaction<T>(db: Executor, fn: (tx: Executor) => T): T {
  return db.transaction(fn);
}
