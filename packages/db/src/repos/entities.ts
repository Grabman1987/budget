import { assertContactSettlementInvariants } from './contact-invariants';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull, type SQL } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { account, assetClass, category, valuation } from '../schema';
import { insertTracked, tableMeta, updateTracked, withGroup, type AuditContext } from './audit';
import { BookingInvariantError, EntityNotFoundError } from './errors';
import { assertAccountBookingCurrencies, assertBudgetAccountCurrency } from './account-invariants';
import { runInTransaction, type Executor } from './types';

/**
 * Generic repository for simple id-keyed tables (category, category_group, payee, contact,
 * institution, account, project, savings_goal, security, asset_class, expected_payment(+version),
 * planned_event, rule, ...). Every write is audited (before/after snapshots) and `undo`-able;
 * `updated_at` is maintained; reads hide soft-deleted rows unless `{ includeDeleted: true }`.
 */
export type IdTable = SQLiteTable & { id: SQLiteColumn };

type Managed = 'id' | 'createdAt' | 'updatedAt' | 'deletedAt';
/** Insert values; `id` is generated when omitted, timestamps are managed. */
export type NewRow<T extends IdTable> = Omit<T['$inferInsert'], Managed> & { id?: string };
/** Column changes accepted by `updateEntity`. */
export type RowPatch<T extends IdTable> = Partial<Omit<T['$inferInsert'], Managed>>;
export interface ReadOptions {
  includeDeleted?: boolean;
}
export interface ListOptions extends ReadOptions {
  /** Override the default ordering (by primary key). */
  orderBy?: SQL[];
}

const notDeleted = (table: IdTable, includeDeleted: boolean | undefined): SQL | undefined => {
  const prop = tableMeta(table).deletedAtProp;
  return includeDeleted || !prop ? undefined : isNull(tableMeta(table).columns[prop]!);
};

function assertAllocationScope(type: string | undefined, scope: string | undefined) {
  if (
    scope === 'included' &&
    ['credit_card', 'loan', 'other_liability', 'receivable'].includes(type ?? '')
  )
    throw new BookingInvariantError(
      'Schuld-, Kreditkarten- und Forderungskonten gehören nicht zum Anlageuniversum.',
    );
}

function assertAllocationClass(db: Executor, id: string | null | undefined) {
  if (
    id &&
    !db
      .select()
      .from(assetClass)
      .where(
        and(eq(assetClass.id, id), isNull(assetClass.deletedAt), eq(assetClass.isGroup, false)),
      )
      .get()
  )
    throw new BookingInvariantError('Bitte eine vorhandene aktive Anlageklasse wählen.');
}

/** Insert a row (audit `create`). Returns the stored row. */
export function createEntity<T extends IdTable>(
  db: Executor,
  table: T,
  values: NewRow<T>,
  ctx: AuditContext,
): T['$inferSelect'] {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    if (tableMeta(table).name === tableMeta(account).name) {
      const row = values as Partial<typeof account.$inferInsert>;
      assertBudgetAccountCurrency(row.onBudget ?? false, row.currency ?? 'EUR');
      assertAllocationClass(tx, row.allocationAssetClassId);
      assertAllocationScope(row.type, row.allocationScope);
    }
    return insertTracked(
      tx,
      table,
      { ...values, id: values.id ?? randomUUID() } as T['$inferInsert'],
      grouped,
    );
  });
}

/** One row by id; soft-deleted rows only with `includeDeleted`. */
export function getEntity<T extends IdTable>(
  db: Executor,
  table: T,
  id: string,
  options: ReadOptions = {},
): T['$inferSelect'] | undefined {
  return db
    .select()
    .from(table)
    .where(and(eq(table.id, id), notDeleted(table, options.includeDeleted)))
    .get() as T['$inferSelect'] | undefined;
}

/** All rows, ordered by primary key unless `orderBy` is given. */
export function listEntities<T extends IdTable>(
  db: Executor,
  table: T,
  options: ListOptions = {},
): T['$inferSelect'][] {
  return db
    .select()
    .from(table)
    .where(notDeleted(table, options.includeDeleted))
    .orderBy(...(options.orderBy ?? [asc(table.id)]))
    .all() as T['$inferSelect'][];
}

function requireLive<T extends IdTable>(db: Executor, table: T, id: string): T['$inferSelect'] {
  const row = getEntity(db, table, id);
  if (!row) throw new EntityNotFoundError(tableMeta(table).name, id);
  return row;
}

