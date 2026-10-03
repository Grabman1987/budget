import { assertContactUndoDependencies } from './contact-invariants';
import { randomUUID } from 'node:crypto';
import {
  and,
  desc,
  eq,
  getTableColumns,
  getTableName,
  inArray,
  isNotNull,
  isNull,
  is,
  or,
  sql,
  type Column,
} from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as schema from '../schema';
import { auditLog, type AUDIT_ACTIONS } from '../schema';
import { AuditError, EntityNotFoundError } from './errors';
import { expectedLinkPatches } from './expected-links';
import { assertLedgerInvariants, assertTradeSettlementInvariants } from './invariants';
import { assertAccountBookingCurrencies, assertEurBudgetAccounts } from './account-invariants';
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

interface Prepared {
  run(params: Record<string, unknown>): unknown;
  get(params: Record<string, unknown>): unknown;
}
/** Prepared statements per executor (a transaction handle or the database), table and column pattern. */
const prepared = new WeakMap<object, Map<string, Prepared>>();

/**
 * Insert rows one by one through a prepared statement that is reused (cached per executor) instead
 * of building one large multi-row statement per chunk: building the SQL of a multi-row insert in
 * Drizzle costs far more than SQLite's work. Values are bound like a plain `insert().values()`:
 * `undefined` gets the column default, `null` stays a literal NULL (encoders never see it).
 * With `returning` the stored rows (defaults applied) come back in order.
 */
export function insertRows<T extends SQLiteTable>(
  db: Executor,
  table: T,
  rows: readonly T['$inferInsert'][],
  options: { returning?: boolean } = {},
): T['$inferSelect'][] {
  const meta = tableMeta(table);
  const props = Object.keys(meta.columns);
  let cache = prepared.get(db);
  if (!cache) prepared.set(db, (cache = new Map()));
  const out: T['$inferSelect'][] = [];
  for (const row of rows as Record<string, unknown>[]) {
    let pattern = options.returning ? `${meta.name}|r|` : `${meta.name}|-|`;
    for (const p of props) pattern += row[p] === undefined ? 'u' : row[p] === null ? 'n' : 'p';
    let statement = cache.get(pattern);
    if (!statement) {
      const template: Record<string, unknown> = {};
      for (const p of props)
        if (row[p] !== undefined) template[p] = row[p] === null ? null : sql.placeholder(p);
      const insert = db.insert(table).values(template as T['$inferInsert']);
      statement = (options.returning
        ? insert.returning().prepare()
        : insert.prepare()) as unknown as Prepared;
      cache.set(pattern, statement);
    }
    if (options.returning) out.push(statement.get(row) as T['$inferSelect']);
    else statement.run(row);
  }
  return out;
}

/** Current row as snapshot, or `null` when it does not exist (soft-deleted rows do exist). */
export function readSnapshot(db: Executor, table: SQLiteTable, key: RowKey): Snapshot | null {
  const meta = tableMeta(table);
  let cache = prepared.get(db);
  if (!cache) prepared.set(db, (cache = new Map()));
  const pattern = `${meta.name}|select`;
  let statement = cache.get(pattern);
  if (!statement) {
    const where = and(
      ...meta.keyProps.map((p, i) => eq(meta.columns[p]!, sql.placeholder(`k${i}`))),
    );
    statement = db.select().from(table).where(where).prepare() as unknown as Prepared;
    cache.set(pattern, statement);
  }
  const params: Record<string, unknown> = {};
  key.forEach((v, i) => (params[`k${i}`] = v));
  const row = statement.get(params) as Record<string, unknown> | undefined;
  return row ? toSnapshot(meta, row) : null;
}

// ---------------------------------------------------------------------------------------------
// Recording and reading
// ---------------------------------------------------------------------------------------------

