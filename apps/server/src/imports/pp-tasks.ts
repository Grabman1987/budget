import { importRun, type Db, type Executor } from '@budget/db';
import { parsePp, PpFormatError, XmlError, type PpMigrationInput } from '@budget/import-pp';
import { eq } from 'drizzle-orm';
import { ACTOR } from '../api/http';
import { ImportStateError } from './commit';
import {
  hasErrors,
  inRollback,
  preparePp,
  revertPp,
  tracer,
  writePp,
  type PpChangeReport,
  type PpIdMap,
  type PpRunProblem,
  type Prepared,
} from './pp-commit';
import { gate3Report, type Gate3Report, type ReferenceValues } from './pp-report';
import {
  deletePpRun,
  latestPpMapping,
  loadPpModel,
  PP_MAX_BYTES,
  PP_SOURCE,
  sameFileRuns,
  savePpMapping,
  stagePpFile,
} from './pp-staging';
import type { ImportRunRow } from './staging';

/**
 * The steps of a one-time Portfolio Performance run as tasks, like `tasks.ts` for YNAB: stage the
 * file, save the mapping, dry run, commit, revert, report. Each one is one transaction (the dry
 * run a rolled-back one): all or nothing, also when the process dies in the middle. Answers hold
 * counts and figures; nothing of the file's text.
 */

export type PpTask =
  | { kind: 'stage'; file: { name: string; bytes: Uint8Array }; mapping?: PpMigrationInput }
  | { kind: 'map'; runId: string; mapping: PpMigrationInput }
  | { kind: 'dry-run'; runId: string; options?: ReportOptions }
  | { kind: 'commit'; runId: string; options?: ReportOptions }
  | { kind: 'revert'; runId: string; force: boolean }
  | { kind: 'report'; runId: string; options?: ReportOptions }
  | { kind: 'delete'; runId: string };

export interface ReportOptions {
  days?: string[];
  reference?: ReferenceValues;
}

export interface PpTaskContext {
  /** "Today" (`YYYY-MM-DD`) of the server. */
  today: string;
}

export class PpTaskError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PpTaskError';
  }
}

export interface PpSummary {
  fileName?: string;
  change?: PpChangeReport;
  differences?: Gate3Report['differences'];
  problems?: number;
  ids?: PpIdMap;
  [key: string]: unknown;
}
export const summaryOf = (run: ImportRunRow): PpSummary =>
  run.summaryJson ? (JSON.parse(run.summaryJson) as PpSummary) : {};

/** A run as the CLI shows it (no id map). */
export const view = (run: ImportRunRow) => {
  const summary = summaryOf(run);
  delete summary.ids;
  return {
    id: run.id,
    status: run.status,
    fileName: run.fileName,
    mappingVersion: run.mappingVersion,
    startedAt: run.startedAt,
    committedAt: run.committedAt,
    revertedAt: run.revertedAt,
    summary,
  };
};

export const findPpRun = (db: Executor, id: string): ImportRunRow => {
  const found = db.select().from(importRun).where(eq(importRun.id, id)).get();
  if (!found || found.source !== PP_SOURCE)
    throw new PpTaskError('not_found', `Portfolio Performance run ${id} not found`);
  return found;
};
const store = (db: Executor, id: string, patch: Partial<typeof importRun.$inferInsert>) =>
  db.update(importRun).set(patch).where(eq(importRun.id, id)).run();

function parsed<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof XmlError || error instanceof PpFormatError)
      throw new PpTaskError('parse', error.message, {
        code: 'code' in error ? (error as { code: string }).code : undefined,
        line: error instanceof XmlError ? error.line : undefined,
      });
    throw error;
  }
}

/** Parse the staged file, take the latest mapping and plan the run. */
function evaluate(db: Executor, run: ImportRunRow) {
  const trace = tracer();
  const model = parsed(() => loadPpModel(db, run));
  trace('parse');
  if (!model) throw new PpTaskError('no_staging', 'The uploaded file of this run was deleted');
  const mapping = latestPpMapping(db, run.id);
  if (!mapping) throw new PpTaskError('no_mapping', 'Save a mapping for this run first');
  const prep = preparePp(db, model, mapping.doc);
  trace('prepare');
  return { model, prep, version: mapping.version };
}

const refuseClosed = (r: ImportRunRow): void => {
  if (r.status === 'committed' || r.status === 'reverted')
    throw new PpTaskError('run_closed', `The run is ${r.status}; stage the file again`);
};

const problemsOf = (list: PpRunProblem[]) => list.map((p) => ({ ...p }));

function figuresOf(
  db: Executor,
  e: { model: ReturnType<typeof evaluate>['model']; prep: Prepared },
  ids: PpIdMap,
  ctx: PpTaskContext,
  options: ReportOptions | undefined,
): Gate3Report {
  return gate3Report(db, {
    model: e.model,
    prep: e.prep,
    ids,
    today: ctx.today,
    ...(options?.days ? { days: options.days } : {}),
    ...(options?.reference ? { reference: options.reference } : {}),
  });
}

