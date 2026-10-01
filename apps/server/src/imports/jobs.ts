import { holdWrites, releaseWrites, sqliteOf, type Db } from '@budget/db';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { ApiError, errorAnswer, type ErrorAnswer } from '../api/http';
import {
  runTask,
  type ImportTask,
  type ImportTaskKind,
  type TaskAnswer,
  type TaskStep,
} from './tasks';

/**
 * Import tasks (`tasks.ts`) run one at a time, in a worker thread with its own connection to the
 * database file, so the event loop of the server (health check, every other request) stays free
 * while an export of thousands of bookings is written in one transaction.
 *
 * - One task at a time: a second one is refused with 409 `import_running`.
 * - Single writer: while a task runs, the main connection holds back its writes (`holdWrites`):
 *   the API refuses writes with 409 `import_running`, best-effort writes (session touch, event
 *   counters, backups) wait for the next round. Reads go on (WAL).
 * - All or nothing: the task is one SQLite transaction in the worker. A failure rolls it back; a
 *   killed process or worker leaves an uncommitted transaction that SQLite discards.
 *
 * An in-memory database (tests) cannot be shared with a thread: there the task runs inline after
 * the current turn of the event loop, with the same job lifecycle.
 */

export type JobState = 'running' | 'done' | 'failed';

export interface JobView {
  id: string;
  kind: ImportTaskKind;
  runId: string | null;
  state: JobState;
  step: TaskStep | null;
  startedAt: string;
  finishedAt: string | null;
  /** HTTP status and body of the finished task (also of a failed one). */
  result: TaskAnswer | ErrorAnswer | null;
}

/** Messages of the worker thread (`import-worker.ts`). */
export type WorkerMessage =
  | { type: 'step'; step: TaskStep }
  | { type: 'done'; answer: TaskAnswer }
  | { type: 'failed'; error: ErrorAnswer };

export interface WorkerInput {
  path: string;
  task: ImportTask;
  today: string;
  /** Test aid: hold the task this long before its transaction commits. */
  holdMs: number;
}

export interface ImportJobsOptions {
  /** `worker` needs a database file; default: `worker` for files, `inline` for `:memory:`. */
  mode?: 'worker' | 'inline';
  /**
   * Old-space limit of the worker thread in MB (default 160; an export of several thousand bookings
   * needs less than 64). The VM has 512 MB for everything: a runaway task fails alone (500) instead of
   * taking the server down.
   */
  workerHeapMb?: number;
  /** Test aid: hold every task this long right before its transaction commits. */
  holdMs?: number;
}

/** Finished jobs kept for polling. */
const KEEP = 10;

const workerUrl = (): URL =>
  // From source (tsx, vitest) the worker is the TypeScript file next to this one; in the esbuild
  // bundle it is `import-worker.js` next to the server bundle.
  import.meta.url.endsWith('.ts')
    ? new URL('./import-worker.ts', import.meta.url)
    : new URL('./import-worker.js', import.meta.url);

interface Job extends JobView {
  done: Promise<void>;
  worker?: Worker | undefined;
}

export class ImportJobs {
  private readonly jobs = new Map<string, Job>();
  private current: Job | undefined;
  private readonly mode: 'worker' | 'inline';
  private readonly path: string;

  constructor(
    private readonly db: Db,
    private readonly options: ImportJobsOptions = {},
  ) {
    const client = sqliteOf(db);
    this.path = client.name;
    this.mode = options.mode ?? (client.memory || client.name === '' ? 'inline' : 'worker');
    if (this.mode === 'worker' && client.memory)
      throw new Error('Import tasks in a worker need a database file');
  }

  /** The running job, if any. */
  get active(): JobView | undefined {
    return this.current && this.public(this.current);
  }

  get(id: string): JobView | undefined {
    const job = this.jobs.get(id);
    return job && this.public(job);
  }

  /** Start a task; refused with 409 while another one runs. */
  start(task: ImportTask, today: string): JobView {
    if (this.current)
      throw new ApiError(409, 'import_running', 'Another import task is running; try again later', {
        job: this.public(this.current),
      });
    const job: Job = {
      id: randomUUID(),
      kind: task.kind,
      runId: 'runId' in task ? task.runId : null,
      state: 'running',
      step: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      done: Promise.resolve(),
    };
    holdWrites(this.db);
    this.current = job;
    this.jobs.set(job.id, job);
    // Through `then`: a worker that cannot even start fails the job instead of keeping the lock.
    job.done = Promise.resolve()
      .then(() =>
        this.mode === 'worker' ? this.inWorker(job, task, today) : this.inline(job, task, today),
      )
      .catch((error: unknown) => {
        job.result = errorAnswer(error);
      })
      .finally(() => {
        job.state = job.result && job.result.status < 400 ? 'done' : 'failed';
        job.finishedAt = new Date().toISOString();
        job.worker = undefined;
        this.current = undefined;
        releaseWrites(this.db);
        this.prune();
      });
    return this.public(job);
  }

  /** Start a task and wait for it (calls that answer within the request). */
  async run(task: ImportTask, today: string): Promise<TaskAnswer | ErrorAnswer> {
    const job = this.jobs.get(this.start(task, today).id) as Job;
    await job.done;
    return job.result as TaskAnswer | ErrorAnswer;
  }

  /** Wait for the running job (shutdown, tests). */
  async idle(): Promise<void> {
    await this.current?.done;
  }

  /** Stop the running worker (its transaction is discarded) and wait for it to end. */
  async terminate(): Promise<void> {
    await this.current?.worker?.terminate();
    await this.idle();
  }

  private inline(job: Job, task: ImportTask, today: string): Promise<void> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          const hold = this.options.holdMs;
          job.result = runTask(this.db, task, {
            today,
            progress: (step) => (job.step = step),
            ...(hold ? { beforeCommit: () => sleepSync(hold) } : {}),
          });
          resolve();
        } catch (error) {
          reject(error as Error);
        }
      });
    });
  }

  private inWorker(job: Job, task: ImportTask, today: string): Promise<void> {
    const url = workerUrl();
    const input: WorkerInput = { path: this.path, task, today, holdMs: this.options.holdMs ?? 0 };
    const worker = new Worker(url, {
      workerData: input,
      // From source the worker needs the TypeScript loader; the bundle runs as is.
      ...(url.pathname.endsWith('.ts') ? { execArgv: ['--import', 'tsx'] } : {}),
      resourceLimits: { maxOldGenerationSizeMb: this.options.workerHeapMb ?? 160 },
      stdout: false,
      stderr: false,
    });
    job.worker = worker;
    return new Promise((resolve, reject) => {
      worker.on('message', (message: WorkerMessage) => {
        if (message.type === 'step') job.step = message.step;
        else job.result = message.type === 'done' ? message.answer : message.error;
      });
      worker.on('error', (error) => {
        console.error(`Import task ${task.kind} failed in its worker: ${error.name}`);
        job.result = errorAnswer(error);
      });
      // Resolved only when the thread is gone: its connection (and write lock) is closed then.
      worker.on('exit', (code) => {
        if (job.result) resolve();
        else reject(new Error(`Import worker exited with code ${code}`));
      });
    });
  }

  private public(job: Job): JobView {
    const { id, kind, runId, state, step, startedAt, finishedAt, result } = job;
    return { id, kind, runId, state, step, startedAt, finishedAt, result };
  }

  private prune(): void {
    const finished = [...this.jobs.values()].filter((j) => j.state !== 'running');
    for (const j of finished.slice(0, Math.max(0, finished.length - KEEP))) this.jobs.delete(j.id);
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