/** Change columns of a live row (audit `update`). Returns the updated row. */
export function updateEntity<T extends IdTable>(
  db: Executor,
  table: T,
  id: string,
  patch: RowPatch<T>,
  ctx: AuditContext,
): T['$inferSelect'] {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const current = requireLive(tx, table, id);
    if (tableMeta(table).name === tableMeta(account).name) {
      const before = current as typeof account.$inferSelect;
      const change = patch as Partial<typeof account.$inferInsert>;
      if (
        change.currency !== undefined &&
        change.currency !== before.currency &&
        tx.select({ id: valuation.id }).from(valuation).where(eq(valuation.accountId, id)).get()
      )
        throw new BookingInvariantError(
          'Die Kontowährung kann nach der ersten Bewertung nicht geändert werden.',
        );
      assertAllocationClass(tx, change.allocationAssetClassId);
      assertAllocationScope(
        change.type ?? before.type,
        change.allocationScope ?? before.allocationScope,
      );
      assertBudgetAccountCurrency(
        change.onBudget ?? before.onBudget,
        change.currency ?? before.currency,
      );
    }
    updateTracked(tx, table, [id], patch as Record<string, unknown>, grouped);
    if (
      tableMeta(table).name === tableMeta(account).name &&
      (patch as Partial<typeof account.$inferInsert>).currency !== undefined &&
      (patch as Partial<typeof account.$inferInsert>).currency !==
        (current as typeof account.$inferSelect).currency
    )
      assertAccountBookingCurrencies(tx, [id]);
    if (['account', 'contact', 'category'].includes(tableMeta(table).name))
      assertContactSettlementInvariants(tx);
    return requireLive(tx, table, id);
  });
}

/** Set `deleted_at` (audit `delete`). Nothing is ever hard-deleted. */
export function softDeleteEntity<T extends IdTable>(
  db: Executor,
  table: T,
  id: string,
  ctx: AuditContext,
): void {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    requireLive(tx, table, id);
    updateTracked(tx, table, [id], { deletedAt: new Date().toISOString() }, grouped, 'delete');
    if (['account', 'contact', 'category'].includes(tableMeta(table).name))
      assertContactSettlementInvariants(tx);
  });
}

/** Clear `deleted_at` of a soft-deleted row (audit `restore`). */
export function restoreEntity<T extends IdTable>(
  db: Executor,
  table: T,
  id: string,
  ctx: AuditContext,
): T['$inferSelect'] {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const row = getEntity(tx, table, id, { includeDeleted: true }) as
      { deletedAt?: string | null } | undefined;
    if (!row || row.deletedAt == null)
      throw new EntityNotFoundError(`${tableMeta(table).name} (deleted)`, id);
    if (tableMeta(table).name === tableMeta(account).name) {
      const accountRow = row as typeof account.$inferSelect;
      assertBudgetAccountCurrency(accountRow.onBudget, accountRow.currency);
    }
    updateTracked(tx, table, [id], { deletedAt: null }, grouped, 'restore');
    if (tableMeta(table).name === tableMeta(account).name) assertAccountBookingCurrencies(tx, [id]);
    if (['account', 'contact', 'category'].includes(tableMeta(table).name))
      assertContactSettlementInvariants(tx);
    return requireLive(tx, table, id);
  });
}

/** Bind the generic functions to one table (typed thin wrapper). */
export function entityRepo<T extends IdTable>(table: T, defaultOrder: (t: T) => SQL[]) {
  return {
    table,
    create: (db: Executor, values: NewRow<T>, ctx: AuditContext) =>
      createEntity(db, table, values, ctx),
    get: (db: Executor, id: string, options?: ReadOptions) => getEntity(db, table, id, options),
    list: (db: Executor, options: ListOptions = {}) =>
      listEntities(db, table, { orderBy: defaultOrder(table), ...options }),
    update: (db: Executor, id: string, patch: RowPatch<T>, ctx: AuditContext) =>
      updateEntity(db, table, id, patch, ctx),
    softDelete: (db: Executor, id: string, ctx: AuditContext) =>
      softDeleteEntity(db, table, id, ctx),
    restore: (db: Executor, id: string, ctx: AuditContext) => restoreEntity(db, table, id, ctx),
  };
}

/** Accounts, ordered by `sort_order`, then name. Role and terms are plain columns of `NewRow`. */
export const accounts = entityRepo(account, (t) => [asc(t.sortOrder), asc(t.name), asc(t.id)]);
/** Categories, ordered by `sort_order`, then name. */
export const categories = entityRepo(category, (t) => [asc(t.sortOrder), asc(t.name), asc(t.id)]);
