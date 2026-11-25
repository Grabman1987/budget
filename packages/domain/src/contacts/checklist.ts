/** One ticked row of the contact payment checklist: a due contribution or an open outlay. */
export interface ChecklistItem {
  id: string;
  kind: 'contribution' | 'outlay';
  /** Full amount of the row in cents (contribution amount or open rest of the outlay). */
  amountCents: number;
}

export interface ChecklistPlan {
  /** What each ticked row receives, in the order given; rows that receive nothing are omitted. */
  paid: { id: string; kind: ChecklistItem['kind']; amountCents: number; shortCents: number }[];
  /** Received minus ticked: 0 settled, < 0 paid less, > 0 paid more. */
  restCents: number;
  /** Paid-less part (positive cents) the ticked rows did not receive. */
  shortfallCents: number;
  /** Paid-more part (positive cents) no ticked row takes. */
  surplusCents: number;
}

const isCents = (n: number) => Number.isSafeInteger(n) && n >= 0;

/**
 * Apply one received amount to the ticked rows. The given order is the payment order (the caller
 * lists due contributions first, then outlays oldest first), so a shortfall lands on the last rows
 * and an exact payment settles every row. Integer cents only; no rounding anywhere.
 */
export function planContactChecklist(
  items: readonly ChecklistItem[],
  receivedCents: number,
): ChecklistPlan {
  if (!isCents(receivedCents)) throw new RangeError('Received amount must be whole cents');
  let left = receivedCents;
  let ticked = 0;
  const paid: ChecklistPlan['paid'] = [];
  for (const item of items) {
    if (!isCents(item.amountCents) || item.amountCents === 0)
      throw new RangeError('Checklist rows need a positive whole-cent amount');
    ticked += item.amountCents;
    const amountCents = Math.min(left, item.amountCents);
    left -= amountCents;
    if (amountCents > 0)
      paid.push({
        id: item.id,
        kind: item.kind,
        amountCents,
        shortCents: item.amountCents - amountCents,
      });
  }
  if (!Number.isSafeInteger(ticked)) throw new RangeError('Checklist total exceeds integer range');
  const restCents = receivedCents - ticked;
  return {
    paid,
    restCents,
    shortfallCents: Math.max(0, -restCents),
    surplusCents: Math.max(0, restCents),
  };
}
