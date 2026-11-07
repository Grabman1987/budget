import { getBooking, readBookingBulkSelection, type Executor } from '@budget/db';
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const notePreviewBody = z
  .object({
    ids: z.array(z.string().min(1).max(64)).min(1).max(500),
    memo: z.string().max(500).nullable(),
  })
  .strict();

/** Call within the same transaction as validation/writes; snapshots never leave this hash. */
export function bookingNotePreview(tx: Executor, requested: string[], memo: string | null) {
  const ids = [...new Set(requested)].sort();
  const selection = readBookingBulkSelection(tx, ids, 'memo');
  const source = ids.map((id) => getBooking(tx, id));
  const byId = new Map(selection.items.map((item) => [item.id, item]));
  const changed: string[] = [];
  const unchanged: string[] = [];
  const skipped = ids.flatMap((id, index) => {
    const booking = byId.get(id);
    const reason = booking?.reason ?? (booking ? null : 'not_found');
    if (reason)
      return [
        {
          id,
          reason,
          message: 'Protected or unavailable booking left unchanged',
          ...(booking ? { booking } : {}),
        },
      ];
    if (source[index]?.memo === memo) unchanged.push(id);
    else changed.push(id);
    return [];
  });
  // Includes Undo and unrelated writes: a conservative ABA/retry fence, like delete-preview.
  const head =
    tx.get<{ ordinal: string; id: string }>(
      sql`SELECT CAST(rowid AS TEXT) AS ordinal,id FROM audit_log ORDER BY rowid DESC LIMIT 1`,
    ) ?? null;
  const revision = createHash('sha256')
    .update(JSON.stringify(['booking-note-v1', ids, memo, head, source, selection]))
    .digest('hex');
  return { ids, memo, selection, changed, unchanged, skipped, revision };
}
