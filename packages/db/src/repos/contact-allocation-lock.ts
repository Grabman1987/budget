import { eq } from 'drizzle-orm';
import { appSetting } from '../schema';
import { insertTracked, updateTracked, type GroupedContext } from './audit';
import type { Executor } from './types';

export interface ContactAllocationOptions {
  unlock?: boolean;
  unlockBookingIds?: ReadonlySet<string>;
}
export const CONTACT_UNLOCK_PREFIX = 'contacts.allocation-unlock.';
/** Audited owner confirmation to edit an outlay that a repayment allocates (#1108). */
export const CONTACT_LINKED_OVERRIDE_PREFIX = 'contacts.linked-override.';

/** Authorization belongs to this action's audit group, never to the bank booking status. */
export function recordContactAllocationUnlock(
  db: Executor,
  ctx: GroupedContext,
  bookingId?: string,
) {
  const id = `${CONTACT_UNLOCK_PREFIX}${ctx.groupId}`;
  const current = db.select().from(appSetting).where(eq(appSetting.id, id)).get();
  const previous = current
    ? (JSON.parse(current.value) as { bookingIds: string[] })
    : { bookingIds: [] };
  const bookingIds = [...new Set([...previous.bookingIds, ...(bookingId ? [bookingId] : [])])];
  const value = JSON.stringify({ allocationOnly: true, bookingIds });
  if (current) {
    if (value !== current.value) updateTracked(db, appSetting, [id], { value }, ctx);
  } else insertTracked(db, appSetting, { id, value }, ctx);
}
