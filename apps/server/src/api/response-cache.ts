import { databaseStamp, type Db } from '@budget/db';
import type { MiddlewareHandler } from 'hono';

/**
 * Read models that are a pure function of the database, the day and the query string. Everything
 * else (search, inbox, receipts, exports, bank sync, import jobs, market runs) is never cached.
 */
const CACHEABLE =
  /^\/(heute|portfolio|reports|overview|report-tables|networth-history|assets-debts-history|wealth|cashflow|budget|rules|inflation-basket|liquidity|accounts\/series|goals\/report|projects\/report)(\/|$)/;

const MAX_ENTRY_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
/** Safety net for anything that depends on the wall clock beyond the day. */
const MAX_AGE_MS = 30 * 60_000;

interface Entry {
  body: string;
  contentType: string;
  stamp: string;
  storedAt: number;
}

/**
 * Answers a repeated GET of an expensive read model from memory while nothing was written.
 *
 * The first request computes and stores the answer; the next ones are served as long as the
 * database stamp (`databaseStamp`: rows written by this connection, commits of other connections)
 * and "today" are the same. Any write, also one of the import worker or the bank-sync process,
 * moves the stamp, so a stale answer can never be served after a change. An answer is only stored
 * when the handler itself wrote nothing. The Map's insertion order is the LRU order.
 */
export function readModelCache(
  db: Db,
  today: () => string,
  now = () => Date.now(),
): MiddlewareHandler {
  const entries = new Map<string, Entry>();
  let total = 0;
  const drop = (key: string) => {
    const old = entries.get(key);
    if (!old) return;
    total -= old.body.length;
    entries.delete(key);
  };
  return async (c, next) => {
    if (c.req.method !== 'GET' || !CACHEABLE.test(c.req.path.replace(/^\/api/, ''))) return next();
    // Path and query only: the in-process warm-up (`api/warm.ts`) asks without host and `/api`.
    const url = new URL(c.req.url);
    const key = `${today()}|${url.pathname.replace(/^\/api(?=\/)/, '')}${url.search}`;
    const stamp = databaseStamp(db);
    const hit = entries.get(key);
    if (hit && hit.stamp === stamp && now() - hit.storedAt < MAX_AGE_MS) {
      entries.delete(key);
      entries.set(key, hit);
      return new Response(hit.body, { status: 200, headers: { 'content-type': hit.contentType } });
    }
    drop(key);
    await next();
    const type = c.res.headers.get('content-type') ?? '';
    if (c.res.status !== 200 || !type.includes('application/json')) return;
    const body = await c.res.clone().text();
    if (body.length > MAX_ENTRY_BYTES || databaseStamp(db) !== stamp) return;
    entries.set(key, { body, contentType: type, stamp, storedAt: now() });
    total += body.length;
    for (const oldest of entries.keys()) {
      if (total <= MAX_TOTAL_BYTES) break;
      drop(oldest);
    }
  };
}
