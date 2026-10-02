import { importFile, importMapping, importRun, type Executor } from '@budget/db';
import {
  parsePp,
  ppMigrationSchema,
  type PpMigration,
  type PpMigrationInput,
  type PpModel,
} from '@budget/import-pp';
import { desc, eq, ne, and } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import type { ImportRunRow } from './staging';

/**
 * Staging of a one-time Portfolio Performance run (`docs/ops.md` §13): the XML file as bytes in
 * the database (deletable per run), the owner's mapping documents as versions. The file is parsed
 * again by every task, so the run can be re-mapped without uploading it again. Nothing here logs
 * file contents; errors name codes and element paths only.
 */

export const PP_SOURCE = 'portfolio_performance' as const;
/** Same size limit as the parser (`parsePp` default). */
export const PP_MAX_BYTES = 64 * 1024 * 1024;

export function stagePpFile(
  db: Executor,
  input: { name: string; bytes: Uint8Array },
): { runId: string; sha256: string } {
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const runId = randomUUID();
  db.transaction((tx) => {
    tx.insert(importRun)
      .values({ id: runId, source: PP_SOURCE, fileName: input.name, fileSha256: sha256 })
      .run();
    tx.insert(importFile)
      .values({
        importRunId: runId,
        name: input.name,
        sha256,
        sizeBytes: input.bytes.byteLength,
        bytes: Buffer.from(input.bytes),
      })
      .run();
  });
  return { runId, sha256 };
}

/** Runs of the PP source with the same file (by hash), for "same file as run …". */
export function sameFileRuns(db: Executor, sha256: string): string[] {
  return db
    .select({ id: importRun.id })
    .from(importRun)
    .where(and(eq(importRun.source, PP_SOURCE), eq(importRun.fileSha256, sha256)))
    .all()
    .map((r) => r.id);
}

/** The parsed file of a run, `null` once it was deleted. Throws the parser's errors. */
export function loadPpModel(db: Executor, run: ImportRunRow): PpModel | null {
  const file = db.select().from(importFile).where(eq(importFile.importRunId, run.id)).get();
  if (!file) return null;
  return parsePp(new Uint8Array(file.bytes), { maxBytes: PP_MAX_BYTES });
}

export function savePpMapping(db: Executor, runId: string, doc: PpMigrationInput): number {
  const parsed = ppMigrationSchema.parse(doc);
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
        mappingJson: JSON.stringify(parsed),
      })
      .run();
    return version;
  });
}

/**
 * The latest saved mapping of a run; without one, the latest of an earlier PP run (a re-import
 * keeps the owner's mapping), else `null`.
 */
export function latestPpMapping(
  db: Executor,
  runId: string,
): { version: number | null; doc: PpMigration } | null {
  const own = db
    .select()
    .from(importMapping)
    .where(eq(importMapping.importRunId, runId))
    .orderBy(desc(importMapping.version))
    .get();
  if (own) return { version: own.version, doc: ppMigrationSchema.parse(JSON.parse(own.mappingJson)) };
  const earlier = db
    .select({ json: importMapping.mappingJson })
    .from(importMapping)
    .innerJoin(importRun, eq(importRun.id, importMapping.importRunId))
    .where(and(ne(importMapping.importRunId, runId), eq(importRun.source, PP_SOURCE)))
    .orderBy(desc(importRun.startedAt), desc(importMapping.version))
    .get();
  const parsed = earlier ? ppMigrationSchema.safeParse(JSON.parse(earlier.json)) : null;
  return parsed?.success ? { version: null, doc: parsed.data } : null;
}

/** Delete the file and mapping versions of a run; a run that wrote nothing goes entirely. */
export function deletePpRun(db: Executor, run: ImportRunRow): 'run' | 'staging' {
  return db.transaction((tx) => {
    tx.delete(importFile).where(eq(importFile.importRunId, run.id)).run();
    tx.delete(importMapping).where(eq(importMapping.importRunId, run.id)).run();
    if (run.status === 'committed' || run.status === 'reverted') return 'staging';
    tx.delete(importRun).where(eq(importRun.id, run.id)).run();
    return 'run';
  });
}
