/** Booked contact shares; a positive contact balance means the contact owes the owner. */
export interface ContactMovement {
  splitId: string;
  bookingId: string;
  date: string;
  amountCents: number;
  memo: string | null;
  /** Optional source labels supplied by the statement reader, never calculation inputs. */
  bookingMemo?: string | null;
  payeeName?: string | null;
  categoryName?: string | null;
  categoryId?: string | null;
  onBudget?: boolean;
  /** Only explicit credit decisions carry these fields; legacy movements stay unchanged. */
  creditCategoryId?: string | null;
  creditSourceSplitId?: string;
  creditOnly?: boolean;
}
export interface ContactAllocation {
  outlaySplitId: string;
  amountCents: number;
}
export interface ContactSettlement {
  receiptSplitId: string;
  allocations: ContactAllocation[];
  creditCents: number;
}
export interface OpenContactOutlay extends ContactMovement {
  remainingCents: number;
}
export interface ContactCredit {
  receiptSplitId: string;
  remainingCents: number;
  categoryId: string | null;
  onBudget?: boolean;
}

const money = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid contact amount');
};

/** Oldest outlay first. Date then stable input order resolves same-day ties. */
export function allocateContactReceipt(
  outlays: readonly OpenContactOutlay[],
  amountCents: number,
  chosen?: readonly ContactAllocation[],
): { allocations: ContactAllocation[]; creditCents: number } {
  money(amountCents);
  const open = [...outlays].sort((a, b) => a.date.localeCompare(b.date));
  const available = open.reduce((sum, o) => sum + o.remainingCents, 0);
  const applied = Math.min(available, amountCents);
  let left = applied;
  const allocations = chosen
    ? [...chosen]
    : open.flatMap((o) => {
        const amount = Math.min(left, o.remainingCents);
        left -= amount;
        return amount ? [{ outlaySplitId: o.splitId, amountCents: amount }] : [];
      });
  const seen = new Set<string>();
  for (const a of allocations) {
    money(a.amountCents);
    const target = open.find((o) => o.splitId === a.outlaySplitId);
    if (
      !target ||
      seen.has(a.outlaySplitId) ||
      a.amountCents <= 0 ||
      a.amountCents > target.remainingCents
    )
      throw new Error('Allocation exceeds an open outlay or repeats its target');
    seen.add(a.outlaySplitId);
  }
  if (allocations.reduce((s, a) => s + a.amountCents, 0) !== applied)
    throw new Error(
      'Allocate the receipt up to the open balance; retain only the excess as credit',
    );
  return { allocations, creditCents: amountCents - applied };
}

/** Replay actual movements. Saved allocation and credit are validated, never silently replaced. */
export function contactStatement<T extends ContactMovement>(
  movements: readonly T[],
  settlements: readonly ContactSettlement[] = [],
) {
  const ordered = [...movements].sort((a, b) => a.date.localeCompare(b.date));
  const saved = new Map(settlements.map((s) => [s.receiptSplitId, s]));
  const outlays: OpenContactOutlay[] = [];
  const receipts: (ContactSettlement & { recorded: boolean })[] = [];
  const lines: (T & { contactDeltaCents: number; balanceCents: number })[] = [];
  const credits: ContactCredit[] = [];
  const creditUses: { receiptSplitId: string; outlaySplitId: string; amountCents: number }[] = [];
  let creditCents = 0;
  let balanceCents = 0;
  let closedThroughSplitId: string | null = null;
  for (const m of ordered) {
    if (!Number.isSafeInteger(m.amountCents)) throw new Error('Invalid contact movement');
    balanceCents -= m.amountCents;
    if (!Number.isSafeInteger(balanceCents))
      throw new Error('Contact balance exceeds integer range');
    lines.push({ ...m, contactDeltaCents: -m.amountCents || 0, balanceCents });
    if (m.amountCents < 0) {
      let uncovered = -m.amountCents;
      for (const credit of credits) {
        if (m.creditSourceSplitId && credit.receiptSplitId !== m.creditSourceSplitId) continue;
        if (!m.creditSourceSplitId && m.categoryId && credit.onBudget !== m.onBudget) continue;
        if (!m.creditSourceSplitId && credit.categoryId && credit.categoryId !== m.categoryId)
          continue;
        const amountCents = Math.min(credit.remainingCents, uncovered);
        if (!amountCents) continue;
        credit.remainingCents -= amountCents;
        uncovered -= amountCents;
        creditUses.push({
          receiptSplitId: credit.receiptSplitId,
          outlaySplitId: m.splitId,
          amountCents,
        });
      }
      if (m.creditSourceSplitId && uncovered)
        throw new Error('Selected contact credit is no longer available');
      const covered = -m.amountCents - uncovered;
      creditCents -= covered;
      outlays.push({ ...m, remainingCents: -m.amountCents - covered });
    } else if (m.amountCents > 0) {
      const persisted = saved.get(m.splitId);
      const plan = m.creditOnly
        ? { allocations: [], creditCents: m.amountCents }
        : allocateContactReceipt(outlays, m.amountCents, persisted?.allocations);
      if (persisted && plan.creditCents !== persisted.creditCents)
        throw new Error('Saved contact credit no longer matches its receipt');
      for (const a of plan.allocations)
        outlays.find((o) => o.splitId === a.outlaySplitId)!.remainingCents -= a.amountCents;
      creditCents += plan.creditCents;
      if (plan.creditCents)
        credits.push({
          receiptSplitId: m.splitId,
          remainingCents: plan.creditCents,
          categoryId: m.creditCategoryId ?? null,
          ...(m.onBudget === undefined ? {} : { onBudget: m.onBudget }),
        });
      receipts.push({ receiptSplitId: m.splitId, ...plan, recorded: persisted !== undefined });
      if (
        persisted &&
        balanceCents === 0 &&
        creditCents === 0 &&
        outlays.every((outlay) => outlay.remainingCents === 0)
      )
        closedThroughSplitId = m.splitId;
      saved.delete(m.splitId);
    }
  }
  if (saved.size) throw new Error('Contact settlement is missing its actual receipt');
  return {
    balanceCents,
    creditCents,
    credits: credits.filter((c) => c.remainingCents > 0),
    creditUses,
    outlays,
    receipts,
    movements: lines,
    closedThroughSplitId,
  };
}

/** Prototype report 5.4 chain. Derived balances stay outside income and net worth. */
export function contactTotals(
  contacts: readonly { balanceCents: number; receivableCents?: number; creditCents?: number }[],
) {
  let receivableCents = 0;
  let payableCents = 0;
  for (const { balanceCents, receivableCents: open, creditCents } of contacts) {
    if (!Number.isSafeInteger(balanceCents)) throw new Error('Invalid contact balance');
    receivableCents += open ?? Math.max(0, balanceCents);
    payableCents += creditCents ?? Math.max(0, -balanceCents);
    if (!Number.isSafeInteger(receivableCents) || !Number.isSafeInteger(payableCents))
      throw new Error('Contact totals exceed integer range');
  }
  return { receivableCents, payableCents, balanceCents: receivableCents - payableCents };
}
