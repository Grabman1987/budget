import { databaseStamp, type Db } from '@budget/db';
import type { MiddlewareHandler } from 'hono';

/**
 * Read models that are a pure function of the database, the day and the query string. Everything
 * else (search, inbox, receipts, exports, bank sync, import jobs, market runs) is never cached.
 */
const CACHEABLE =
  /^\/(heute|portfolio|reports|overview|report-tables|networth-history|assets-debts-history|wealth|cashflow|budget|rules|inflation-basket|liquidity|accounts\/series|goals\/report|projects\/report)(\/|$)/;

/**
 * The account list also qualifies: it derives only from the database and the day, and replays the
 * audit log (`accountReviewChronology`), the dominant cost on a real ledger (#956). The inbox badge
 * stays uncached by design (see response-cache.test.ts).
 */
const CACHEABLE_EXACT = /^\/accounts$/;

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
 *
 * Requests for the same key and stamp that arrive while the first one still computes (the Heute
 * model runs in a worker, `read-model-offload.ts`) wait for it and answer with its stored body
 * instead of computing the same model again.
 */
export function readModelCache(
  db: Db,
  today: () => string,
  now = () => Date.now(),
): MiddlewareHandler {
  const entries = new Map<string, Entry>();
  const computing = new Map<string, { stamp: string; done: Promise<Entry | undefined> }>();
  let total = 0;
  const drop = (key: string) => {
    const old = entries.get(key);
    if (!old) return;
    total -= old.body.length;
    entries.delete(key);
  };
  return async (c, next) => {
    const route = c.req.path.replace(/^\/api/, '');
    if (c.req.method !== 'GET' || !(CACHEABLE.test(route) || CACHEABLE_EXACT.test(route)))
      return next();
    // Path and query only: the in-process warm-up (`api/warm.ts`) asks without host and `/api`.
    const url = new URL(c.req.url);
    const key = `${today()}|${url.pathname.replace(/^\/api(?=\/)/, '')}${url.search}`;
    let stamp = databaseStamp(db);
    // A replayed body is still a private API response: never let a browser or proxy store it.
    const replay = (entry: Entry) =>
      new Response(entry.body, {
        status: 200,
        headers: { 'content-type': entry.contentType, 'cache-control': 'no-store' },
      });
    const hit = entries.get(key);
    if (hit && hit.stamp === stamp && now() - hit.storedAt < MAX_AGE_MS) {
      entries.delete(key);
      entries.set(key, hit);
      return replay(hit);
    }
    const running = computing.get(key);
    if (running?.stamp === stamp) {
      const shared = await running.done;
      // Only an answer stored for this very stamp; otherwise compute as if alone.
      if (shared && shared.stamp === stamp && databaseStamp(db) === stamp) return replay(shared);
      // Something was written meanwhile: compute for the state as it is now.
      stamp = databaseStamp(db);
    }
    drop(key);
    let finish!: (entry: Entry | undefined) => void;
    const own = { stamp, done: new Promise<Entry | undefined>((done) => (finish = done)) };
    computing.set(key, own);
    let stored: Entry | undefined;
    try {
      await next();
      const type = c.res.headers.get('content-type') ?? '';
      if (c.res.status !== 200 || !type.includes('application/json')) return;
      const body = await c.res.clone().text();
      if (body.length > MAX_ENTRY_BYTES || databaseStamp(db) !== stamp) return;
      stored = { body, contentType: type, stamp, storedAt: now() };
      entries.set(key, stored);
      total += body.length;
      for (const oldest of entries.keys()) {
        if (total <= MAX_TOTAL_BYTES) break;
        drop(oldest);
      }
    } finally {
      if (computing.get(key) === own) computing.delete(key);
      finish(stored);
    }
  };
}
