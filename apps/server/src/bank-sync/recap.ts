import { readInbox, schema, type Db } from '@budget/db';
import { and, eq, inArray, sql } from 'drizzle-orm';

/** Read the exact successful account batch from existing protocol audit provenance. */
export function bankRecapEntryIds(db: Db, sourceId: string, syncedAt: string): string[] | null {
  const { auditLog, bankSyncCandidate, booking } = schema;
  const batches = db
    .select({ groupId: auditLog.groupId })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, 'bank_sync_account'),
        eq(auditLog.entityId, sourceId),
        eq(auditLog.actor, 'bank-sync'),
        eq(auditLog.action, 'update'),
        sql`json_extract(${auditLog.afterJson}, '$.last_sync_at') = ${syncedAt}`,
        sql`json_extract(${auditLog.beforeJson}, '$.last_sync_at') IS NOT ${syncedAt}`,
      ),
    )
    .all();
  if (batches.length !== 1 || !batches[0]?.groupId) return null;
  const candidates = db
    .select({ id: bankSyncCandidate.id, dedupeKey: bankSyncCandidate.dedupeKey })
    .from(bankSyncCandidate)
    .innerJoin(auditLog, eq(auditLog.entityId, bankSyncCandidate.id))
    .where(
      and(
        eq(bankSyncCandidate.sourceId, sourceId),
        eq(auditLog.groupId, batches[0].groupId),
        eq(auditLog.entityType, 'bank_sync_candidate'),
        eq(auditLog.action, 'create'),
      ),
    )
    .all();
  if (!candidates.length) return [];
  const bookings = db
    .select({ id: booking.id })
    .from(booking)
    .innerJoin(
      bankSyncCandidate,
      and(
        eq(booking.accountId, bankSyncCandidate.accountId),
        sql`${booking.importKey} = 'bank-sync:' || ${bankSyncCandidate.dedupeKey}`,
      ),
    )
    .where(
      inArray(
        bankSyncCandidate.id,
        candidates.map((row) => row.id),
      ),
    )
    .all();
  return [...candidates.map((row) => row.id), ...bookings.map((row) => 'booking:' + row.id)];
}

export function readBankSyncRecap(db: Db, today: string) {
  const openIds = new Set(readInbox(db, today).entries.map((entry) => entry.id));
  const accounts = db
    .select({
      sourceId: schema.bankSyncAccount.id,
      name: schema.account.name,
      sourceName: schema.bankSyncAccount.label,
      syncedAt: schema.bankSyncAccount.lastSyncAt,
      result: schema.bankSyncAccount.lastResult,
      running: schema.bankSyncConsent.leaseUntil,
      status: schema.bankSyncConsent.status,
    })
    .from(schema.bankSyncAccount)
    .innerJoin(
      schema.bankSyncConsent,
      eq(schema.bankSyncConsent.id, schema.bankSyncAccount.consentId),
    )
    .leftJoin(schema.account, eq(schema.account.id, schema.bankSyncAccount.accountId))
    .all()
    .map(({ running, ...row }) => {
      const ids = row.syncedAt ? bankRecapEntryIds(db, row.sourceId, row.syncedAt) : null;
      return {
        ...row,
        name: row.name ?? row.sourceName,
        open: ids === null ? null : ids.filter((id) => openIds.has(id)).length,
        running: Boolean(running && running > new Date().toISOString()),
      };
    });
  return { accounts };
}
