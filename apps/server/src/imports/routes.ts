import { BookingInvariantError, CategoryRuleError, importRun, type Db } from '@budget/db';
import {
  applyMapping,
  exportFileOf,
  importKeys,
  mappingSchema,
  ParseError,
  readRecords,
  reconcile,
  type Mapping,
  type Problem,
  type RawModel,
  type TargetModel,
} from '@budget/import-ynab';
import { desc, eq } from 'drizzle-orm';
import { Hono, type MiddlewareHandler } from 'hono';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ACTOR, ApiError, readBody } from '../api/http';
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

/** Largest upload (both files together). */
export const IMPORT_UPLOAD_LIMIT = 20 * 1024 * 1024;
/** Mapping documents and previews (a mapping with a thousand payees is a few hundred KB). */
export const IMPORT_BODY_LIMIT = 2 * 1024 * 1024;

const commitBody = z.object({ deleteMissing: z.boolean().default(false) });
const revertBody = z.object({ force: z.boolean().default(false) });
const previewBody = z.object({ mapping: mappingSchema });

interface Summary {
  counts?: { register: number; plan: number; bookings: number };
  ids?: IdMap;
  [key: string]: unknown;
}
const summaryOf = (run: ImportRunRow): Summary =>
  run.summaryJson ? (JSON.parse(run.summaryJson) as Summary) : {};

