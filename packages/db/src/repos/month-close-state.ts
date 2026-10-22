import { addMonths, lastDayOfMonth } from '@budget/domain';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Executor } from './types';

export interface MonthCloseAuditScope {
  month: string;
  accountIds: readonly string[];
}

/** Same retained-event predicate for singleton close reads and batched reminder comparisons. */
export function monthCloseAuditCounts(db: Executor, scopes: readonly MonthCloseAuditScope[]): ReadonlyMap<string, number> {
  if (scopes.length === 0) return new Map();
  if (new Set(scopes.map((scope) => scope.month)).size !== scopes.length)
    throw new RangeError('Duplicate close audit month');
  const wanted = JSON.stringify(scopes.map(({ month, accountIds }) => ({
    month,
    nextMonth: addMonths(month, 1),
    end: lastDayOfMonth(month),
    accountIds: [...new Set(accountIds)].sort(),
  })));
  // Each wanted month joins each audit at most once: parent/account membership stays EXISTS/IN,
  // not a multiplicative join. A retained event may legitimately contribute to several months.
  const rows = db.all<{ month: string; count: number }>(sql`
    WITH wanted AS (
      SELECT json_extract(value, '$.month') AS month,
        json_extract(value, '$.nextMonth') AS next_month,
        json_extract(value, '$.end') AS end_day,
        json_extract(value, '$.accountIds') AS account_ids
      FROM json_each(${wanted})
    )
    SELECT w.month AS month, COUNT(a.id) AS count
    FROM wanted w LEFT JOIN audit_log a ON (
      (a.entity_type = 'booking' AND
        (substr(json_extract(a.before_json, '$.date'), 1, 7) = w.month
         OR substr(json_extract(a.after_json, '$.date'), 1, 7) = w.month))
      OR (a.entity_type IN ('envelope_month', 'budget_month') AND
        (json_extract(a.before_json, '$.month') <= w.next_month
         OR json_extract(a.after_json, '$.month') <= w.next_month))
      OR (a.entity_type = 'account' AND a.entity_id IN (SELECT value FROM json_each(w.account_ids)))
      OR (a.entity_type = 'account_reconciliation' AND
        (json_extract(a.before_json, '$.account_id') IN (SELECT value FROM json_each(w.account_ids))
         OR json_extract(a.after_json, '$.account_id') IN (SELECT value FROM json_each(w.account_ids))))
      OR (a.entity_type = 'valuation' AND
        ((json_extract(a.before_json, '$.account_id') IN (SELECT value FROM json_each(w.account_ids))
          AND json_extract(a.before_json, '$.date') <= w.end_day)
         OR (json_extract(a.after_json, '$.account_id') IN (SELECT value FROM json_each(w.account_ids))
          AND json_extract(a.after_json, '$.date') <= w.end_day)))
      OR (a.entity_type = 'booking_split' AND (
        EXISTS (SELECT 1 FROM booking b WHERE b.id IN
          (json_extract(a.before_json, '$.booking_id'), json_extract(a.after_json, '$.booking_id'))
          AND substr(b.date, 1, 7) = w.month)
        OR EXISTS (SELECT 1 FROM audit_log parent WHERE parent.entity_type = 'booking'
          AND parent.entity_id IN
            (json_extract(a.before_json, '$.booking_id'), json_extract(a.after_json, '$.booking_id'))
          AND (substr(json_extract(parent.before_json, '$.date'), 1, 7) = w.month
            OR substr(json_extract(parent.after_json, '$.date'), 1, 7) = w.month))
      ))
    ) GROUP BY w.month ORDER BY w.month
  `);
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.count) || row.count < 0) throw new RangeError('Invalid month audit count');
    counts.set(row.month, row.count);
  }
  if (counts.size !== scopes.length) throw new RangeError('Incomplete month audit count');
  return counts;
}

/** Version/property order is the stored #600/#602 snapshot contract; never change on read. */
export function monthCloseRevisionFromCount(month: string, facts: unknown, eventCount: number): string {
  if (!Number.isSafeInteger(eventCount) || eventCount < 0) throw new RangeError('Invalid month audit count');
  return createHash('sha256').update(JSON.stringify({ version: 1, month, eventCount, facts })).digest('hex');
}

/**
 * Retained booking/split and planning/account audits supply the original ABA fence. Before/after
 * dates include moves out of the month. Only counts leave SQLite, never private audit snapshots.
 */
export function monthCloseSourceRevision(db: Executor, month: string, facts: unknown,
  accountIds: readonly string[] = [],
): string {
  const count = monthCloseAuditCounts(db, [{ month, accountIds }]).get(month);
  if (count === undefined) throw new RangeError('Invalid month audit count');
  return monthCloseRevisionFromCount(month, facts, count);
}
