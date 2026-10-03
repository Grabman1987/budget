/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import {
  auditLog,
  booking,
  importRun,
  migrateDatabase,
  openDatabase,
  writesHeld,
  type Db,
} from '@budget/db';
import { ynabExport, YNAB_FILE_NAMES } from '@budget/fixtures/ynab';
import { readRecords } from '@budget/import-ynab';
import { eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { fork } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AuthGate } from '../app';
import { ImportJobs } from './jobs';
import { stageExport } from './staging';
import { runTask } from './tasks';

/**
 * Lifecycle of import jobs in a real worker thread on a database file (the in-memory tests in
 * `imports.test.ts` run the same tasks inline).
 */

const files = ynabExport(1);
const webDir = mkdtempSync(join(tmpdir(), 'budget-jobs-web-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const gate: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

let path: string;
let db: Db;
let close: () => void;
let jobs: ImportJobs;

beforeEach(() => {
  vi.stubEnv('BUDGET_IMPORT_HTTP', '1');
  path = join(mkdtempSync(join(tmpdir(), 'budget-jobs-')), 'budget.sqlite');
  ({ db, close } = openDatabase(path));
  migrateDatabase(db);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await jobs?.terminate();
  close();
});

const appWith = (j: ImportJobs) =>
  createApp({ webDir, auth: gate, ledger: { db, today: () => '2026-09-29', jobs: j } });

/** Stage the synthetic export directly (the upload task is covered in `imports.test.ts`). */
const stage = (register = files.register) =>
  stageExport(db, {
    fileName: `${YNAB_FILE_NAMES.register}\n${YNAB_FILE_NAMES.plan}`,
    sha256: 'test',
    register: readRecords(register, 'register'),
    plan: readRecords(files.plan, 'plan'),
  });

async function call(app: Hono, method: string, path: string, body?: unknown) {
  const res = await app.request(`/api/imports${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function waitFor(app: Hono, jobId: string, until: (job: any) => boolean) {
  for (;;) {
    const { body } = await call(app, 'GET', `/jobs/${jobId}`);
    if (until(body['job'])) return body['job'];
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const liveBookings = () => db.select().from(booking).where(isNull(booking.deletedAt)).all().length;
const statusOf = (id: string) =>
  db.select().from(importRun).where(eq(importRun.id, id)).get()?.status;

describe('import jobs in a worker thread', () => {
  it('commits in the worker while the server answers; other writes and tasks get 409', async () => {
    jobs = new ImportJobs(db, { holdMs: 300 });
    const app = appWith(jobs);
    const id = stage();
    const started = await call(app, 'POST', `/${id}/commit`, {});
    expect(started.status).toBe(202);
    expect(started.body['job']).toMatchObject({ kind: 'commit', runId: id, state: 'running' });
    expect(writesHeld(db)).toBe(true);

    // Same job again, another task, any other write: refused. Reads go on.
    const again = await call(app, 'POST', `/${id}/commit`, {});
    expect([again.status, again.body['error']]).toEqual([409, 'import_running']);
    expect((await call(app, 'POST', `/${id}/dry-run`)).status).toBe(409);
    const put = await call(app, 'PUT', `/${id}/mapping`, {});
    expect([put.status, put.body['error']]).toEqual([409, 'import_running']);
    expect((await call(app, 'GET', '')).status).toBe(200);

    const job = await waitFor(app, started.body['job'].id, (j) => j.state !== 'running');
    expect(job.state).toBe('done');
    expect(job.result.status).toBe(200);
    expect(job.result.body.run.status).toBe('committed');
    expect(job.result.body.ledger).toEqual([]);
    expect(liveBookings()).toBe(job.result.body.change.bookings.added);
    expect(liveBookings()).toBeGreaterThan(1000);
    // The worker's connection is closed: the main connection writes again.
    expect(writesHeld(db)).toBe(false);
    const closed = await call(app, 'POST', `/${id}/commit`, {});
    expect([closed.status, closed.body['error']]).toEqual([409, 'run_closed']);

    // Revert as a job, too: the run as a whole.
    const revert = await call(app, 'POST', `/${id}/revert`, {});
    const reverted = await waitFor(app, revert.body['job'].id, (j) => j.state !== 'running');
    expect(reverted.result.body.run.status).toBe('reverted');
    expect(liveBookings()).toBe(0);
  }, 120_000);

  it('a failed task leaves nothing behind and frees the writer', async () => {
    jobs = new ImportJobs(db);
    const app = appWith(jobs);
    // Rollback after every row was written: an error right before the commit undoes it all.
    const good = stage();
    const before = db.select().from(auditLog).all().length;
    expect(() =>
      runTask(
        db,
        { kind: 'commit', runId: good, deleteMissing: false },
        {
          today: '2026-09-29',
          beforeCommit: () => {
            expect(liveBookings()).toBeGreaterThan(1000);
            throw new Error('fails at the end');
          },
        },
      ),
    ).toThrow('fails at the end');
    expect(liveBookings()).toBe(0);
    expect(db.select().from(auditLog).all()).toHaveLength(before);
    expect(statusOf(good)).toBe('staged');

    // A mapping the ledger refuses (a loan on budget): the commit fails in the worker.
    const id = stage();
    const { body } = await call(app, 'GET', `/${id}/mapping`);
    const loan = Object.values(body['mapping'].accounts).find((a: any) => a.type === 'loan') as any;
    loan.onBudget = true;
    expect((await call(app, 'PUT', `/${id}/mapping`, body['mapping'])).status).toBe(200);
    const started = await call(app, 'POST', `/${id}/commit`, {});
    const job = await waitFor(app, started.body['job'].id, (j) => j.state !== 'running');
    expect(job.state).toBe('failed');
    expect([job.result.status, job.result.body.error]).toEqual([422, 'import_problems']);
    expect(liveBookings()).toBe(0);
    expect(db.select().from(auditLog).all()).toHaveLength(before);
    expect(statusOf(id)).toBe('staged');
    expect(writesHeld(db)).toBe(false);
  }, 120_000);

  it('a worker stopped in the middle of the commit leaves no partial import', async () => {
    jobs = new ImportJobs(db, { holdMs: 120_000 });
    const app = appWith(jobs);
    const id = stage();
    const started = await call(app, 'POST', `/${id}/commit`, {});
    await waitFor(app, started.body['job'].id, (j) => j.step === 'commit');
    await jobs.terminate();
    const job = jobs.get(started.body['job'].id);
    expect(job?.state).toBe('failed');
    expect(job?.result?.status).toBe(500);
    expect(liveBookings()).toBe(0);
    expect(statusOf(id)).toBe('staged');
    expect(writesHeld(db)).toBe(false);

    const fresh = new ImportJobs(db);
    const retry = await fresh.run(
      { kind: 'commit', runId: id, deleteMissing: false },
      '2026-09-29',
    );
    expect(retry.status).toBe(200);
    expect(liveBookings()).toBeGreaterThan(1000);
  }, 120_000);

  it('a server killed in the middle of the commit leaves no partial import', async () => {
    jobs = new ImportJobs(db);
    const id = stage();
    const child = fork(
      fileURLToPath(new URL('./testing/job-child.ts', import.meta.url)),
      [path, id],
      {
        execArgv: ['--import', 'tsx'],
        stdio: 'ignore',
      },
    );
    const message = await new Promise<unknown>((resolve) => child.once('message', resolve));
    expect(message).toBe('holding');
    // Every row is written in the worker's open transaction; now the process dies.
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGKILL');
    await exited;

    expect(liveBookings()).toBe(0);
    expect(
      db
        .select()
        .from(auditLog)
        .all()
        .filter((r) => r.groupId === `import:${id}`),
    ).toEqual([]);
    expect(statusOf(id)).toBe('staged');
    const retry = await jobs.run({ kind: 'commit', runId: id, deleteMissing: false }, '2026-09-29');
    expect(retry.status).toBe(200);
    expect(liveBookings()).toBeGreaterThan(1000);
  }, 120_000);
});
