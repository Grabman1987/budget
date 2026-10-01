import {
  importMapping,
  importRun,
  insertRows,
  ynabPlanRow,
  ynabRegisterRow,
  type Executor,
} from '@budget/db';
import {
  buildModel,
  exportAsOf,
  identityMapping,
  mappingSchema,
  planRowOf,
  registerRowOf,
  type Mapping,
  type RawModel,
  type TsvRecord,
} from '@budget/import-ynab';
import { asc, desc, eq, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

/**
 * Raw layer of a YNAB import run: the two files 1:1 as text rows (after the CESU-8 repair), only
 * in the database, deletable per run; the owner's mapping documents as versions. Nothing here is
 * logged; errors name files and line numbers only.
 */

export type ImportRunRow = typeof importRun.$inferSelect;

export function stageExport(
  db: Executor,
  input: { fileName: string; sha256: string; register: TsvRecord[]; plan: TsvRecord[] },
): string {
  const runId = randomUUID();
  db.transaction((tx) => {
    tx.insert(importRun)
      .values({ id: runId, source: 'ynab', fileName: input.fileName, fileSha256: input.sha256 })
      .run();
    const register = input.register.map(({ line, fields: f }) => ({
      id: randomUUID(),
      importRunId: runId,
      rowNo: line,
      account: f[0] as string,
      flag: f[1] as string,
      date: f[2] as string,
      payee: f[3] as string,
      categoryGroupCategory: f[4] as string,
      categoryGroup: f[5] as string,
      category: f[6] as string,
      memo: f[7] as string,
      outflow: f[8] as string,
      inflow: f[9] as string,
      cleared: f[10] as string,
    }));
    insertRows(tx, ynabRegisterRow, register);
    const plan = input.plan.map(({ line, fields: f }) => ({
      id: randomUUID(),
      importRunId: runId,
      rowNo: line,
      month: f[0] as string,
      categoryGroupCategory: f[1] as string,
      categoryGroup: f[2] as string,
      category: f[3] as string,
      assigned: f[4] as string,
      activity: f[5] as string,
      available: f[6] as string,
    }));
    insertRows(tx, ynabPlanRow, plan);
  });
  return runId;
}

/** The register file name is the first line of `file_name`; its "as of" day dates the export. */
export const registerFileName = (run: ImportRunRow): string =>
  (run.fileName ?? '').split('\n')[0] ?? '';

/** The raw model of a run, rebuilt from its staging rows (`null` once they were deleted). */
export function loadRaw(db: Executor, run: ImportRunRow): RawModel | null {
  const register = db
    .select()
    .from(ynabRegisterRow)
    .where(eq(ynabRegisterRow.importRunId, run.id))
    .orderBy(asc(ynabRegisterRow.rowNo))
    .all();
  if (register.length === 0) return null;
  const plan = db
    .select()
    .from(ynabPlanRow)
    .where(eq(ynabPlanRow.importRunId, run.id))
    .orderBy(asc(ynabPlanRow.rowNo))
    .all();
  return buildModel(
    register.map((r) =>
      registerRowOf({
        line: r.rowNo,
        fields: [
          r.account,
          r.flag,
          r.date,
          r.payee,
          r.categoryGroupCategory,
          r.categoryGroup,
          r.category,
          r.memo,
          r.outflow,
          r.inflow,
          r.cleared,
        ],
      }),
    ),
    plan.map((r) =>
      planRowOf({
        line: r.rowNo,
        fields: [
          r.month,
          r.categoryGroupCategory,
          r.categoryGroup,
          r.category,
          r.assigned,
          r.activity,
          r.available,
        ],
      }),
    ),
    { asOf: exportAsOf(registerFileName(run)) },
  );
}

/** Delete the raw rows and mapping versions of a run; a run that wrote nothing goes entirely. */
export function deleteRun(db: Executor, run: ImportRunRow): 'run' | 'staging' {
  return db.transaction((tx) => {
    tx.delete(ynabRegisterRow).where(eq(ynabRegisterRow.importRunId, run.id)).run();
    tx.delete(ynabPlanRow).where(eq(ynabPlanRow.importRunId, run.id)).run();
    tx.delete(importMapping).where(eq(importMapping.importRunId, run.id)).run();
    if (run.status === 'committed' || run.status === 'reverted') return 'staging';
    tx.delete(importRun).where(eq(importRun.id, run.id)).run();
    return 'run';
  });
}

export function saveMapping(db: Executor, runId: string, mapping: Mapping): number {
  return db.transaction((tx) => {
    const last = tx
      .select({ version: importMapping.version })
      .from(importMapping)
      .where(eq(importMapping.importRunId, runId))
      .orderBy(desc(importMapping.version))
      .get();
    const version = (last?.version ?? 0) + 1;
    tx.insert(importMapping)
      .values({
        id: randomUUID(),
        importRunId: runId,
        version,
        mappingJson: JSON.stringify(mapping),
      })
      .run();
    return version;
  });
}

/**
 * The latest saved mapping of a run; without one, the latest of an earlier run (a re-import keeps
 * the owner's mapping, also after the previous import was undone to correct it), else `null`.
 */
export function latestMapping(
  db: Executor,
  runId: string,
): { version: number | null; mapping: Mapping } | null {
  const own = db
    .select()
    .from(importMapping)
    .where(eq(importMapping.importRunId, runId))
    .orderBy(desc(importMapping.version))
    .get();
  if (own)
    return { version: own.version, mapping: mappingSchema.parse(JSON.parse(own.mappingJson)) };
  const earlier = db
    .select({ json: importMapping.mappingJson })
    .from(importMapping)
    .innerJoin(importRun, eq(importRun.id, importMapping.importRunId))
    .where(ne(importMapping.importRunId, runId))
    .orderBy(desc(importRun.startedAt), desc(importMapping.version))
    .get();
  const parsed = earlier ? mappingSchema.safeParse(JSON.parse(earlier.json)) : null;
  return parsed?.success ? { version: null, mapping: parsed.data } : null;
}

/**
 * The wizard's first proposal: the identity mapping from the account proposals, hidden
 * categories back in their original group (or "Ausgeblendet"), start month October 2023 when
 * the export covers it.
 */
export function proposeMapping(raw: RawModel): Mapping {
  const start = raw.months.includes('2023-10') ? '2023-10' : raw.months[0];
  const mapping = identityMapping(raw, start);
  for (const c of raw.categories) {
    const t = mapping.targets[c.key];
    if (t && c.hidden) t.group = c.originalGroup ?? 'Ausgeblendet';
  }
  return mapping;
}
