import { getBooking, readBookingBulkSelection, type Executor } from '@budget/db';
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { day } from './schemas';

export const notePreviewBody = z
  .object({
    ids: z.array(z.string().min(1).max(64)).min(1).max(500),
    memo: z.string().max(500).nullable(),
  })
  .strict();
export const datePreviewBody = z.object({ ids: notePreviewBody.shape.ids, date: day }).strict();
export const payeePreviewBody = z
  .object({ ids: notePreviewBody.shape.ids, payeeId: z.string().min(1).max(64).nullable() })
  .strict();

export type BookingFieldChange =
  | { field: 'memo'; memo: string | null }
  | { field: 'date'; date: string }
  | { field: 'payeeId'; payeeId: string | null };

const TAG = { memo: 'booking-note-v1', date: 'booking-date-v1', payeeId: 'booking-payee-v1' };

/** Call within the same transaction as validation/writes; snapshots never leave this hash. */
export function bookingFieldPreview(tx: Executor, requested: string[], change: BookingFieldChange) {
  const ids = [...new Set(requested)].sort();
  const selection = readBookingBulkSelection(tx, ids, change.field);
  const source = ids.map((id) => getBooking(tx, id));
  const byId = new Map(selection.items.map((item) => [item.id, item]));
  const value =
    change.field === 'memo' ? change.memo : change.field === 'date' ? change.date : change.payeeId;
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
    if (source[index]?.[change.field] === value) unchanged.push(id);
    else changed.push(id);
    return [];
  });
  // Cents leaving / entering a month when a date moves; amounts themselves never change.
  const shifts = new Map<string, number>();
  if (change.field === 'date')
    for (const id of changed) {
      const b = source[ids.indexOf(id)]!,
        key = (month: string) => `${b.currency}|${month}`;
      const from = b.date.slice(0, 7),
        to = change.date.slice(0, 7);
      if (from === to) continue;
      shifts.set(key(from), (shifts.get(key(from)) ?? 0) - b.amountCents);
      shifts.set(key(to), (shifts.get(key(to)) ?? 0) + b.amountCents);
    }
  const monthShifts = [...shifts]
    .filter(([, deltaCents]) => deltaCents !== 0)
    .sort(([a], [b]) => a.split('|')[1]!.localeCompare(b.split('|')[1]!) || a.localeCompare(b))
    .map(([key, deltaCents]) => {
      const [currency, month] = key.split('|') as [string, string];
      return { month, currency, deltaCents };
    });
  // Includes Undo and unrelated writes: a conservative ABA/retry fence, like delete-preview.
  const head =
    tx.get<{ ordinal: string; id: string }>(
      sql`SELECT CAST(rowid AS TEXT) AS ordinal,id FROM audit_log ORDER BY rowid DESC LIMIT 1`,
    ) ?? null;
  const revision = createHash('sha256')
    .update(JSON.stringify([TAG[change.field], ids, value, head, source, selection]))
    .digest('hex');
  return { ids, selection, changed, unchanged, skipped, monthShifts, revision };
}

export function bookingNotePreview(tx: Executor, requested: string[], memo: string | null) {
  return { ...bookingFieldPreview(tx, requested, { field: 'memo', memo }), memo };
}
