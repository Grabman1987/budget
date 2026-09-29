import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { id, isoMonth, nowSql, oneOf } from './common';

export const IMPORT_SOURCES = ['ynab', 'csv', 'bank', 'portfolio_performance', 'other'] as const;
/** `dry_run` writes only staging rows; `committed` wrote the target rows; `reverted` undid them. */
export const IMPORT_STATUSES = ['staged', 'dry_run', 'committed', 'reverted', 'failed'] as const;

/**
 * One import (Import-Lauf): an uploaded file, its raw staging rows, the mapping versions the owner
 * made for it and the result. Target rows (bookings, …) carry `import_run_id`, so a committed run
 * can be reverted as a whole. Row contents never go to logs; the summary holds counts only.
 */
export const importRun = sqliteTable(
  'import_run',
  {
    id: id(),
    source: text('source', { enum: IMPORT_SOURCES }).notNull(),
    status: text('status', { enum: IMPORT_STATUSES }).notNull().default('staged'),
    /** Original file name(s) and SHA-256 of the upload, to recognise the same export again. */
    fileName: text('file_name'),
    fileSha256: text('file_sha256'),
    /** Mapping version used by the last dry run or the commit. */
    mappingVersion: integer('mapping_version'),
    /** Re-categorisation rules apply from this month on (`YYYY-MM`); before it the mapping is 1:1. */
    rulesFrom: text('rules_from'),
    /** Counts and reconciliation differences as JSON (never row contents). */
    summaryJson: text('summary_json'),
    startedAt: text('started_at').notNull().default(nowSql),
    finishedAt: text('finished_at'),
    committedAt: text('committed_at'),
    revertedAt: text('reverted_at'),
  },
  (t) => [
    oneOf('import_run_source_chk', t.source, IMPORT_SOURCES),
    oneOf('import_run_status_chk', t.status, IMPORT_STATUSES),
    isoMonth('import_run_rules_from_chk', t.rulesFrom),
  ],
);

/**
 * Owner-made mapping document of a run (accounts, n:1 category merges, re-categorisation rules,
 * payees, name cleanup; `docs/migration/ynab-export.md`), versioned: every save is a new row.
 */
export const importMapping = sqliteTable(
  'import_mapping',
  {
    id: id(),
    importRunId: text('import_run_id')
      .notNull()
      .references(() => importRun.id),
    version: integer('version').notNull(),
    /** Schema version of the JSON document (validated by zod in the importer). */
    schemaVersion: integer('schema_version').notNull().default(1),
    mappingJson: text('mapping_json').notNull(),
    createdAt: text('created_at').notNull().default(nowSql),
  },
  (t) => [
    uniqueIndex('import_mapping_uq').on(t.importRunId, t.version),
    check('import_mapping_version_chk', sql`${t.version} >= 1`),
  ],
);

/**
 * Raw layer of a YNAB export: `Register.tsv` 1:1 as text (after the CESU-8 repair), one row per
 * line, `row_no` = line number in the file. Nothing is interpreted here, so a run can be re-mapped
 * without uploading again.
 */
export const ynabRegisterRow = sqliteTable(
  'ynab_register_row',
  {
    id: id(),
    importRunId: text('import_run_id')
      .notNull()
      .references(() => importRun.id),
    rowNo: integer('row_no').notNull(),
    account: text('account').notNull(),
    flag: text('flag').notNull().default(''),
    date: text('date').notNull(),
    payee: text('payee').notNull().default(''),
    categoryGroupCategory: text('category_group_category').notNull().default(''),
    categoryGroup: text('category_group').notNull().default(''),
    category: text('category').notNull().default(''),
    memo: text('memo').notNull().default(''),
    outflow: text('outflow').notNull(),
    inflow: text('inflow').notNull(),
    cleared: text('cleared').notNull(),
  },
  (t) => [uniqueIndex('ynab_register_row_uq').on(t.importRunId, t.rowNo)],
);

/** Raw layer of `Plan.tsv`: assigned, activity and available per category and month, as text. */
export const ynabPlanRow = sqliteTable(
  'ynab_plan_row',
  {
    id: id(),
    importRunId: text('import_run_id')
      .notNull()
      .references(() => importRun.id),
    rowNo: integer('row_no').notNull(),
    month: text('month').notNull(),
    categoryGroupCategory: text('category_group_category').notNull().default(''),
    categoryGroup: text('category_group').notNull().default(''),
    category: text('category').notNull().default(''),
    assigned: text('assigned').notNull(),
    activity: text('activity').notNull(),
    available: text('available').notNull(),
  },
  (t) => [
    uniqueIndex('ynab_plan_row_uq').on(t.importRunId, t.rowNo),
    index('ynab_plan_row_category_idx').on(t.importRunId, t.categoryGroup, t.category),
  ],
);
