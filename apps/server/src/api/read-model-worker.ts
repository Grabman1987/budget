import { openDatabase, runInReadSnapshot } from '@budget/db';
import { parentPort, workerData } from 'node:worker_threads';
import { createLedgerApi } from './index';
import type { ReadModelAnswer, ReadModelAsk, ReadModelWorkerInput } from './read-model-offload';

/**
 * Entry of the read-model worker thread (`read-model-offload.ts`). It serves the same ledger API
 * as the server, on its own read-only connection to the database file, so an expensive read model
 * (Heute) is computed off the server's event loop. Requests are answered one at a time, each in
 * one read transaction: every read of a request sees the same committed state, also while the
 * server writes. Nothing here can write (`query_only`).
 */
const input = workerData as ReadModelWorkerInput;
const { db, sqlite } = openDatabase(input.path);
sqlite.pragma('query_only = ON');
let today = '';
const api = createLedgerApi({
  db,
  today: () => today,
  bankSync: null,
  // Only GETs of pure read models arrive here; no write route is ever reached.
  stepUp: async (c) => c.json({ error: 'not_available' }, 403),
  cache: false,
});

let queue: Promise<void> = Promise.resolve();
parentPort?.on('message', (ask: ReadModelAsk) => {
  queue = queue.then(async () => {
    let answer: ReadModelAnswer;
    try {
      today = ask.today;
      answer = await runInReadSnapshot(db, async () => {
        const response = await api.request(ask.path);
        return {
          id: ask.id,
          status: response.status,
          contentType: response.headers.get('content-type') ?? '',
          body: await response.text(),
        };
      });
    } catch {
      answer = { id: ask.id, failed: true };
    }
    parentPort?.postMessage(answer);
  });
});
