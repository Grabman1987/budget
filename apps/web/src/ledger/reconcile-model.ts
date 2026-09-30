import type { DuplicateCandidate, ReconciliationPreview } from './types';

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
