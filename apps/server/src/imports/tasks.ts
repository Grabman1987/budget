import {
  BookingInvariantError,
  CategoryRuleError,
  importRun,
  type Db,
  type Executor,
} from '@budget/db';
import {
  applyMapping,
  importKeys,
  ParseError,
  readRecords,
  reconcile,
  type Mapping,
  type Problem,
  type RawModel,
  type TargetModel,
} from '@budget/import-ynab';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { ACTOR, ApiError } from '../api/http';
import {
  dryRunImport,
  ImportStateError,
  ledgerDifferences,
  previousIds,
  revertImport,
  writeImport,
  type IdMap,
  type WriteResult,
} from './commit';
import {
  deleteRun,
  latestMapping,
  loadRaw,
  proposeMapping,
  saveMapping,
  stageExport,
  type ImportRunRow,
} from './staging';

/**
 * The heavy steps of an import run as tasks: staging an upload, the dry run, the commit, the
 * revert and the Gate 2 report. `runTask` is plain synchronous code on a database handle; the
 * API runs it in a worker thread with its own connection (`jobs.ts`), so the event loop of the
 * server stays free while thousands of rows are written. Each task is one transaction: all or
 * nothing, also when the process dies in the middle.
 */

export type ImportTask =
  | {
      kind: 'stage';
      register: { name: string; bytes: Uint8Array };
      plan: { name: string; bytes: Uint8Array };
    }
  | { kind: 'dry-run'; runId: string }
  | { kind: 'commit'; runId: string; deleteMissing: boolean }
  | { kind: 'revert'; runId: string; force: boolean }
  | { kind: 'report'; runId: string };
export type ImportTaskKind = ImportTask['kind'];

/** Progress of a task, shown by the wizard. */
export type TaskStep = 'load' | 'check' | 'save' | 'write' | 'verify' | 'commit';

export interface TaskContext {
  /** "Today" (`YYYY-MM-DD`) of the server, for exports without an "as of" day. */
  today: string;
  progress?: (step: TaskStep) => void;
  /** Called inside the transaction right before it commits (tests hold a task there). */
  beforeCommit?: () => void;
}

/** What the API answers for a finished task. */
export interface TaskAnswer {
  status: 200 | 201;
  body: Record<string, unknown>;
}

interface Summary {
  counts?: { register: number; plan: number; bookings: number };
  ids?: IdMap;
  [key: string]: unknown;
}
export const summaryOf = (run: ImportRunRow): Summary =>
  run.summaryJson ? (JSON.parse(run.summaryJson) as Summary) : {};

/** A run as the API shows it: no ids map, file names and counts. */
export const view = (run: ImportRunRow) => {
  const summary = summaryOf(run);
  delete summary.ids;
  return {
    id: run.id,
    source: run.source,
    status: run.status,
    fileName: run.fileName,
    mappingVersion: run.mappingVersion,
    startedAt: run.startedAt,
    committedAt: run.committedAt,
    revertedAt: run.revertedAt,
    summary,
  };
};

/** Per YNAB category (or target) and year: number of splits and their sum (scheduled left out). */
function sums<T extends { date: string; scheduled: boolean }>(
  bookings: T[],
  splits: (b: T) => { key: string | null; cents: number }[],
) {
  const out = new Map<string, { count: number; years: Record<string, number> }>();
  for (const b of bookings) {
    if (b.scheduled) continue;
    for (const s of splits(b)) {
      if (s.key === null) continue;
      const e = out.get(s.key) ?? { count: 0, years: {} };
      e.count += 1;
      const year = b.date.slice(0, 4);
      e.years[year] = (e.years[year] ?? 0) + s.cents;
      out.set(s.key, e);
    }
  }
  return out;
}

/** What the wizard shows of the raw layer: accounts, categories with counts, payees, problems. */
export function overview(raw: RawModel) {
  const byCategory = sums(raw.bookings, (b) =>
    b.splits.map((s) => ({ key: s.categoryKey, cents: s.amountCents })),
  );
  const payees = new Map<string, number>();
  for (const b of raw.bookings)
    for (const s of b.splits)
      if (s.transferAccount === null && b.systemPayee === null)
        payees.set(s.payee, (payees.get(s.payee) ?? 0) + 1);
  return {
    asOf: raw.asOf,
    months: raw.months,
    accounts: raw.accounts,
    categories: raw.categories.map((c) => ({
      ...c,
      count: byCategory.get(c.key)?.count ?? 0,
      years: byCategory.get(c.key)?.years ?? {},
    })),
    payees: [...payees]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    problems: raw.problems,
  };
}

/** Per target category: its YNAB sources, splits and sums per year after the rules. */
export function structure(target: TargetModel) {
  const byTarget = sums(target.bookings, (b) =>
    b.splits.map((s) => ({ key: s.categoryId, cents: s.amountCents })),
  );
  return target.categories.map((c) => ({
    id: c.id,
    name: c.name,
    group: c.group,
    kind: c.kind,
    class: c.class,
    sources: c.sources,
    count: byTarget.get(c.id)?.count ?? 0,
    years: byTarget.get(c.id)?.years ?? {},
  }));
}

