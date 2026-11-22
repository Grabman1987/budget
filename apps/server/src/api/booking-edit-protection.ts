import {
  assertContactBookingWrite,
  BOOKING_OVERRIDE_PREFIX,
  BOOKING_REVIEW_PREFIX,
  bookingReviewedOn,
  BookingInvariantError,
  connectedTransferBookings,
  ContactLinkedError,
  getBooking,
  insertTracked,
  linkedRepayments,
  schema,
  type GroupedContext,
  type Executor,
} from '@budget/db';
import { sql } from 'drizzle-orm';

const RECONCILIATION_OVERRIDE_REASON = 'Kontostand abgeglichen, Änderung bestätigt';

/** Only report a check date when the audit records this booking in the check's own group. */
export function readBookingEditProtection(db: Executor, id: string) {
  const source = getBooking(db, id);
  if (!source) return null;
  const transfer = source.transferId || source.splits.some((s) => s.transferId);
  const ids = transfer ? connectedTransferBookings(db, id) : [id];
  const reconciledIds = ids.filter((member) => getBooking(db, member)?.status === 'reconciled');
  let settlementDates: string[] = [];
  if (source.splits.some((split) => split.contactId && split.amountCents < 0)) {
    try {
      assertContactBookingWrite(db, id, 'delete');
    } catch (error) {
      if (!(error instanceof BookingInvariantError)) throw error;
      if (error instanceof ContactLinkedError) settlementDates = error.settlementDates;
    }
  }
  const reconciliationDates = reconciledIds.flatMap((member) => {
    const row = db.get<{ date: string }>(sql`
      SELECT r.date FROM audit_log AS stamp
      JOIN audit_log AS check_entry ON check_entry.group_id = stamp.group_id
        AND check_entry.entity_type = 'account_reconciliation'
      JOIN account_reconciliation AS r ON r.id = check_entry.entity_id
        AND r.account_id = json_extract(stamp.after_json, '$.account_id')
        AND r.deleted_at IS NULL
      WHERE stamp.entity_type = 'booking' AND stamp.entity_id = ${member}
        AND json_extract(stamp.after_json, '$.status') = 'reconciled'
        AND json_extract(stamp.before_json, '$.status') IS NOT 'reconciled'
      ORDER BY stamp.rowid DESC LIMIT 1
    `);
    return row ? [row.date] : [];
  });
  return {
    reconciled: reconciledIds.length > 0,
    reconciliationDates: [...new Set(reconciliationDates)].sort(),
    reviewedOn: [...new Set(ids.flatMap((member) => bookingReviewedOn(db, member) ?? []))].sort(),
    settlementDates,
    reconciledRepayment:
      settlementDates.length > 0 &&
      linkedRepayments(db, id).some((row) => row.status === 'reconciled'),
  };
}

/** Record actual protected mutations in their own audit group, including a changed transfer leg. */
export function auditBookingOverride(
  db: Executor,
  ctx: GroupedContext,
  operation: 'update' | 'delete',
  reason?: string,
  protectedSource?: { id: string; reconciled: boolean },
) {
  const rows = db.all<{ id: string; reconciled: number }>(sql`
    SELECT DISTINCT entry.entity_id AS id,
      json_extract(entry.before_json, '$.status') = 'reconciled' AS reconciled
    FROM audit_log AS entry
    LEFT JOIN app_setting AS review ON review.id = ${BOOKING_REVIEW_PREFIX} || entry.entity_id
    WHERE entry.group_id = ${ctx.groupId} AND entry.entity_type = 'booking'
      AND (json_extract(entry.before_json, '$.status') = 'reconciled' OR review.id IS NOT NULL)
    ORDER BY id
  `);
  // Split-only edits and schedule creation can write without changing the booking row.
  const source =
    protectedSource &&
    db.get(sql`
    SELECT 1 FROM audit_log WHERE group_id = ${ctx.groupId}
      AND entity_type IN ('booking_split', 'expected_payment') LIMIT 1
  `)
      ? protectedSource
      : undefined;
  const bookingIds = [
    ...new Set([...rows.map((row) => row.id), ...(source ? [source.id] : [])]),
  ].sort();
  if (!bookingIds.length) return;
  insertTracked(
    db,
    schema.appSetting,
    {
      id: `${BOOKING_OVERRIDE_PREFIX}${ctx.groupId}`,
      value: JSON.stringify({
        bookingIds,
        reconciledBookingIds: bookingIds.filter(
          (id) =>
            (source?.id === id && source.reconciled) ||
            rows.some((row) => row.id === id && row.reconciled),
        ),
        operation,
        reason:
          reason ??
          (source?.reconciled || rows.some((row) => row.reconciled)
            ? RECONCILIATION_OVERRIDE_REASON
            : 'In Prüfen bestätigt, Änderung bestätigt'),
      }),
    },
    ctx,
  );
}
