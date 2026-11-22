import { eq } from 'drizzle-orm';
import { appSetting } from '../schema';
import { insertTracked, updateTracked, type AuditContext } from './audit';
import type { Executor } from './types';

export const BOOKING_REVIEW_PREFIX = 'ledger.booking-review.';
export const BOOKING_OVERRIDE_PREFIX = 'ledger.reconciled-override.';

export function bookingReviewedOn(db: Executor, id: string) {
  return db
    .select({ date: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.id, `${BOOKING_REVIEW_PREFIX}${id}`))
    .get()?.date;
}

/** Store the owner's acceptance with the status change so both are undone together. */
export function recordBookingReview(
  db: Executor,
  bookingId: string,
  date: string,
  ctx: AuditContext,
) {
  const id = `${BOOKING_REVIEW_PREFIX}${bookingId}`;
  if (bookingReviewedOn(db, bookingId)) updateTracked(db, appSetting, [id], { value: date }, ctx);
  else insertTracked(db, appSetting, { id, value: date }, ctx);
}