/** A run as the API shows it: no ids map, file names and counts. */
const view = (run: ImportRunRow) => {
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
function overview(raw: RawModel) {
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
function structure(target: TargetModel) {
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
function ruleEffects(target: TargetModel, mapping: Mapping) {
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
function targetProblems(target: TargetModel): Problem[] {
  return target.accounts
    .filter((a) => a.onBudget && TRACKING_ONLY.has(a.type))
    .map((a) => ({
      severity: 'error' as const,
      code: 'mapping.tracking_only',
      message: `Account ${a.id}: this type cannot be on budget`,
      lines: [],
    }));
}

export function importRoutes(db: Db, today: () => string, stepUp: MiddlewareHandler): Hono {
  const app = new Hono();

  const run = (id: string): ImportRunRow => {
    const found = db.select().from(importRun).where(eq(importRun.id, id)).get();
    if (!found) throw new ApiError(404, 'not_found', `Import run ${id} not found`);
    return found;
  };
  const rawOf = (r: ImportRunRow): RawModel => {
    const raw = loadRaw(db, r);
    if (!raw) throw new ApiError(409, 'no_staging', 'The uploaded files of this run were deleted');
    return raw;
  };
  const mappingOf = (r: ImportRunRow, raw: RawModel) =>
    latestMapping(db, r.id) ?? { version: null, mapping: proposeMapping(raw) };
  /** Parse, map and reconcile with the latest saved mapping (saved now if there is none). */
  const evaluate = (r: ImportRunRow) => {
    const raw = rawOf(r);
    const found = mappingOf(r, raw);
    const { mapping } = found;
    const version = found.version ?? saveMapping(db, r.id, mapping);
    const { target, problems } = applyMapping(raw, mapping);
    const all = [...raw.problems, ...problems, ...targetProblems(target)];
    const reconciliation = reconcile(raw, target, { today: raw.asOf ?? today() });
    return { raw, mapping, version, target, problems: all, reconciliation };
  };
  const answer = (
    e: ReturnType<typeof evaluate>,
    written: (Pick<WriteResult, 'ledger'> & Partial<WriteResult>) | null,
  ) => {
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
  };
  const writeInput = (r: ImportRunRow, e: ReturnType<typeof evaluate>, deleteMissing = false) => ({
    runId: r.id,
    target: e.target,
    keys: importKeys(e.raw),
    previous: previousIds(db, r.id),
    deleteMissing,
    actor: ACTOR,
  });
  const store = (id: string, patch: Partial<typeof importRun.$inferInsert>) =>
    db.update(importRun).set(patch).where(eq(importRun.id, id)).run();
  const refuseCommitted = (r: ImportRunRow) => {
    if (r.status === 'committed' || r.status === 'reverted')
      throw new ApiError(409, 'run_closed', `The run is ${r.status}; upload the export again`);
  };

  app.get('/', (c) =>
    c.json({
      runs: db.select().from(importRun).orderBy(desc(importRun.startedAt)).all().map(view),
    }),
  );

  app.post('/ynab', stepUp, async (c) => {
    const form = await c.req.parseBody({ all: true });
    const files = Object.values(form)
      .flat()
      .filter((f): f is File => f instanceof File);
    const register = files.find((f) => exportFileOf(f.name) === 'register');
    const plan = files.find((f) => exportFileOf(f.name) === 'plan');
    if (!register || !plan || files.length !== 2)
      throw new ApiError(400, 'files', 'Upload "… - Register.tsv" and "… - Plan.tsv" together');
    const bytes = {
      register: new Uint8Array(await register.arrayBuffer()),
      plan: new Uint8Array(await plan.arrayBuffer()),
    };
    let records;
    try {
      records = {
        register: readRecords(bytes.register, 'register'),
        plan: readRecords(bytes.plan, 'plan'),
      };
    } catch (error) {
      if (!(error instanceof ParseError)) throw error;
      const { file, line, code, message } = error;
      throw new ApiError(422, 'parse', message, { file, line, code });
    }
    const sha256 = createHash('sha256').update(bytes.register).update(bytes.plan).digest('hex');
    const same = db
      .select({ id: importRun.id })
      .from(importRun)
      .where(eq(importRun.fileSha256, sha256))
      .all()
      .map((r) => r.id);
    const id = stageExport(db, {
      fileName: `${register.name}\n${plan.name}`,
      sha256,
      ...records,
    });
    const created = run(id);
    let raw: RawModel;
    try {
      raw = rawOf(created);
    } catch (error) {
      deleteRun(db, created);
      if (!(error instanceof ParseError)) throw error;
      const { file, line, code, message } = error;
      throw new ApiError(422, 'parse', message, { file, line, code });
    }
    const counts = {
      register: records.register.length,
      plan: records.plan.length,
      bookings: raw.bookings.length,
    };
    store(id, { summaryJson: JSON.stringify({ counts }) });
    return c.json({ run: view(run(id)), sameExportAs: same, overview: overview(raw) }, 201);
  });

  app.get('/:id', (c) => {
    const r = run(c.req.param('id'));
    const raw = loadRaw(db, r);
    return c.json({ run: view(r), overview: raw ? overview(raw) : null });
  });

  app.get('/:id/mapping', (c) => {
    const r = run(c.req.param('id'));
    const { version, mapping } = mappingOf(r, rawOf(r));
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
    const raw = rawOf(r);
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
    const e = evaluate(r);
    const errors = e.problems.some((p) => p.severity === 'error');
    let written: WriteResult | null = null;
    if (!errors)
      try {
        written = dryRunImport(db, writeInput(r, e));
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
    store(r.id, {
      status: 'dry_run',
      mappingVersion: e.version,
      rulesFrom: e.mapping.rulesFrom,
      summaryJson: JSON.stringify({
        ...summaryOf(r),
        differences: result.reconciliation.differences.length,
        problems: e.problems.length,
      }),
    });
    return c.json(result);
  });

  app.post('/:id/commit', stepUp, async (c) => {
    refuseCommitted(run(c.req.param('id')));
    const { deleteMissing } = await readBody(c, commitBody);
    // Read again after the body: a second request (double click, retry) may have committed the run
    // meanwhile. From here on everything is synchronous, so nothing can come in between.
    const r = run(c.req.param('id'));
    refuseCommitted(r);
    const e = evaluate(r);
    if (e.problems.some((p) => p.severity === 'error'))
      throw new ApiError(422, 'import_problems', 'The dry run has errors; fix the mapping first', {
        problems: e.problems,
      });
    const written = db.transaction((tx) => {
      const result = writeImport(tx, writeInput(r, e, deleteMissing));
      const summary = {
        ...summaryOf(r),
        differences: e.reconciliation.differences.length,
        change: { ...result.report, bookings: { ...result.report.bookings, missing: undefined } },
        missing: result.report.bookings.missing.length,
        ids: result.ids,
      };
      const now = new Date().toISOString();
      tx.update(importRun)
        .set({
          status: 'committed',
          mappingVersion: e.version,
          rulesFrom: e.mapping.rulesFrom,
          committedAt: now,
          finishedAt: now,
          summaryJson: JSON.stringify(summary),
        })
        .where(eq(importRun.id, r.id))
        .run();
      return result;
    });
    return c.json({ run: view(run(r.id)), ...answer(e, written) });
  });

  /** Gate 2 report of the run with its latest mapping (after a commit: against the app's data). */
  app.get('/:id/report', (c) => {
    const r = run(c.req.param('id'));
    const e = evaluate(r);
    const ids = summaryOf(r).ids;
    const ledger = r.status === 'committed' && ids ? ledgerDifferences(db, e.target, ids) : [];
    return c.json({ run: view(r), ...answer(e, { ledger }) });
  });

  app.post('/:id/revert', stepUp, async (c) => {
    const { force } = await readBody(c, revertBody);
    try {
      revertImport(db, c.req.param('id'), ACTOR, { force });
    } catch (error) {
      if (error instanceof ImportStateError) throw new ApiError(409, error.code, error.message);
      throw error;
    }
    return c.json({ run: view(run(c.req.param('id'))) });
  });

  app.delete('/:id', stepUp, (c) => {
    const r = run(c.req.param('id'));
    return c.json({ deleted: deleteRun(db, r) });
  });

  return app;
}