function stage(db: Executor, task: Extract<PpTask, { kind: 'stage' }>) {
  // Refuse a file that does not parse before anything is stored.
  parsed(() => loadPpModelFromBytes(task.file.bytes));
  const { runId, sha256 } = stagePpFile(db, task.file);
  const same = sameFileRuns(db, sha256).filter((id) => id !== runId);
  const version = task.mapping ? savePpMapping(db, runId, task.mapping) : null;
  store(db, runId, { summaryJson: JSON.stringify({ sizeBytes: task.file.bytes.byteLength }) });
  return { run: view(findPpRun(db, runId)), sameFileAs: same, mappingVersion: version };
}

const loadPpModelFromBytes = (bytes: Uint8Array) => parsePp(bytes, { maxBytes: PP_MAX_BYTES });

function map(db: Executor, runId: string, mapping: PpMigrationInput) {
  const r = findPpRun(db, runId);
  refuseClosed(r);
  return { run: view(r), mappingVersion: savePpMapping(db, runId, mapping) };
}

function dryRun(db: Db, runId: string, ctx: PpTaskContext, options?: ReportOptions) {
  const r = findPpRun(db, runId);
  refuseClosed(r);
  const e = evaluate(db, r);
  const body = hasErrors(e.prep.problems)
    ? { problems: problemsOf(e.prep.problems), change: null, report: null }
    : inRollback(db, (tx) => {
        const trace = tracer();
        const written = writePp(tx, e.prep, { runId: r.id, actor: ACTOR });
        trace('write');
        const report = figuresOf(tx, e, written.ids, ctx, options);
        trace('report');
        return { problems: problemsOf(e.prep.problems), change: written.report, report };
      });
  store(db, r.id, {
    status: 'dry_run',
    mappingVersion: e.version,
    summaryJson: JSON.stringify({
      ...summaryOf(r),
      problems: body.problems.length,
      errors: body.problems.filter((p) => p.severity === 'error').length,
      ...(body.report ? { differences: body.report.differences } : {}),
    }),
  });
  return { run: view(findPpRun(db, r.id)), mappingVersion: e.version, ...body };
}

function commit(db: Executor, runId: string, ctx: PpTaskContext, options?: ReportOptions) {
  const r = findPpRun(db, runId);
  refuseClosed(r);
  const e = evaluate(db, r);
  if (hasErrors(e.prep.problems))
    throw new PpTaskError('import_problems', 'The dry run has errors; fix the mapping first', {
      problems: problemsOf(e.prep.problems),
    });
  const written = writePp(db, e.prep, { runId: r.id, actor: ACTOR });
  const report = figuresOf(db, e, written.ids, ctx, options);
  const now = new Date().toISOString();
  store(db, r.id, {
    status: 'committed',
    mappingVersion: e.version,
    committedAt: now,
    finishedAt: now,
    summaryJson: JSON.stringify({
      ...summaryOf(r),
      change: written.report,
      differences: report.differences,
      problems: e.prep.problems.length,
      ids: written.ids,
    }),
  });
  return {
    run: view(findPpRun(db, r.id)),
    mappingVersion: e.version,
    problems: problemsOf(e.prep.problems),
    change: written.report,
    report,
  };
}

function revert(db: Executor, runId: string, force: boolean) {
  findPpRun(db, runId);
  try {
    revertPp(db, runId, ACTOR, { force });
  } catch (error) {
    if (error instanceof ImportStateError) throw new PpTaskError(error.code, error.message);
    throw error;
  }
  return { run: view(findPpRun(db, runId)) };
}

/** Gate 3 report of a committed run against the app's data. */
function report(db: Executor, runId: string, ctx: PpTaskContext, options?: ReportOptions) {
  const r = findPpRun(db, runId);
  if (r.status !== 'committed')
    throw new PpTaskError('not_committed', 'The Gate 3 report needs a committed run');
  const ids = summaryOf(r).ids;
  if (!ids) throw new PpTaskError('no_ids', 'The run has no id map');
  const e = evaluate(db, r);
  return { run: view(r), report: figuresOf(db, e, ids, ctx, options) };
}

/**
 * Run a task in one transaction that takes the write lock at once (`BEGIN IMMEDIATE`): the task is
 * the only writer while it runs, and nothing of it stays when it fails or the process dies. The
 * dry run writes in a transaction of its own that is rolled back.
 */
export function runPpTask(db: Db, task: PpTask, ctx: PpTaskContext): Record<string, unknown> {
  if (task.kind === 'dry-run') return dryRun(db, task.runId, ctx, task.options);
  return db.transaction(
    (tx) => {
      const t: Executor = tx;
      switch (task.kind) {
        case 'stage':
          return stage(t, task);
        case 'map':
          return map(t, task.runId, task.mapping);
        case 'commit':
          return commit(t, task.runId, ctx, task.options);
        case 'revert':
          return revert(t, task.runId, task.force);
        case 'report':
          return report(t, task.runId, ctx, task.options);
        case 'delete': {
          const r = findPpRun(t, task.runId);
          return { deleted: deletePpRun(t, r) };
        }
      }
    },
    { behavior: 'immediate' },
  );
}
