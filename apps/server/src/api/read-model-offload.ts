import type { MiddlewareHandler } from 'hono';
import { Worker } from 'node:worker_threads';
import { connectionBound } from './response-cache';

/**
 * Read models computed in the worker: the expensive Heute page model (#956), and the budget month
 * views, liquidity forecast, account list and series and inbox badge that otherwise queue the
 * server thread. Only pure GETs: the worker's connection cannot write, and a 5xx answer (for
 * instance a handler that wrote after all) falls back to the server thread.
 */
const OFFLOADED =
  /^\/(heute(\/|$)|liquidity(\/|$)|accounts(\/series)?$|inbox\/count$|budget\/(\d{4}-\d{2}|months)$)/;

/** Idle time after which the worker ends and drops its caches; `BUDGET_READ_WORKER_IDLE_MIN`. */
export const workerIdleMs = (env: NodeJS.ProcessEnv = process.env): number => {
  const minutes = Number(env['BUDGET_READ_WORKER_IDLE_MIN']);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 45) * 60_000;
};

export interface ReadModelWorkerInput {
  path: string;
}
export interface ReadModelAsk {
  id: number;
  /** Path and query below the ledger API (`/heute?period=month`). */
  path: string;
  today: string;
}
export type ReadModelAnswer =
  { id: number; status: number; contentType: string; body: string } | { id: number; failed: true };

export interface ReadModelOffload {
  /** Middleware: answers an offloaded GET from the worker; anything else (or a failure) runs here. */
  middleware: MiddlewareHandler;
  /** Paths of offloaded read models asked for since `since` (ms), for the background refresh. */
  recent: (since: number) => string[];
  /** Answers the worker gave (not counting failures that fell back to the server thread). */
  served: () => number;
  close: () => Promise<void>;
}

const workerUrl = (): URL =>
  // From source (tsx, vitest) the worker is the TypeScript file next to this one; in the esbuild
  // bundle it is `read-model-worker.js` next to the server bundle.
  import.meta.url.endsWith('.ts')
    ? new URL('./read-model-worker.ts', import.meta.url)
    : new URL('./read-model-worker.js', import.meta.url);

/**
 * Computes the Heute read model in a worker thread with its own read-only connection (#956).
 * All handlers are synchronous; computed on the server thread, a cold Heute held every other
 * request (session status, profile, positions) for seconds. The answer is the same ledger API's
 * answer, read in one snapshot; the read-model cache in front of this middleware still decides
 * whether it may be kept (database stamp unchanged across the computation).
 *
 * The worker starts on first use and is restarted after a crash; if it fails, the request is
 * computed on the server thread as before. Needs a database file (not `:memory:`).
 */
export function readModelOffload(
  databasePath: string,
  today: () => string,
  { workerHeapMb = 192, idleMs = workerIdleMs(), now = () => Date.now() } = {},
): ReadModelOffload {
  let worker: Worker | undefined;
  let next = 0;
  let served = 0;
  const pending = new Map<number, (answer: ReadModelAnswer) => void>();
  const asked = new Map<string, number>();
  // The worker holds about 80 MB (own heap, module graph, page cache) of a 512 MB machine: it ends
  // after a quiet spell and starts again on the next ask.
  let idle: NodeJS.Timeout | undefined;
  const rest = () => {
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (pending.size > 0 || !worker) return;
      const running = worker;
      worker = undefined;
      void running.terminate();
    }, idleMs);
    idle.unref();
  };
  const failAll = () => {
    for (const [id, done] of pending) done({ id, failed: true });
    pending.clear();
  };
  const start = (): Worker => {
    if (worker) return worker;
    const created = new Worker(workerUrl(), {
      workerData: { path: databasePath } satisfies ReadModelWorkerInput,
      // From source, the worker needs the TypeScript loader of the parent.
      ...(import.meta.url.endsWith('.ts') ? { execArgv: ['--import', 'tsx'] } : {}),
      resourceLimits: { maxOldGenerationSizeMb: workerHeapMb },
    });
    created.unref();
    created.on('message', (answer: ReadModelAnswer) => {
      const done = pending.get(answer.id);
      pending.delete(answer.id);
      done?.(answer);
      if (pending.size === 0) rest();
    });
    // A crash of the current worker fails its asks (they fall back to the server thread); a worker
    // retired for idleness or by `close` had none left.
    const gone = () => {
      if (worker !== created) return;
      worker = undefined;
      failAll();
    };
    created.on('error', gone);
    created.on('exit', gone);
    worker = created;
    return created;
  };
  const ask = (path: string, day: string) =>
    new Promise<ReadModelAnswer>((resolve) => {
      const id = ++next;
      pending.set(id, resolve);
      try {
        start().postMessage({ id, path, today: day } satisfies ReadModelAsk);
      } catch {
        pending.delete(id);
        resolve({ id, failed: true });
      }
    });

  return {
    middleware: async (c, next) => {
      const route = c.req.path.replace(/^\/api/, '');
      if (c.req.method !== 'GET' || !OFFLOADED.test(route)) return next();
      const url = new URL(c.req.url);
      if (connectionBound(route, url.search)) return next();
      const path = `${route}${url.search}`;
      asked.delete(path);
      asked.set(path, now());
      while (asked.size > 24) asked.delete(asked.keys().next().value!);
      const answer = await ask(path, today());
      if ('failed' in answer) return next();
      served++;
      return new Response(answer.body, {
        status: answer.status,
        headers: { 'content-type': answer.contentType, 'cache-control': 'no-store' },
      });
    },
    served: () => served,
    recent: (since) => [...asked].filter(([, at]) => at >= since).map(([path]) => path),
    close: async () => {
      clearTimeout(idle);
      const running = worker;
      worker = undefined;
      failAll();
      await running?.terminate();
    },
  };
}

/**
 * Keeps the offloaded read models a visitor used recently, plus the pages every visit opens
 * (`always`), computed for the current ledger version, so the next visit after a change is
 * answered from the cache. Only ledger writes move the version (the Litestream commit, session
 * touches and logs do not); the models are recomputed in the worker once it has been quiet for one
 * check, at most once per version and day. The worker answers one request at a time and this loop
 * asks for one path at a time, so a visitor's request waits for at most one of them.
 */
export function startReadModelRefresh(
  api: { request: (path: string) => Response | Promise<Response> },
  stampOf: () => string,
  offload: ReadModelOffload,
  {
    everyMs = 5_000,
    activeMs = 30 * 60_000,
    now = () => Date.now(),
    always = () => [] as string[],
  } = {},
): () => void {
  let seen = stampOf();
  let refreshed = seen;
  let running = false;
  const tick = async () => {
    if (running) return;
    const stamp = stampOf();
    if (stamp !== seen) {
      seen = stamp;
      return;
    }
    if (stamp === refreshed) return;
    const paths = [...new Set([...offload.recent(now() - activeMs), ...always()])];
    if (paths.length === 0) return;
    running = true;
    refreshed = stamp;
    try {
      for (const path of paths) {
        await (await api.request(path)).arrayBuffer();
        // Let ready HTTP I/O run between two models.
        await new Promise<void>((done) => setImmediate(done));
      }
    } catch {
      // The next visit computes it and reports any failure.
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
