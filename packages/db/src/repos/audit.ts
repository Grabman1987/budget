import { randomUUID } from 'node:crypto';
import { and, desc, eq, getTableColumns, getTableName, is, sql, type Column } from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as schema from '../schema';
import { auditLog, type AUDIT_ACTIONS } from '../schema';
import { AuditError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';

export { AuditError } from './errors';

/**
 * Change log (SPEC §5). Every write of the repositories goes through the tracked helpers below,
 * which store row snapshots (`before` / `after`, keyed by SQL column name) in `audit_log`.
 * `undo` replays them. Snapshot semantics per entry:
 *
 * - `before = null`, `after` set: a row was created. Reverting soft-deletes it (hard-deletes on
 *   tables without `deleted_at`, e.g. `booking_split`, `price`).
 * - both set: an update, soft delete or restore. Reverting restores the `before` columns.
 * - `before` set, `after = null`: a hard delete. Reverting re-inserts `before`.
 *
 * `undo` writes `undo` entries with the same shape, so undoing an undo (redo) is symmetric.
 * `entity_type` is the SQL table name, `entity_id` the primary key (composite keys joined by `:`).
 */

/** Who acts, and optionally the group that ties the entries of one user action together. */
export type AuditContext = { actor: string; groupId?: string };
export type GroupedContext = { actor: string; groupId: string };
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
/** Row snapshot: SQL column name to JSON value. */
export type Snapshot = Record<string, unknown>;
/** Primary key values in key-column order. */
export type RowKey = readonly (string | number)[];

export interface AuditEntry {
  id: string;
  ts: string;
  actor: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before: Snapshot | null;
  after: Snapshot | null;
  groupId: string | null;
  undoOfId: string | null;
}

export interface AuditEntryInput {
  id?: string;
  actor: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: Snapshot | null;
  after?: Snapshot | null;
  groupId?: string | null;
  undoOfId?: string | null;
}

/** Context with a guaranteed group id (a fresh one unless the caller supplied it). */
export const withGroup = (ctx: AuditContext): GroupedContext => ({
  actor: ctx.actor,
  groupId: ctx.groupId ?? randomUUID(),
});

export const nowIso = (): string => new Date().toISOString();

// ---------------------------------------------------------------------------------------------
// Table metadata (generic snapshot / restore keyed by Drizzle table)
// ---------------------------------------------------------------------------------------------

interface TableMeta {
  table: SQLiteTable;
  /** SQL table name = `entity_type`. */
  name: string;
  /** Property name to column. */
  columns: Record<string, Column>;
  keyProps: string[];
  deletedAtProp: string | undefined;
  updatedAtProp: string | undefined;
}

const metaCache = new Map<SQLiteTable, TableMeta>();
const tablesByName = new Map<string, SQLiteTable>();
for (const value of Object.values(schema)) {
  if (is(value, SQLiteTable)) tablesByName.set(getTableName(value), value);
}

/** Metadata of a Drizzle table: key columns, soft-delete and `updated_at` columns. */
export function tableMeta(table: SQLiteTable): TableMeta {
  const cached = metaCache.get(table);
  if (cached) return cached;
  const columns = getTableColumns(table) as Record<string, Column>;
  const props = Object.keys(columns);
  const single = props.filter((p) => columns[p]!.primary);
  const composite = getTableConfig(table).primaryKeys[0]?.columns ?? [];
  const keyProps =
    single.length > 0 ? single : props.filter((p) => composite.some((c) => c === columns[p]));
  const byColumnName = (name: string) => props.find((p) => columns[p]!.name === name);
  const meta: TableMeta = {
    table,
    name: getTableName(table),
    columns,
    keyProps,
    deletedAtProp: byColumnName('deleted_at'),
    updatedAtProp: byColumnName('updated_at'),
  };
  metaCache.set(table, meta);
  return meta;
}

/** Table for an `entity_type`; throws `AuditError` for unknown names. */
function tableFor(entityType: string): SQLiteTable {
  const table = tablesByName.get(entityType);
  if (!table) throw new AuditError(`Unknown entity type "${entityType}"`);
  return table;
}

export const entityIdOf = (key: RowKey): string => key.join(':');

const toSnapshot = (meta: TableMeta, row: Record<string, unknown>): Snapshot => {
  const out: Snapshot = {};
  for (const [prop, col] of Object.entries(meta.columns)) out[col.name] = row[prop] ?? null;
  return out;
};

/** Snapshot to Drizzle property values; columns missing in an old snapshot are left out. */
const fromSnapshot = (meta: TableMeta, snap: Snapshot): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [prop, col] of Object.entries(meta.columns)) {
    if (col.name in snap) out[prop] = snap[col.name];
  }
  return out;
};

