import type { DuplicateCandidate, ReconciliationPreview } from './types';

/** Display existing server suggestions and already loaded pending rows; never infer a match. */
export function candidatesOf(preview: ReconciliationPreview) {
  const duplicates = preview.duplicates.map((row) => ({
    key: `duplicate-${row.removeId}`,
    kind: 'duplicate' as const,
    bookingIds: [row.removeId],
    date: row.date,
    payeeName: row.payeeName,
    amountCents: row.amountCents,
    valuation: row.valuation,
  }));
  const pending = preview.pendingBookings
    ? preview.pendingBookings.map((row) => ({
        key: `pending-${row.id}`,
        kind: 'pending' as const,
        bookingIds: [row.id],
        date: row.date,
        payeeName: row.payeeName,
        amountCents: row.amountCents,
        valuation: row.valuation,
      }))
    : preview.pendingMatches.map((row) => ({
        key: `pending-${row.bookingIds.join('-')}`,
        kind: 'pending' as const,
        bookingIds: row.bookingIds,
        date: null,
        payeeName: null,
        amountCents: row.sumCents,
        valuation: undefined,
      }));
  return [...duplicates, ...pending];
}

/** What a Kontostand prüfen result means for the user, in the order the flow offers actions. */
export type Finding =
  | { kind: 'ok' }
  /** The same booking twice: remove one and the balances agree. */
  | { kind: 'duplicate'; candidate: DuplicateCandidate }
  /** The bank has booked pending bookings already: confirm them. */
  | { kind: 'pending'; bookingIds: string[]; sumCents: number }
  /** A booking is missing (`expense`/`income` of that amount). */
  | { kind: 'missing'; type: 'expense' | 'income'; amountCents: number }
  /** A difference nothing explains: only an Ausgleich closes it. */
  | { kind: 'other'; amountCents: number };

export function findingOf(preview: ReconciliationPreview): Finding {
  if (preview.differenceCents === 0) return { kind: 'ok' };
  const duplicate = preview.duplicates.find((d) => d.explainsDifference);
  if (duplicate) return { kind: 'duplicate', candidate: duplicate };
  const match = preview.pendingMatches[0];
  if (match) return { kind: 'pending', bookingIds: match.bookingIds, sumCents: match.sumCents };
  if (preview.missing) {
    return {
      kind: 'missing',
      type: preview.missing.kind,
      amountCents: preview.missing.amountCents,
    };
  }
  return { kind: 'other', amountCents: Math.abs(preview.differenceCents) };
}
