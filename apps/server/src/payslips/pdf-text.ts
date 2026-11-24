import { PDF_TIME_LIMIT_MS } from '../pdf-time-limit';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';

export async function extractPdfText(
  bytes: Buffer,
  password: string | undefined,
): Promise<{ text?: string; error?: string }> {
  const built = resolve(import.meta.dirname, 'pdf-thread.js');
  const path = existsSync(built) ? built : resolve(import.meta.dirname, 'pdf-thread.mjs');
  return new Promise((done) => {
    const worker = new Worker(path, {
      workerData: { bytes, password },
      // This worker loads JavaScript directly. Keep parent TypeScript hooks out of its heap.
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 128 },
      stdout: true,
      stderr: true,
    });
    // Library diagnostics may include document content. Never forward them to application logs.
    worker.stdout?.resume();
    worker.stderr?.resume();
    let finished = false;
    const finish = (result: { text?: string; error?: string }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      void worker.terminate();
      done(result);
    };
    const timer = setTimeout(() => finish({ error: 'limit' }), PDF_TIME_LIMIT_MS);
    worker.once('message', finish);
    worker.once('error', () => finish({ error: 'pdf' }));
    worker.once('exit', () => finish({ error: 'pdf' }));
  });
}
