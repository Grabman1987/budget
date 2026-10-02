/** Actual cash shares only; a positive contact balance means the contact owes the owner. */
export interface ContactMovement {
  splitId: string;
  bookingId: string;
  date: string;
  amountCents: number;
  memo: string | null;
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
  const receipts: ContactSettlement[] = [];
  const lines: (T & { contactDeltaCents: number; balanceCents: number })[] = [];
  let creditCents = 0;
  let balanceCents = 0;
  for (const m of ordered) {
    if (!Number.isSafeInteger(m.amountCents)) throw new Error('Invalid contact movement');
    balanceCents -= m.amountCents;
    if (!Number.isSafeInteger(balanceCents))
      throw new Error('Contact balance exceeds integer range');
    lines.push({ ...m, contactDeltaCents: -m.amountCents || 0, balanceCents });
    if (m.amountCents < 0) {
      const covered = Math.min(creditCents, -m.amountCents);
      creditCents -= covered;
      outlays.push({ ...m, remainingCents: -m.amountCents - covered });
    } else if (m.amountCents > 0) {
      const persisted = saved.get(m.splitId);
      const plan = allocateContactReceipt(outlays, m.amountCents, persisted?.allocations);
      if (persisted && plan.creditCents !== persisted.creditCents)
        throw new Error('Saved contact credit no longer matches its receipt');
      for (const a of plan.allocations)
        outlays.find((o) => o.splitId === a.outlaySplitId)!.remainingCents -= a.amountCents;
      creditCents += plan.creditCents;
      receipts.push({ receiptSplitId: m.splitId, ...plan });
      saved.delete(m.splitId);
    }
  }
  if (saved.size) throw new Error('Contact settlement is missing its actual receipt');
  return { balanceCents, creditCents, outlays, receipts, movements: lines };
}

/** Prototype report 5.4 chain. Derived balances stay outside income and net worth. */
export function contactTotals(contacts: readonly { balanceCents: number }[]) {
  let receivableCents = 0;
  let payableCents = 0;
  for (const { balanceCents } of contacts) {
    if (!Number.isSafeInteger(balanceCents)) throw new Error('Invalid contact balance');
    receivableCents += Math.max(0, balanceCents);
    payableCents += Math.max(0, -balanceCents);
    if (!Number.isSafeInteger(receivableCents) || !Number.isSafeInteger(payableCents))
      throw new Error('Contact totals exceed integer range');
  }
  return { receivableCents, payableCents, balanceCents: receivableCents - payableCents };
}
