import { importRun, type Db } from '@budget/db';
import { applyMapping, exportFileOf, mappingSchema } from '@budget/import-ynab';
import { desc } from 'drizzle-orm';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { ApiError, readBody } from '../api/http';
import type { ImportJobs } from './jobs';
import { deleteRun, loadRaw, saveMapping } from './staging';
import {
  findRun,
  mappingOf,
  overview,
  rawOf,
  refuseCommitted,
  ruleEffects,
  structure,
  targetProblems,
  view,
  type ImportTask,
} from './tasks';

/** Largest upload (both files together). */
export const IMPORT_UPLOAD_LIMIT = 20 * 1024 * 1024;
/** Mapping documents and previews (a mapping with a thousand payees is a few hundred KB). */
export const IMPORT_BODY_LIMIT = 2 * 1024 * 1024;

const commitBody = z.object({ deleteMissing: z.boolean().default(false) });
const revertBody = z.object({ force: z.boolean().default(false) });
const previewBody = z.object({ mapping: mappingSchema });

/**
 * Import runs. The heavy calls run as import tasks in a worker thread (`jobs.ts`), one at a time:
 *
 * - dry run, commit and revert answer 202 with a job at once; the wizard polls
 *   `GET /jobs/:id` until the job is done and gets the task's status and body there. A request
 *   that stays open for half a minute is fragile behind a proxy and on a phone; a job survives a
 *   dropped connection and shows progress.
 * - the upload and the report take a few seconds: the request waits for its task, but the event
 *   loop stays free meanwhile.
 */
export function importRoutes(
  db: Db,
  today: () => string,
  passkeySession: MiddlewareHandler,
  jobs: ImportJobs,
): Hono {
  const app = new Hono();
  const run = (id: string) => findRun(db, id);
  /** Start a task as a job: 202 with the job, polled at `GET /jobs/:id`. */
  const startJob = (c: Context, task: ImportTask) =>
    c.json({ job: jobs.start(task, today()) }, 202);
  /** Run a task and answer with its result. */
  const runNow = async (c: Context, task: ImportTask) => {
    const { status, body } = await jobs.run(task, today());
    return c.json(body, status);
  };

  app.get('/', (c) =>
    c.json({
      runs: db.select().from(importRun).orderBy(desc(importRun.startedAt)).all().map(view),
    }),
  );

  app.get('/jobs/:jobId', (c) => {
    const job = jobs.get(c.req.param('jobId'));
    if (!job) throw new ApiError(404, 'job_lost', 'Job not found (the server restarted meanwhile)');
    return c.json({ job });
  });

  app.post('/ynab', passkeySession, async (c) => {
    const form = await c.req.parseBody({ all: true });
    const files = Object.values(form)
      .flat()
      .filter((f): f is File => f instanceof File);
    const register = files.find((f) => exportFileOf(f.name) === 'register');
    const plan = files.find((f) => exportFileOf(f.name) === 'plan');
    if (!register || !plan || files.length !== 2)
      throw new ApiError(400, 'files', 'Upload "… - Register.tsv" and "… - Plan.tsv" together');
    return runNow(c, {
      kind: 'stage',
      register: { name: register.name, bytes: new Uint8Array(await register.arrayBuffer()) },
      plan: { name: plan.name, bytes: new Uint8Array(await plan.arrayBuffer()) },
    });
  });

  app.get('/:id', (c) => {
    const r = run(c.req.param('id'));
    const raw = loadRaw(db, r);
    return c.json({ run: view(r), overview: raw ? overview(raw) : null });
  });

  app.get('/:id/mapping', (c) => {
    const r = run(c.req.param('id'));
    const { version, mapping } = mappingOf(db, r, rawOf(db, r));
    return c.json({ version, proposed: version === null, mapping });
  });

  app.put('/:id/mapping', async (c) => {
    const r = run(c.req.param('id'));
    refuseCommitted(r);
    const mapping = await readBody(c, mappingSchema);
    return c.json({ version: saveMapping(db, r.id, mapping) });
  });

  /** Unsaved draft: problems, structure side by side and rule effects, without reconciliation. */
  app.post('/:id/preview', async (c) => {
    const r = run(c.req.param('id'));
    const { mapping } = await readBody(c, previewBody);
    const raw = rawOf(db, r);
    const { target, problems } = applyMapping(raw, mapping);
    return c.json({
      problems: [...raw.problems, ...problems, ...targetProblems(target)],
      structure: structure(target),
      rules: ruleEffects(target, mapping),
    });
  });

  app.post('/:id/dry-run', (c) => {
    const r = run(c.req.param('id'));
    refuseCommitted(r);
    return startJob(c, { kind: 'dry-run', runId: r.id });
  });

  app.post('/:id/commit', passkeySession, async (c) => {
    refuseCommitted(run(c.req.param('id')));
    const { deleteMissing } = await readBody(c, commitBody);
    // The task reads the run again inside its transaction: a second request (double click,
    // retry) is refused while the first job runs, and with `run_closed` after it committed.
    return startJob(c, { kind: 'commit', runId: c.req.param('id'), deleteMissing });
  });

  /** Gate 2 report of the run with its latest mapping (after a commit: against the app's data). */
  app.get('/:id/report', (c) => runNow(c, { kind: 'report', runId: run(c.req.param('id')).id }));

  app.post('/:id/revert', passkeySession, async (c) => {
    const { force } = await readBody(c, revertBody);
    return startJob(c, { kind: 'revert', runId: run(c.req.param('id')).id, force });
  });

  app.delete('/:id', passkeySession, (c) => {
    const r = run(c.req.param('id'));
    return c.json({ deleted: deleteRun(db, r) });
  });

  return app;
}
