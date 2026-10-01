import { openDatabase } from '@budget/db';
import { parentPort, workerData } from 'node:worker_threads';
import { errorAnswer } from '../api/http';
import type { WorkerInput, WorkerMessage } from './jobs';
import { runTask } from './tasks';

/**
 * Entry of the import worker thread (`jobs.ts`): opens its own connection to the database file
 * with the app's settings (WAL, foreign keys, busy timeout), runs one task and reports back. The
 * connection is closed before the thread ends, so the main thread may write again afterwards.
 */
const input = workerData as WorkerInput;
const send = (message: WorkerMessage) => parentPort?.postMessage(message);
const { db, close } = openDatabase(input.path);
try {
  const answer = runTask(db, input.task, {
    today: input.today,
    progress: (step) => send({ type: 'step', step }),
    ...(input.holdMs > 0
      ? {
          beforeCommit: () =>
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, input.holdMs),
        }
      : {}),
  });
  send({ type: 'done', answer });
} catch (error) {
  send({ type: 'failed', error: errorAnswer(error) });
} finally {
  close();
}
