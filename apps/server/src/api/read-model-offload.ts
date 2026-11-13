import type { MiddlewareHandler } from 'hono';
import { Worker } from 'node:worker_threads';

/** Read models computed in the worker: the expensive Heute page model (#956). */
const OFFLOADED = /^\/heute(\/|$)/;

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
  { workerHeapMb = 192, idleMs = 5 * 60_000, now = () => Date.now() } = {},
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
      const path = `${route}${url.search}`;
      asked.delete(path);
      asked.set(path, now());
      while (asked.size > 8) asked.delete(asked.keys().next().value!);
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
 * Keeps the offloaded read models a visitor used recently computed for the current database
 * stamp, so the next visit after a change is answered from the cache. Every write moves the stamp,
 * and so does Litestream's own commit about a minute after it (#956); the model is recomputed in
 * the worker once the stamp has been quiet for one check, at most once per stamp.
 */
export function startReadModelRefresh(
  api: { request: (path: string) => Response | Promise<Response> },
  stampOf: () => string,
  offload: ReadModelOffload,
  { everyMs = 5_000, activeMs = 30 * 60_000, now = () => Date.now() } = {},
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
    const paths = offload.recent(now() - activeMs);
    if (paths.length === 0) return;
    running = true;
    refreshed = stamp;
    try {
      for (const path of paths) await (await api.request(path)).arrayBuffer();
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