const snapshotKey = (meta: TableMeta, snap: Snapshot): RowKey =>
  meta.keyProps.map((p) => snap[meta.columns[p]!.name] as string | number);

const snapshotsEqual = (a: Snapshot, b: Snapshot): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] ?? null) !== (b[k] ?? null)) return false;
  return true;
};

const whereKey = (meta: TableMeta, key: RowKey) =>
  and(...meta.keyProps.map((p, i) => eq(meta.columns[p]!, key[i])));

/** Current row as snapshot, or `null` when it does not exist (soft-deleted rows do exist). */
export function readSnapshot(db: Executor, table: SQLiteTable, key: RowKey): Snapshot | null {
  const meta = tableMeta(table);
  const row = db.select().from(table).where(whereKey(meta, key)).get() as
    Record<string, unknown> | undefined;
  return row ? toSnapshot(meta, row) : null;
}

// ---------------------------------------------------------------------------------------------
// Recording and reading
// ---------------------------------------------------------------------------------------------

/** Append an entry to the change log; returns its id. */
export function recordAudit(db: Executor, entry: AuditEntryInput): string {
  const id = entry.id ?? randomUUID();
  db.insert(auditLog)
    .values({
      id,
      actor: entry.actor,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeJson: entry.before ? JSON.stringify(entry.before) : null,
      afterJson: entry.after ? JSON.stringify(entry.after) : null,
      groupId: entry.groupId ?? null,
      undoOfId: entry.undoOfId ?? null,
    })
    .run();
  return id;
}

const parseEntry = (row: typeof auditLog.$inferSelect): AuditEntry => ({
  id: row.id,
  ts: row.ts,
  actor: row.actor,
  action: row.action,
  entityType: row.entityType,
  entityId: row.entityId,
  before: row.beforeJson ? (JSON.parse(row.beforeJson) as Snapshot) : null,
  after: row.afterJson ? (JSON.parse(row.afterJson) as Snapshot) : null,
  groupId: row.groupId,
  undoOfId: row.undoOfId,
});

/** Entries of one entity, newest first (insertion order, not clock order). */
export function history(db: Executor, entityType: string, entityId: string): AuditEntry[] {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
    .orderBy(desc(sql`rowid`))
    .all()
    .map(parseEntry);
}

// ---------------------------------------------------------------------------------------------
// Tracked writes: the only way repositories change data
// ---------------------------------------------------------------------------------------------

/** Insert a row and record a `create` entry. Returns the stored row (defaults applied). */
export function insertTracked<T extends SQLiteTable>(
  db: Executor,
  table: T,
  values: T['$inferInsert'],
  ctx: AuditContext,
): T['$inferSelect'] {
  const meta = tableMeta(table);
  db.insert(table).values(values).run();
  const key = meta.keyProps.map((p) => (values as Record<string, string | number>)[p]!);
  const after = readSnapshot(db, table, key)!;
  recordAudit(db, {
    actor: ctx.actor,
    action: 'create',
    entityType: meta.name,
    entityId: entityIdOf(key),
    after,
    groupId: ctx.groupId ?? null,
  });
  return db.select().from(table).where(whereKey(meta, key)).get() as T['$inferSelect'];
}

/**
 * Update columns of one row and record an entry. Bumps `updated_at` when the table has one.
 * `undefined` patch values are ignored; a patch that changes nothing writes nothing and returns
 * `false`. Throws `EntityNotFoundError` when the row does not exist.
 */
