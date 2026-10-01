import { sqliteOf, type Db } from './client';

/**
 * Writes of this process's connection are held back while another connection to the same file
 * owns the write lock for a long transaction (an import task in a worker thread). SQLite allows
 * one writer: a write on the main connection would wait for the lock synchronously (up to the busy
 * timeout) and stall the event loop. So while writes are held:
 *
 * - callers check `writesHeld` and refuse (the API answers 409) or skip best-effort writes;
 * - the busy timeout of the main connection is 0, so a write that slips through fails at once
 *   instead of blocking.
 *
 * Reads are not affected (WAL: readers see the last committed state).
 */
const held = new WeakMap<object, number>();

export function holdWrites(db: Db): void {
  if (held.has(db)) throw new Error('Writes are already held');
  const client = sqliteOf(db);
  held.set(db, client.pragma('busy_timeout', { simple: true }) as number);
  client.pragma('busy_timeout = 0');
}

export function releaseWrites(db: Db): void {
  const previous = held.get(db);
  if (previous === undefined) return;
  held.delete(db);
  const client = sqliteOf(db);
  if (client.open) client.pragma(`busy_timeout = ${previous}`);
}

export const writesHeld = (db: object): boolean => held.has(db);