/** Rule effects for the rules step: affected splits per rule with a few examples. */
export function ruleEffects(target: TargetModel, mapping: Mapping) {
  return mapping.rules.map((r) => {
    const hits = target.bookings.flatMap((b) =>
      b.splits
        .filter((s) => s.ruleId === r.id)
        .map((s) => ({
          date: b.date,
          payee: s.payee,
          memo: s.memo,
          amountCents: s.amountCents,
          categoryId: s.categoryId,
        })),
    );
    return {
      id: r.id,
      count: hits.length,
      sumCents: hits.reduce((a, h) => a + h.amountCents, 0),
      samples: hits.slice(0, 50),
    };
  });
}

/**
 * Account types that can never be on budget; the database refuses them, so the dry run says it
 * first. Everything else is checked by the mapping schema and `applyMapping`.
 */
const TRACKING_ONLY = new Set(['loan', 'brokerage', 'crypto', 'p2p', 'receivable']);
export function targetProblems(target: TargetModel): Problem[] {
  return target.accounts
    .filter((a) => a.onBudget && TRACKING_ONLY.has(a.type))
    .map((a) => ({
      severity: 'error' as const,
      code: 'mapping.tracking_only',
      message: `Account ${a.id}: this type cannot be on budget`,
      lines: [],
    }));
}

export const findRun = (db: Executor, id: string): ImportRunRow => {
  const found = db.select().from(importRun).where(eq(importRun.id, id)).get();
  if (!found) throw new ApiError(404, 'not_found', `Import run ${id} not found`);
  return found;
};
export const rawOf = (db: Executor, r: ImportRunRow): RawModel => {
  const raw = loadRaw(db, r);
  if (!raw) throw new ApiError(409, 'no_staging', 'The uploaded files of this run were deleted');
  return raw;
};
export const mappingOf = (db: Executor, r: ImportRunRow, raw: RawModel) =>
  latestMapping(db, r.id) ?? { version: null, mapping: proposeMapping(raw) };
export const refuseCommitted = (r: ImportRunRow): void => {
  if (r.status === 'committed' || r.status === 'reverted')
    throw new ApiError(409, 'run_closed', `The run is ${r.status}; upload the export again`);
};
const store = (db: Executor, id: string, patch: Partial<typeof importRun.$inferInsert>) =>
  db.update(importRun).set(patch).where(eq(importRun.id, id)).run();
const parseError = (error: unknown): never => {
  if (!(error instanceof ParseError)) throw error;
  const { file, line, code, message } = error;
  throw new ApiError(422, 'parse', message, { file, line, code });
};

/** Parse, map and reconcile with the latest saved mapping (saved now if there is none). */
function evaluate(db: Executor, r: ImportRunRow, ctx: TaskContext) {
  ctx.progress?.('load');
  const raw = rawOf(db, r);
  const found = mappingOf(db, r, raw);
  const { mapping } = found;
  const version = found.version ?? saveMapping(db, r.id, mapping);
  ctx.progress?.('check');
  const { target, problems } = applyMapping(raw, mapping);
  const all = [...raw.problems, ...problems, ...targetProblems(target)];
  const reconciliation = reconcile(raw, target, { today: raw.asOf ?? ctx.today });
  return { raw, mapping, version, target, problems: all, reconciliation };
}
type Evaluation = ReturnType<typeof evaluate>;

function answer(
  e: Evaluation,
  written: (Pick<WriteResult, 'ledger'> & Partial<WriteResult>) | null,
) {
  const { differences, moved, creditShift, checked } = e.reconciliation;
  return {
    mappingVersion: e.version,
    startMonth: e.target.startMonth,
    problems: e.problems,
    reconciliation: { differences, moved, creditShift, checked },
    structure: structure(e.target),
    accounts: e.target.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      onBudget: a.onBudget,
      openingDate: a.openingDate,
      openingBalanceCents: a.openingBalanceCents,
    })),
    change: written?.report ?? null,
    ledger: written?.ledger ?? [],
  };
}

const writeInput = (db: Executor, r: ImportRunRow, e: Evaluation, deleteMissing = false) => ({
  runId: r.id,
  target: e.target,
  keys: importKeys(e.raw),
  previous: previousIds(db, r.id),
  deleteMissing,
  actor: ACTOR,
});

function stage(db: Executor, task: Extract<ImportTask, { kind: 'stage' }>, ctx: TaskContext) {
  ctx.progress?.('load');
  let records;
  try {
    records = {
      register: readRecords(task.register.bytes, 'register'),
      plan: readRecords(task.plan.bytes, 'plan'),
    };
  } catch (error) {
    return parseError(error);
  }
  const sha256 = createHash('sha256')
    .update(task.register.bytes)
    .update(task.plan.bytes)
    .digest('hex');
  const same = db
    .select({ id: importRun.id })
    .from(importRun)
    .where(eq(importRun.fileSha256, sha256))
    .all()
    .map((r) => r.id);
  ctx.progress?.('save');
  const id = stageExport(db, {
    fileName: `${task.register.name}\n${task.plan.name}`,
    sha256,
    ...records,
  });
  const created = findRun(db, id);
  ctx.progress?.('check');
  let raw: RawModel;
  try {
    raw = rawOf(db, created);
  } catch (error) {
    deleteRun(db, created);
    return parseError(error);
  }
  const counts = {
    register: records.register.length,
    plan: records.plan.length,
    bookings: raw.bookings.length,
  };
  store(db, id, { summaryJson: JSON.stringify({ counts }) });
  return { run: view(findRun(db, id)), sameExportAs: same, overview: overview(raw) };
}

