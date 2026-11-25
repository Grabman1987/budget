import { and, asc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
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

interface AuditEvent {
  id: string;
  sequence: number;
  ts: string;
  entityId: string;
  entityType: string;
  action: string;
  groupId: string | null;
  undoOfId: string | null;
  beforeExists: number;
  beforeLive: number;
  afterLive: number;
  financialChange: number;
  afterAccountId: string | null;
}

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
// Only a live-to-live booking edit uses this predicate below. CASE avoids extracting ten
// pairs of fields for creations, deletions and checkpoints, preserving scalar IS semantics.
// Project only predicates/identity, never whole private snapshots or money values into this model.
const financialChange = sql<boolean>`CASE WHEN ${auditLog.entityType} = 'booking'
    AND ${beforeLive} AND ${afterLive} THEN (${sql.join(
      moneyFields.map(
        (field) =>
          sql`json_extract(${auditLog.beforeJson}, ${`$.${field}`}) IS NOT json_extract(${auditLog.afterJson}, ${`$.${field}`})`,
      ),
      sql` OR `,
    )}) ELSE 0 END`.mapWith(Boolean);
const projection = {
  id: auditLog.id,
  sequence: sql<number>`${auditLog}.rowid`.as('sequence'),
  ts: auditLog.ts,
  entityId: sql<string>`${auditLog.entityId}`.as('entityId'),
  entityType: sql<string>`${auditLog.entityType}`.as('entityType'),
  action: auditLog.action,
  groupId: sql<string | null>`${auditLog.groupId}`.as('groupId'),
  undoOfId: sql<string | null>`${auditLog.undoOfId}`.as('undoOfId'),
  beforeExists: sql<number>`${auditLog.beforeJson} IS NOT NULL`.as('beforeExists'),
  beforeLive: beforeLive.as('beforeLive'),
  afterLive: afterLive.as('afterLive'),
  financialChange: financialChange.as('financialChange'),
  afterAccountId: sql<string | null>`json_extract(${auditLog.afterJson}, '$.account_id')`.as(
    'afterAccountId',
  ),
};

/** The reference reader: filters in SQL by the live bookings and the current checkpoints. */
function readReviewEventsUncached(
  db: Executor,
  eligible: SQL | undefined,
  reconciliations: string[],
  valuations: string[],
): AuditEvent[] {
  const eventQuery = db
    .select(projection)
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
    .orderBy(asc(sql`${auditLog}.rowid`));
  // SQLite already returns these projected primitives. Avoid ORM field/decoder mapping for
  // every audit row; the predicates are 0/1 and are consumed only as truth values below.
  return db.all<AuditEvent>(eventQuery.getSQL());
}

/**
 * The projection of one audit row depends on that row alone, and the audit log is append-only at
 * run time (nothing updates or deletes a row; migrations run before the server starts). So the
 * projected booking/checkpoint rows are kept per connection and only rows added since the last
 * read are fetched; which of them count is decided afterwards, in memory, from the live bookings
 * and the current checkpoints, exactly as the SQL filter of `readReviewEventsUncached` does. The
 * cache is trusted only while its prefix is provably the same (same number of audit rows up to
 * its last rowid, same id there; a rolled-back insert whose rowid was reused has a different id);
 * on any doubt or failure the reference reader answers, so results never depend on the cache.
 */
interface EventCache {
  events: AuditEvent[];
  lastRowid: number;
  lastId: string | null;
  total: number;
}
const eventCaches = new WeakMap<object, EventCache>();
const connectionOf = (db: Executor): object | undefined =>
  (db as unknown as { session?: { client?: object } }).session?.client;

/** Forget the cached events of a connection (tests). */
export function resetReviewEventCache(db: Executor): void {
  const connection = connectionOf(db);
  if (connection) eventCaches.delete(connection);
}

function cachedEvents(db: Executor): AuditEvent[] | null {
  const connection = connectionOf(db);
  if (!connection) return null;
  let cache = eventCaches.get(connection);
  if (cache) {
    // Rows up to the cached rowid = all rows minus the (few) rows after it: no table scan.
    const check = db.get<{ n: number; id: string | null }>(
      sql`SELECT (SELECT count(*) FROM audit_log) - (SELECT count(*) FROM audit_log WHERE rowid > ${cache.lastRowid}) AS n,
        (SELECT id FROM audit_log WHERE rowid = ${cache.lastRowid}) AS id`,
    );
    if (check?.n !== cache.total || check.id !== cache.lastId) cache = undefined;
  }
  const known: EventCache = cache ?? { events: [], lastRowid: 0, lastId: null, total: 0 };
  // Everything below is bounded by one `max(rowid)` so the cache never skips a concurrent commit.
  // Warm cache: the few rows after `lastRowid` are found by a rowid seek, which is instant. Cold
  // (first read of a connection, e.g. after the worker restarted): counting every row on the wide
  // table walked 130 MB (up to seconds); `audit_ts_idx` is a narrow covering index that holds every
  // rowid, so the count scans that instead. Both are bounded by one `max(rowid)`.
  const edge =
    known.lastRowid === 0
      ? db.get<{ m: number | null; n: number }>(
          sql`SELECT m, CASE WHEN m IS NULL THEN 0 ELSE (SELECT count(*) FROM audit_log INDEXED BY audit_ts_idx WHERE rowid <= m) END AS n
            FROM (SELECT max(rowid) AS m FROM audit_log)`,
        )
      : db.get<{ m: number | null; n: number }>(
          sql`SELECT max(rowid) AS m, count(*) AS n FROM audit_log WHERE rowid > ${known.lastRowid}`,
        );
  if (edge?.m != null) {
    const fresh = db.all<AuditEvent>(
      db
        .select(projection)
        .from(auditLog)
        .where(
          and(
            sql`${auditLog}.rowid > ${known.lastRowid} AND ${auditLog}.rowid <= ${edge.m}`,
            inArray(auditLog.entityType, ['booking', 'account_reconciliation', 'valuation']),
          ),
        )
        .orderBy(asc(sql`${auditLog}.rowid`))
        .getSQL(),
    );
    const last = db.get<{ id: string | null }>(
      sql`SELECT id FROM audit_log WHERE rowid = ${edge.m}`,
    );
    for (const event of fresh) known.events.push(event);
    known.lastRowid = edge.m;
    known.lastId = last?.id ?? null;
    known.total += edge.n;
  }
  eventCaches.set(connection, known);
  return known.events;
}

function readEvents(
  db: Executor,
  eligible: SQL | undefined,
  reconciliations: string[],
  valuations: string[],
  currentBookings: ReadonlyMap<string, unknown>,
): AuditEvent[] {
  let all: AuditEvent[] | null = null;
  try {
    all = cachedEvents(db);
  } catch {
    // A failing cache read proves nothing: drop it, the reference reader decides (and throws as before).
    const connection = connectionOf(db);
    if (connection) eventCaches.delete(connection);
  }
  if (!all) return readReviewEventsUncached(db, eligible, reconciliations, valuations);
  const recon = new Set(reconciliations);
  const valued = new Set(valuations);
  return all.filter((e) =>
    e.entityType === 'booking'
      ? currentBookings.has(e.entityId)
      : e.entityType === 'account_reconciliation'
        ? recon.has(e.entityId)
        : valued.has(e.entityId),
  );
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
  const currentBookings = new Map(live.map((row) => [row.id, row]));
  const events = readEvents(db, eligible, reconciliations, valuations, currentBookings);

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
