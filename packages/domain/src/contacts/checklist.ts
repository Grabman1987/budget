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

/**
 * Offset ticked credit lots against ticked outlays before any cash moves (#1322): credits in the
 * given order, outlays oldest first (the given order). A credit never exceeds what the outlays
 * can take; what is not applicable stays unapplied and is reported, never silently dropped.
 */
export function applyChecklistCredits(
  outlays: readonly { id: string; amountCents: number }[],
  credits: readonly { id: string; amountCents: number }[],
): {
  allocations: { creditId: string; outlayId: string; amountCents: number }[];
  outlays: { id: string; amountCents: number }[];
  appliedByCredit: Map<string, number>;
} {
  const left = new Map(outlays.map((o) => [o.id, o.amountCents]));
  const allocations: { creditId: string; outlayId: string; amountCents: number }[] = [];
  const appliedByCredit = new Map<string, number>();
  for (const credit of credits) {
    if (!isCents(credit.amountCents)) throw new RangeError('Credit must be whole cents');
    let remaining = credit.amountCents;
    for (const outlay of outlays) {
      const take = Math.min(remaining, left.get(outlay.id) ?? 0);
      if (take <= 0) continue;
      left.set(outlay.id, left.get(outlay.id)! - take);
      remaining -= take;
      allocations.push({ creditId: credit.id, outlayId: outlay.id, amountCents: take });
    }
    appliedByCredit.set(credit.id, credit.amountCents - remaining);
  }
  return {
    allocations,
    outlays: outlays.map((o) => ({ id: o.id, amountCents: left.get(o.id)! })),
    appliedByCredit,
  };
}

/**
 * "Alles bis <Datum> ausgleichen": ids of the outlays dated on or before the cutoff (ISO dates
 * compare as text). Later outlays are left out, so they stay open for the next payment.
 */
export function outlayIdsUpTo(
  outlays: readonly { id: string; date: string }[],
  cutoff: string,
): string[] {
  return outlays.filter((o) => o.date <= cutoff).map((o) => o.id);
}