function dryRun(db: Executor, runId: string, ctx: TaskContext) {
  const r = findRun(db, runId);
  refuseCommitted(r);
  const e = evaluate(db, r, ctx);
  const errors = e.problems.some((p) => p.severity === 'error');
  let written: WriteResult | null = null;
  ctx.progress?.('write');
  if (!errors)
    try {
      written = dryRunImport(db, writeInput(db, r, e));
    } catch (error) {
      // A row the ledger refuses (the mapping checks should catch these first): an error of the
      // dry run, so the wizard shows it and keeps the commit closed.
      if (!(error instanceof BookingInvariantError || error instanceof CategoryRuleError))
        throw error;
      e.problems.push({
        severity: 'error',
        code: 'write.refused',
        message: error.message,
        lines: [],
      });
    }
  const result = answer(e, written);
  store(db, r.id, {
    status: 'dry_run',
    mappingVersion: e.version,
    rulesFrom: e.mapping.rulesFrom,
    summaryJson: JSON.stringify({
      ...summaryOf(r),
      differences: result.reconciliation.differences.length,
      problems: e.problems.length,
    }),
  });
  return result;
}

function commit(db: Executor, runId: string, deleteMissing: boolean, ctx: TaskContext) {
  // Read inside the task's transaction: a run committed meanwhile is refused here.
  const r = findRun(db, runId);
  refuseCommitted(r);
  const e = evaluate(db, r, ctx);
  if (e.problems.some((p) => p.severity === 'error'))
    throw new ApiError(422, 'import_problems', 'The dry run has errors; fix the mapping first', {
      problems: e.problems,
    });
  ctx.progress?.('write');
  const written = writeImport(db, writeInput(db, r, e, deleteMissing));
  const summary = {
    ...summaryOf(r),
    differences: e.reconciliation.differences.length,
    change: { ...written.report, bookings: { ...written.report.bookings, missing: undefined } },
    missing: written.report.bookings.missing.length,
    ids: written.ids,
  };
  const now = new Date().toISOString();
  store(db, r.id, {
    status: 'committed',
    mappingVersion: e.version,
    rulesFrom: e.mapping.rulesFrom,
    committedAt: now,
    finishedAt: now,
    summaryJson: JSON.stringify(summary),
  });
  return { run: view(findRun(db, r.id)), ...answer(e, written) };
}

function revert(db: Executor, runId: string, force: boolean, ctx: TaskContext) {
  ctx.progress?.('write');
  try {
    revertImport(db, runId, ACTOR, { force });
  } catch (error) {
    if (error instanceof ImportStateError) throw new ApiError(409, error.code, error.message);
    throw error;
  }
  return { run: view(findRun(db, runId)) };
}

/** Gate 2 report of the run with its latest mapping (after a commit: against the app's data). */
function report(db: Executor, runId: string, ctx: TaskContext) {
  const r = findRun(db, runId);
  const e = evaluate(db, r, ctx);
  const ids = summaryOf(r).ids;
  ctx.progress?.('verify');
  const ledger = r.status === 'committed' && ids ? ledgerDifferences(db, e.target, ids) : [];
  return { run: view(r), ...answer(e, { ledger }) };
}

/**
 * Run a task in one transaction that takes the write lock at once (`BEGIN IMMEDIATE`): the task is
 * the only writer while it runs, and nothing of it stays when it fails or the process dies. Only
 * the dry run writes nothing that stays but its summary on the run.
 */
export function runTask(db: Db, task: ImportTask, ctx: TaskContext): TaskAnswer {
  // The dry run is the write in a transaction of its own that is rolled back, as before. Inside an
  // outer transaction it would be a savepoint, and SQLite keeps a copy of every page a savepoint
  // touches in memory until it ends (about 150 MB more for a large export).
  if (task.kind === 'dry-run') {
    const body = dryRun(db, task.runId, ctx);
    ctx.progress?.('commit');
    return { status: 200, body };
  }
  return db.transaction(
    (tx) => {
      const t: Executor = tx;
      let out: TaskAnswer;
      switch (task.kind) {
        case 'stage':
          out = { status: 201, body: stage(t, task, ctx) };
          break;
        case 'commit':
          out = { status: 200, body: commit(t, task.runId, task.deleteMissing, ctx) };
          break;
        case 'revert':
          out = { status: 200, body: revert(t, task.runId, task.force, ctx) };
          break;
        case 'report':
          out = { status: 200, body: report(t, task.runId, ctx) };
          break;
      }
      ctx.progress?.('commit');
      ctx.beforeCommit?.();
      return out;
    },
    { behavior: 'immediate' },
  );
}
