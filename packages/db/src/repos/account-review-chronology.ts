import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { account, auditLog, booking } from '../schema';
import type { Executor } from './types';

export interface ReviewCheckpoint {
  id: string;
  accountId: string;
  entityType: 'account_reconciliation' | 'valuation';
  date: string;
  createdAt: string;
}

interface CheckEvent {
  sequence: number;
  ts: string;
  groupId: string | null;
}

/** Read-only chronology: statement dates and actual user ceremonies are different clocks. */
export function accountReviewChronology(
  db: Executor,
  today: string,
  checkpoints: ReadonlyMap<string, ReviewCheckpoint>,
) {
  const eligible = and(
    isNull(booking.deletedAt),
    isNull(account.deletedAt),
    isNull(account.closedAt),
    gte(booking.date, account.openingDate),
    lte(booking.date, today),
  );
  const live = db
    .select({
      id: booking.id,
      accountId: booking.accountId,
      date: booking.date,
      createdAt: booking.createdAt,
    })
    .from(booking)
    .innerJoin(account, eq(account.id, booking.accountId))
    .where(eligible)
    .all();
  const checks = [...checkpoints.values()];
  const reconciliations = checks
    .filter((c) => c.entityType === 'account_reconciliation')
    .map((c) => c.id);
  const valuations = checks.filter((c) => c.entityType === 'valuation').map((c) => c.id);
  const beforeLive =
    sql<boolean>`(${auditLog.beforeJson} IS NOT NULL AND json_extract(${auditLog.beforeJson}, '$.deleted_at') IS NULL)`.mapWith(
      Boolean,
    );
  const afterLive =
    sql<boolean>`(${auditLog.afterJson} IS NOT NULL AND json_extract(${auditLog.afterJson}, '$.deleted_at') IS NULL)`.mapWith(
      Boolean,
    );
  const moneyFields = [
    'account_id',
    'date',
    'amount_cents',
    'status',
    'currency',
    'original_amount_cents',
    'original_currency',
    'fx_rate_micro',
    'fx_fee_cents',
    'transfer_id',
  ];
  // Project only predicates/identity, never whole private snapshots or money values into this model.
  const financialChange = sql<boolean>`(${sql.join(
    moneyFields.map(
      (field) =>
        sql`json_extract(${auditLog.beforeJson}, ${`$.${field}`}) IS NOT json_extract(${auditLog.afterJson}, ${`$.${field}`})`,
    ),
    sql` OR `,
  )})`.mapWith(Boolean);
  const events = db
    .select({
      id: auditLog.id,
      sequence: sql<number>`${auditLog}.rowid`.mapWith(Number),
      ts: auditLog.ts,
      entityId: auditLog.entityId,
      entityType: auditLog.entityType,
      action: auditLog.action,
      groupId: auditLog.groupId,
      undoOfId: auditLog.undoOfId,
      beforeExists: sql<boolean>`${auditLog.beforeJson} IS NOT NULL`.mapWith(Boolean),
      beforeLive,
      afterLive,
      financialChange,
      afterAccountId: sql<string | null>`json_extract(${auditLog.afterJson}, '$.account_id')`,
    })
    .from(auditLog)
    .leftJoin(booking, and(eq(auditLog.entityType, 'booking'), eq(auditLog.entityId, booking.id)))
    .leftJoin(account, eq(account.id, booking.accountId))
    .where(
      or(
        and(eq(auditLog.entityType, 'booking'), eligible),
        reconciliations.length
          ? and(
              eq(auditLog.entityType, 'account_reconciliation'),
              inArray(auditLog.entityId, reconciliations),
            )
          : undefined,
        valuations.length
          ? and(eq(auditLog.entityType, 'valuation'), inArray(auditLog.entityId, valuations))
          : undefined,
      ),
    )
    .orderBy(asc(sql`${auditLog}.rowid`))
    .all();

  const checkpointKey = (type: string, id: string) => `${type}:${id}`;
  const currentCheck = new Map<string, CheckEvent | null>();
  const beforeCheck = new Map<string, CheckEvent | null>();
  const originalReconciliation = new Map<string, CheckEvent>();
  const roots = new Map<string, { groupId: string | null }>();
  for (const event of events) {
    const root = event.undoOfId ? roots.get(event.undoOfId) : { groupId: event.groupId };
    if (root) roots.set(event.id, root);
    if (event.entityType === 'booking') continue;
    const key = checkpointKey(event.entityType, event.entityId);
    const previous = currentCheck.get(key) ?? null;
    beforeCheck.set(event.id, previous);
    let next = previous;
    if (event.action === 'undo') {
      // Redo returns the original ceremony, not the timestamp/ordinal of its replay.
      next = event.undoOfId ? (beforeCheck.get(event.undoOfId) ?? null) : null;
    } else if (event.afterLive) {
      if (event.entityType === 'account_reconciliation') {
        if (!event.beforeExists) {
          next = { sequence: event.sequence, ts: event.ts, groupId: event.groupId };
          originalReconciliation.set(key, next);
        } else if (event.action === 'restore' && next === null) {
          next = originalReconciliation.get(key) ?? null;
        }
      } else if (event.action !== 'restore') {
        // An explicit later valuation save on the same row is a real new check.
        next = { sequence: event.sequence, ts: event.ts, groupId: event.groupId };
      }
    }
    currentCheck.set(key, next);
  }

  const evidence = new Map<
    string,
    {
      bookingCount: number;
      lastBookingOn: string | null;
      activityAfterCheck: boolean;
    }
  >();
  const eventfulBookings = new Set<string>();
  const currentBookings = new Map(live.map((row) => [row.id, row]));
  for (const row of live) {
    const value = evidence.get(row.accountId) ?? {
      bookingCount: 0,
      lastBookingOn: null,
      activityAfterCheck: false,
    };
    value.bookingCount++;
    if (value.lastBookingOn === null || row.date > value.lastBookingOn)
      value.lastBookingOn = row.date;
    const check = checkpoints.get(row.accountId);
    // A later booked date is outside the statement even when it was entered before the ceremony.
    if (check && row.date > check.date) value.activityAfterCheck = true;
    evidence.set(row.accountId, value);
  }
  for (const event of events) {
    if (
      event.entityType !== 'booking' ||
      !event.afterLive ||
      (event.beforeLive && !event.financialChange)
    )
      continue;
    const row = currentBookings.get(event.entityId);
    if (!row || event.afterAccountId !== row.accountId) continue;
    eventfulBookings.add(row.id);
    const check = checkpoints.get(row.accountId);
    if (!check) continue;
    const boundary = currentCheck.get(checkpointKey(check.entityType, check.id));
    const root = roots.get(event.id);
    if (boundary?.groupId && root?.groupId === boundary.groupId) continue;
    const later = boundary ? event.sequence > boundary.sequence : event.ts >= check.createdAt;
    if (later) evidence.get(row.accountId)!.activityAfterCheck = true;
  }
  for (const row of live) {
    if (eventfulBookings.has(row.id)) continue;
    const check = checkpoints.get(row.accountId);
    if (!check) continue;
    const boundary = currentCheck.get(checkpointKey(check.entityType, check.id));
    // Old unaudited rows have no insertion ordering. A tied/unknown timestamp cannot prove quiet.
    if (row.createdAt >= (boundary?.ts ?? check.createdAt))
      evidence.get(row.accountId)!.activityAfterCheck = true;
  }
  return evidence;
}
