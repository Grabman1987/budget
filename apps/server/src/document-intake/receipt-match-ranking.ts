import { daysBetween } from '@budget/domain';

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

export type ReceiptMatchInput = {
  /** Signed like the extractor: positive invoice, negative credit note. */
  totalCents: number;
  currency: string;
  date: string;
  payee?: string | undefined;
};

export type ReceiptBookingCandidate = ReceiptMatch & {
  currency: string;
  transfer: boolean;
  receipted: boolean;
};

/** Filter and rank existing bookings without linking a receipt. */
export function rankReceiptMatches(
  candidates: ReceiptBookingCandidate[],
  input: ReceiptMatchInput,
): ReceiptMatch[] {
  return candidates
    .filter(
      (row) =>
        !row.transfer &&
        !row.receipted &&
        row.amountCents === -input.totalCents &&
        row.currency === input.currency,
    )
    .map(({ id, date, amountCents, accountId, payee }) => ({
      match: { id, date, amountCents, accountId, payee } satisfies ReceiptMatch,
      score: similarity(input.payee, payee),
      distance: Math.abs(daysBetween(input.date, date)),
    }))
    .filter((row) => row.distance <= MATCH_WINDOW_DAYS)
    .sort(
      (a, b) =>
        b.score - a.score || a.distance - b.distance || a.match.id.localeCompare(b.match.id),
    )
    .slice(0, MAX_MATCHES)
    .map((row) => row.match);
}
