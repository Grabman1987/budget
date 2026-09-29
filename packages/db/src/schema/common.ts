import { sql, type SQL } from 'drizzle-orm';
import { check, integer, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

/**
 * Conventions (SPEC §5):
 * - money is an integer number of cents (`*_cents`), never a float; rates are basis points (`*_bp`),
 *   exchange rates and prices are integer micro-units (`*_micro`), units are 1e-8 (`*_e8`);
 * - dates are ISO text (`YYYY-MM-DD`), timestamps ISO 8601 UTC text;
 * - nothing is hard-deleted: entity tables carry `deleted_at` (soft delete) and every change is
 *   recorded in `audit_log`.
 */

export const nowSql = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

/** `created_at`, `updated_at`, `deleted_at` for entity tables. */
export const timestamps = () => ({
  createdAt: text('created_at').notNull().default(nowSql),
  updatedAt: text('updated_at').notNull().default(nowSql),
  deletedAt: text('deleted_at'),
});

export const id = () => text('id').primaryKey();

export const cents = (name: string) => integer(name, { mode: 'number' });

/** CHECK constraint that keeps a text column inside a fixed set of values. */
export function oneOf(name: string, column: AnySQLiteColumn, values: readonly string[]) {
  const list = sql.raw(values.map((v) => `'${v}'`).join(', '));
  return check(name, sql`${column} IN (${list})` as SQL);
}