/** Append an entry to the change log; returns its id. */
export function recordAudit(db: Executor, entry: AuditEntryInput): string {
  const id = entry.id ?? randomUUID();
  insertRows(db, auditLog, [
    {
      id,
      actor: entry.actor,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeJson: entry.before ? JSON.stringify(entry.before) : null,
      afterJson: entry.after ? JSON.stringify(entry.after) : null,
      groupId: entry.groupId ?? null,
      undoOfId: entry.undoOfId ?? null,
    },
  ]);
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

/** Rows per statement of the bulk reads in `revertCreations` (well below SQLite's variable limit). */
const BULK = 200;

/**
 * `insertTracked` for many rows (imports): the rows and their `create` entries go in through
 * reused prepared statements, in the order given. The same log as one call per row.
 */
export function insertManyTracked<T extends SQLiteTable>(
  db: Executor,
  table: T,
  rows: readonly T['$inferInsert'][],
  ctx: GroupedContext,
): void {
  const meta = tableMeta(table);
  if (meta.keyProps.length === 0) throw new Error(`No key on ${meta.name}`);
  const stored = insertRows(db, table, rows, { returning: true }) as Record<string, unknown>[];
  insertRows(
    db,
    auditLog,
    stored.map((r) => ({
      id: randomUUID(),
      actor: ctx.actor,
      action: 'create' as const,
      entityType: meta.name,
      entityId: entityIdOf(meta.keyProps.map((p) => r[p] as string | number)),
      beforeJson: null,
      afterJson: JSON.stringify(toSnapshot(meta, r)),
      groupId: ctx.groupId,
      undoOfId: null,
    })),
  );
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

function occurrenceBookingIds(entry: AuditEntry): string[] {
  if (entry.entityType !== getTableName(schema.expectedOccurrence)) return [];
  return [...new Set([entry.before?.['booking_id'], entry.after?.['booking_id']])].filter(
    (id): id is string => typeof id === 'string',
  );
}

/** A booking and the occurrence it changed are one user action when both were audited together. */
function isPartialExpectedPaymentUndo(tx: Executor, entry: AuditEntry): boolean {
  if (!entry.groupId) return false;
  const type = entry.entityType;
  const bookingType = getTableName(schema.booking);
  const splitType = getTableName(schema.bookingSplit);
  const occurrenceType = getTableName(schema.expectedOccurrence);
  const group = tx
    .select()
    .from(auditLog)
    .where(eq(auditLog.groupId, entry.groupId))
    .all()
    .map(parseEntry);
  if (type === bookingType || type === splitType) {
    const bookingId = type === bookingType ? entry.entityId : bookingOf(entry);
    if (!bookingId) return false;
    return group.some(
      (candidate) =>
        candidate.entityType === occurrenceType &&
        occurrenceBookingIds(candidate).includes(bookingId),
    );
  }
  if (type === occurrenceType) {
    const bookingIds = occurrenceBookingIds(entry);
    return group.some(
      (candidate) =>
        (candidate.entityType === bookingType || candidate.entityType === splitType) &&
        bookingIds.includes(bookingOf(candidate) ?? ''),
    );
  }
  return false;
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

/** `revertEntry` for many creations of one table with a single-column key, in chunks. */
function revertCreations(
  db: Executor,
  entries: AuditEntry[],
  ctx: GroupedContext,
  force: boolean,
): void {
  const meta = tableMeta(tableFor(entries[0]!.entityType));
  const keyProp = meta.keyProps[0]!;
  const keyColumn = meta.columns[keyProp]!;
  const read = (keys: string[]) =>
    new Map(
      (
        db.select().from(meta.table).where(inArray(keyColumn, keys)).all() as Record<
          string,
          unknown
        >[]
      ).map((r) => [String(r[keyProp]), toSnapshot(meta, r)]),
    );
  for (let i = 0; i < entries.length; i += BULK) {
    const chunk = entries.slice(i, i + BULK);
    const keys = chunk.map((e) => String(snapshotKey(meta, e.after!)[0]));
    const current = read(keys);
    if (!force)
      for (const e of chunk) {
        const now = current.get(String(snapshotKey(meta, e.after!)[0]));
        if (now === undefined || !snapshotsEqual(now, e.after!))
          throw new AuditError(
            `Cannot undo ${e.action} of ${e.entityType} ${e.entityId}: it changed after this entry`,
          );
      }
    const present = keys.filter((k) => current.has(k));
    if (present.length === 0) continue;
    if (meta.deletedAtProp) {
      const set: Record<string, unknown> = { [meta.deletedAtProp]: nowIso() };
      if (meta.updatedAtProp) set[meta.updatedAtProp] = nowIso();
      db.update(meta.table).set(set).where(inArray(keyColumn, present)).run();
    } else db.delete(meta.table).where(inArray(keyColumn, present)).run();
    const after = meta.deletedAtProp ? read(present) : new Map<string, Snapshot>();
    insertRows(
      db,
      auditLog,
      chunk
        .map((e) => ({ e, key: String(snapshotKey(meta, e.after!)[0]) }))
        .filter(({ key }) => current.has(key))
        .map(({ e, key }) => ({
          id: randomUUID(),
          actor: ctx.actor,
          action: 'undo' as const,
          entityType: e.entityType,
          entityId: e.entityId,
          beforeJson: JSON.stringify(current.get(key)),
          afterJson: after.has(key) ? JSON.stringify(after.get(key)) : null,
          groupId: ctx.groupId,
          undoOfId: e.id,
        })),
    );
  }
}

/** The booking an entry touches (a booking or one of its splits), if any. */
function bookingOf(entry: AuditEntry): string | undefined {
  const snapshot = entry.after ?? entry.before;
  if (entry.entityType === 'booking') return entry.entityId;
  if (entry.entityType === 'booking_split') return snapshot?.['booking_id'] as string | undefined;
  return undefined;
}

/**
 * Revert one audit entry, or all entries of a group in reverse order, inside one transaction
 * (all or nothing). Writes `undo` entries under a new shared group id. Refuses with `AuditError`
 * when an entity changed after the entry (current row differs from the entry's `after`
 * snapshot) unless `options.force` is set.
 *
 * Ledger invariants (C8): a split or a transfer leg can only be undone with its whole group (the
 * booking with its splits, both legs); a single entry is refused. After reverting, the split sums
 * and transfer pairs of every touched booking are checked in the same transaction, so an undo can
 * never leave unbalanced splits or a one-legged transfer (even with `force`).
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
    // Protocol state cannot be replayed by undo: callbacks are one-shot and remote consent is external.
    if (
      originals.some((entry) =>
        ['bank_sync_consent', 'bank_sync_candidate'].includes(entry.entityType),
      )
    )
      throw new AuditError(
        'Bank sync protocol history cannot be replayed. Pause or reconnect the source.',
      );
    for (const entry of originals.filter((e) => e.entityType === 'bank_sync_account')) {
      const linked = tx
        .select()
        .from(schema.bankSyncAccount)
        .where(eq(schema.bankSyncAccount.id, entry.entityId))
        .get();
      const parent =
        linked &&
        tx
          .select()
          .from(schema.bankSyncConsent)
          .where(eq(schema.bankSyncConsent.id, linked.consentId))
          .get();
      if (
        !entry.before ||
        !entry.after ||
        entry.before?.['request_count'] !== entry.after?.['request_count'] ||
        entry.before?.['request_day'] !== entry.after?.['request_day'] ||
        linked?.lastSyncAt ||
        (parent?.leaseUntil && parent.leaseUntil > nowIso())
      )
        throw new AuditError(
          'Cannot undo bank account mapping after a fetch or during a running sync.',
        );
    }
    if ('auditId' in target) {
      const [entry] = originals as [AuditEntry];
      const snapshot = entry.after ?? entry.before;
      if (
        entry.entityType === 'booking_split' ||
        (entry.entityType === 'booking' && snapshot?.['transfer_id'])
      ) {
        throw new AuditError(
          `Cannot undo a single ${entry.entityType} entry: undo the whole action (group ${entry.groupId ?? '?'})`,
        );
      }
      if (isPartialExpectedPaymentUndo(tx, entry)) {
        throw new AuditError(
          `Cannot undo a single ${entry.entityType} entry with its expected-payment link: undo the whole action (group ${entry.groupId ?? '?'})`,
        );
      }
    }
    const touched = originals.map(bookingOf).filter((id): id is string => id !== undefined);
    const expectedLinkBookings = new Set(touched);
    for (const entry of originals)
      for (const id of occurrenceBookingIds(entry)) expectedLinkBookings.add(id);
    // Runs of creations in one table (an import) are reverted in bulk, everything else one by one.
    const force = options.force ?? false;
    let batch: AuditEntry[] = [];
    const flush = () => {
      if (batch.length > 0) revertCreations(tx, batch, grouped, force);
      batch = [];
    };
    for (const entry of originals.reverse()) {
      const table = tableFor(entry.entityType);
      const bulk = entry.before === null && tableMeta(table).keyProps.length === 1;
      if (!bulk || (batch[0] && batch[0].entityType !== entry.entityType)) flush();
      if (bulk) batch.push(entry);
      else revertEntry(tx, entry, grouped, force);
    }
    flush();
    if (expectedLinkPatches(tx, [...expectedLinkBookings]).length > 0) {
      throw new AuditError(
        'Cannot undo: the result would leave an expected payment linked to a missing, deleted, or mismatched booking; undo the related booking and occurrence action together',
      );
    }
    for (const entry of originals.filter((e) => e.entityType === 'project')) {
      const retained = tx
        .select()
        .from(schema.project)
        .where(eq(schema.project.id, entry.entityId))
        .get();
      if (
        retained?.deletedAt &&
        tx
          .select({ id: schema.booking.id })
          .from(schema.booking)
          .where(
            and(eq(schema.booking.projectId, entry.entityId), isNull(schema.booking.deletedAt)),
          )
          .get()
      )
        throw new AuditError(
          'Projekt wird noch von Buchungen verwendet. Zuerst die Zuordnung rückgängig machen.',
        );
    }
    // Split audit entries repeat parent ids; keep bulk undo checks in bounded batches.
    const projectBookings = [...new Set(touched)];
    for (let i = 0; i < projectBookings.length; i += 400) {
      const missingProject = tx
        .select({ id: schema.booking.id })
        .from(schema.booking)
        .leftJoin(schema.project, eq(schema.project.id, schema.booking.projectId))
        .where(
          and(
            inArray(schema.booking.id, projectBookings.slice(i, i + 400)),
            isNull(schema.booking.deletedAt),
            isNotNull(schema.booking.projectId),
            or(isNull(schema.project.id), isNotNull(schema.project.deletedAt)),
          ),
        )
        .limit(1)
        .get();
      if (missingProject)
        throw new AuditError('Projekt der Buchung fehlt. Zuerst das Projekt wiederherstellen.');
    }
    if (originals.some((entry) => entry.entityType === 'bank_sync_account')) {
      const mappings = tx
        .select({ accountId: schema.bankSyncAccount.accountId })
        .from(schema.bankSyncAccount)
        .innerJoin(
          schema.bankSyncConsent,
          eq(schema.bankSyncConsent.id, schema.bankSyncAccount.consentId),
        )
        .where(inArray(schema.bankSyncConsent.status, ['active', 'error']))
        .all()
        .map((row) => row.accountId)
        .filter((id) => id !== null);
      if (new Set(mappings).size !== mappings.length)
        throw new AuditError('Cannot undo: an account would have two active bank sources.');
    }
    assertLedgerInvariants(tx, touched);
    assertContactUndoDependencies(tx, originals);
    const touchedAccounts = originals
      .filter((entry) => entry.entityType === getTableName(schema.account))
      .map((entry) => entry.entityId);
    assertEurBudgetAccounts(tx, touchedAccounts);
    assertAccountBookingCurrencies(tx, touchedAccounts);
    assertTradeSettlementInvariants(
      tx,
      touched,
      originals.filter((entry) => entry.entityType === 'trade').map((entry) => entry.entityId),
    );
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