export function updateTracked(
  db: Executor,
  table: SQLiteTable,
  key: RowKey,
  patch: Record<string, unknown>,
  ctx: AuditContext,
  action: 'update' | 'delete' | 'restore' = 'update',
): boolean {
  const meta = tableMeta(table);
  const before = readSnapshot(db, table, key);
  if (!before) throw new EntityNotFoundError(meta.name, entityIdOf(key));
  const changes: Record<string, unknown> = {};
  for (const [prop, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const col = meta.columns[prop];
    if (!col) throw new Error(`Unknown column "${prop}" on ${meta.name}`);
    if (meta.keyProps.includes(prop))
      throw new Error(`Cannot patch key column "${prop}" of ${meta.name}`);
    if ((before[col.name] ?? null) !== value) changes[prop] = value;
  }
  if (Object.keys(changes).length === 0) return false;
  if (meta.updatedAtProp && !(meta.updatedAtProp in changes))
    changes[meta.updatedAtProp] = nowIso();
  db.update(table).set(changes).where(whereKey(meta, key)).run();
  recordAudit(db, {
    actor: ctx.actor,
    action,
    entityType: meta.name,
    entityId: entityIdOf(key),
    before,
    after: readSnapshot(db, table, key),
    groupId: ctx.groupId ?? null,
  });
  return true;
}

/**
 * Hard-delete a row of a table without soft delete (e.g. a replaced `booking_split`). The snapshot
 * stays in the log, so `undo` can re-insert it.
 */
export function deleteTracked(
  db: Executor,
  table: SQLiteTable,
  key: RowKey,
  ctx: AuditContext,
): void {
  const meta = tableMeta(table);
  const before = readSnapshot(db, table, key);
  if (!before) throw new EntityNotFoundError(meta.name, entityIdOf(key));
  db.delete(table).where(whereKey(meta, key)).run();
  recordAudit(db, {
    actor: ctx.actor,
    action: 'delete',
    entityType: meta.name,
    entityId: entityIdOf(key),
    before,
    after: null,
    groupId: ctx.groupId ?? null,
  });
}

// ---------------------------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------------------------

export type UndoTarget = { auditId: string } | { groupId: string };
export interface UndoResult {
  /** Group shared by all written `undo` entries (pass it to `undo` again to redo). */
  groupId: string;
  /** Written entries in the order they were applied (reverse of the reverted ones). */
  entries: AuditEntry[];
}

function loadTarget(db: Executor, target: UndoTarget): AuditEntry[] {
  const rows =
    'auditId' in target
      ? db.select().from(auditLog).where(eq(auditLog.id, target.auditId)).all()
      : db
          .select()
          .from(auditLog)
          .where(eq(auditLog.groupId, target.groupId))
          .orderBy(sql`rowid`)
          .all();
  if (rows.length === 0) {
    const what =
      'auditId' in target ? `audit entry ${target.auditId}` : `audit group ${target.groupId}`;
    throw new AuditError(`Cannot undo: ${what} not found`);
  }
  return rows.map(parseEntry);
}

function revertEntry(db: Executor, entry: AuditEntry, ctx: GroupedContext, force: boolean): void {
  const table = tableFor(entry.entityType);
  const meta = tableMeta(table);
  const basis = entry.after ?? entry.before;
  if (!basis) throw new AuditError(`Audit entry ${entry.id} has no snapshot`);
  const key = snapshotKey(meta, basis);
  const current = readSnapshot(db, table, key);

  if (!force) {
    const unchanged =
      entry.after === null
        ? current === null
        : current !== null && snapshotsEqual(current, entry.after);
    if (!unchanged) {
      throw new AuditError(
        `Cannot undo ${entry.action} of ${entry.entityType} ${entry.entityId}: it changed after this entry`,
      );
    }
  }

  if (entry.before === null) {
    // Revert a creation.
    if (current === null) return;
    if (meta.deletedAtProp) {
      const set: Record<string, unknown> = { [meta.deletedAtProp]: nowIso() };
      if (meta.updatedAtProp) set[meta.updatedAtProp] = nowIso();
      db.update(table).set(set).where(whereKey(meta, key)).run();
    } else {
      db.delete(table).where(whereKey(meta, key)).run();
    }
  } else if (current === null) {
    // Revert a hard delete.
    db.insert(table).values(fromSnapshot(meta, entry.before)).run();
  } else {
    // Restore the before columns (everything but the key).
    const values = fromSnapshot(meta, entry.before);
    for (const p of meta.keyProps) delete values[p];
    db.update(table).set(values).where(whereKey(meta, key)).run();
  }

  recordAudit(db, {
    actor: ctx.actor,
    action: 'undo',
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: current,
    after: readSnapshot(db, table, key),
    groupId: ctx.groupId,
    undoOfId: entry.id,
  });
}

/**
 * Revert one audit entry, or all entries of a group in reverse order, inside one transaction
 * (all or nothing). Writes `undo` entries under a new shared group id. Refuses with `AuditError`
 * when an entity changed after the entry (current row differs from the entry's `after`
 * snapshot) unless `options.force` is set.
 */
export function undo(
  db: Executor,
  target: UndoTarget,
  ctx: AuditContext,
  options: { force?: boolean } = {},
): UndoResult {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const originals = loadTarget(tx, target);
    for (const entry of originals.reverse())
      revertEntry(tx, entry, grouped, options.force ?? false);
    const written = tx
      .select()
      .from(auditLog)
      .where(eq(auditLog.groupId, grouped.groupId))
      .orderBy(sql`rowid`)
      .all()
      .filter((r) => r.action === 'undo')
      .map(parseEntry);
    return { groupId: grouped.groupId, entries: written };
  });
}
