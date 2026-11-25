import { ledgerVersion, type Db } from '@budget/db';
import type { MiddlewareHandler } from 'hono';

/**
 * Read models that are a pure function of the database, the day and the query string. Everything
 * else (search, inbox list and details, receipts, exports, bank sync, import jobs, market runs)
 * is never cached.
 */
const CACHEABLE =
  /^\/(heute|portfolio|reports|overview|report-tables|networth-history|assets-debts-history|wealth|cashflow|budget|rules|inflation-basket|liquidity|accounts\/series|goals\/report|projects\/report)(\/|$)/;

/**
 * The account list and inbox badge also qualify: both derive from the database and the day,
 * and can replay the audit log for account review tasks (#956).
 */
const CACHEABLE_EXACT =
  /^\/(accounts|inbox\/count|goals|expected|expected\/(year-preview|occurrences|income|register-next))$/;

/**
 * Budget answers that carry a basis bound to the serving connection (`previewBasis`, the cursors of
 * the uncategorized and activity lists: `databaseStamp` plus a per-process epoch) are not replayed: the basis
 * moves with writes the ledger version ignores, so a replay could hand out a basis that no longer
 * matches. The same set is never offloaded (`read-model-offload.ts`).
 */
export const connectionBound = (route: string, search: string): boolean =>
  /^\/budget\/[^/]+\/(uncategorized|activity)(\/|$)/.test(route) ||
  new URLSearchParams(search).get('previewBasis') === '1';

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
 * ledger version (`ledgerVersion`: a counter that triggers bump on every write to a table a read
 * model can read) and "today" are the same. Any ledger write, also one of the import worker or the
 * bank-sync process, moves it, so a stale answer can never be served after a change; writes to
 * sessions, the audit log or market run logs do not. An answer is only stored
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
    if (connectionBound(route, url.search)) return next();
    const key = `${today()}|${url.pathname.replace(/^\/api(?=\/)/, '')}${url.search}`;
    let stamp = ledgerVersion(db);
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
      if (shared && shared.stamp === stamp && ledgerVersion(db) === stamp) return replay(shared);
      // Something was written meanwhile: compute for the state as it is now.
      stamp = ledgerVersion(db);
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
      if (body.length > MAX_ENTRY_BYTES || ledgerVersion(db) !== stamp) return;
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
