import { listBookings, listPayees, type Db } from '@budget/db';
import { addDays, daysBetween } from '@budget/domain';

export const MATCH_WINDOW_DAYS = 5;
const MAX_MATCHES = 8;

export type ReceiptMatch = {
  id: string;
  date: string;
  /** Signed booking amount in cents (outflow negative). */
  amountCents: number;
  accountId: string;
  payee: string | null;
};

const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 3),
  );

/** Share of the receipt payee's words that appear in the booking payee (0..1). */
function similarity(a: string | undefined, b: string | null): number {
  if (!a || !b) return 0;
  const left = words(a),
    right = words(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / left.size;
}

/**
 * Existing live bookings that could belong to a receipt: the same outgoing amount, booked within
 * five days of the document date, transfers excluded. Read-only; ranked by payee similarity,
 * then by date distance. Nothing is linked here.
 */
export function findReceiptMatches(
  db: Db,
  input: { totalCents: number; date: string; payee?: string | undefined },
): ReceiptMatch[] {
  const names = new Map(listPayees(db).map((row) => [row.id, row.name]));
  return listBookings(db, {
    from: addDays(input.date, -MATCH_WINDOW_DAYS),
    to: addDays(input.date, MATCH_WINDOW_DAYS),
  })
    .filter((row) => row.transferId === null && row.amountCents === -input.totalCents)
    .map((row) => ({
      match: {
        id: row.id,
        date: row.date,
        amountCents: row.amountCents,
        accountId: row.accountId,
        payee: row.payeeId ? (names.get(row.payeeId) ?? null) : null,
      } satisfies ReceiptMatch,
      score: similarity(input.payee, row.payeeId ? (names.get(row.payeeId) ?? null) : null),
      distance: Math.abs(daysBetween(input.date, row.date)),
    }))
    .sort(
      (a, b) =>
        b.score - a.score || a.distance - b.distance || a.match.id.localeCompare(b.match.id),
    )
    .slice(0, MAX_MATCHES)
    .map((row) => row.match);
}
