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
  /** Recorded automatic and owner-adjusted uses are fixed, including an empty saved choice. */
  creditAllocations?: { receiptSplitId: string; amountCents: number }[];
}
export interface ContactAllocation {
  outlaySplitId: string;
  amountCents: number;
}
export interface ContactSettlement {
  receiptSplitId: string;
  allocations: ContactAllocation[];
  creditCents: number;
  allowFutureAllocations?: boolean;
}
export interface OpenContactOutlay extends ContactMovement {
  remainingCents: number;
}
export interface ContactCredit {
  receiptSplitId: string;
  remainingCents: number;
  categoryId: string | null;
  onBudget?: boolean;
  /** A saved repayment can reserve an outlay booked after its receipt date. */
  targetOutlaySplitId?: string;
}

/** A contact decision conflicts with its saved allocations; safe to show at the API boundary. */
export class ContactAllocationError extends Error {
  constructor(readonly reason: string) {
    super(
      'Die Kontakt-Auslage passt nicht zur gespeicherten Verrechnung oder zum verfügbaren Kontaktguthaben. Bitte zuerst die zugehörige Verrechnung prüfen.',
    );
    this.name = 'ContactAllocationError';
  }
}

/** Unsafe stored arithmetic is an internal invariant failure, never input validation. */
export class ContactInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContactInvariantError';
  }
}

const money = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 0) throw new ContactAllocationError('Invalid contact amount');
};

/** Oldest outlay first. Date then stable input order resolves same-day ties. */
export function allocateContactReceipt(
  outlays: readonly OpenContactOutlay[],
  amountCents: number,
  chosen?: readonly ContactAllocation[],
  options: { retainCredit?: boolean } = {},
): { allocations: ContactAllocation[]; creditCents: number } {
  money(amountCents);
  const open = [...outlays].sort((a, b) => a.date.localeCompare(b.date));
  const available = open.reduce((sum, o) => sum + o.remainingCents, 0);
  money(available);
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
      throw new ContactAllocationError('Allocation exceeds an open outlay or repeats its target');
    seen.add(a.outlaySplitId);
  }
  const allocated = allocations.reduce((s, a) => s + a.amountCents, 0);
  money(allocated);
  if (allocated > applied || (!options.retainCredit && allocated !== applied))
    throw new ContactAllocationError(
      'Allocate the receipt up to the open balance; retain only the excess as credit',
    );
  return { allocations, creditCents: amountCents - allocated };
}

/** Credit a contact holds that a new shared outlay can use (`categoryId` null = any category). */
export interface ContactCreditPool {
  remainingCents: number;
  categoryId: string | null;
}

/**
 * Take credit for one new outlay exactly like the statement replay does: credits in receipt order,
 * a category-bound credit only for its category. Mutates the pool; returns the cents covered.
 */
export function consumeContactCredit(
  pool: ContactCreditPool[],
  categoryId: string | null,
  outlayCents: number,
): number {
  let uncovered = outlayCents;
  for (const credit of pool) {
    if (credit.categoryId && credit.categoryId !== categoryId) continue;
    const used = Math.min(credit.remainingCents, uncovered);
    credit.remainingCents -= used;
    uncovered -= used;
  }
  return outlayCents - uncovered;
}

/** Replay actual movements. Saved allocation and credit are validated, never silently replaced. */
export function contactStatement<T extends ContactMovement>(
  movements: readonly T[],
  settlements: readonly ContactSettlement[] = [],
  allocationTargets: readonly ContactMovement[] = movements,
  reserveFutureCredit = false,
) {
  const ordered = [...movements].sort((a, b) => a.date.localeCompare(b.date));
  const saved = new Map(settlements.map((s) => [s.receiptSplitId, s]));
  const outlays: OpenContactOutlay[] = [];
  const receipts: (ContactSettlement & { recorded: boolean })[] = [];
  const lines: (T & { contactDeltaCents: number; balanceCents: number })[] = [];
  const credits: ContactCredit[] = [];
  const reservations = new Map<string, number>();
  const fixedUses = (m: ContactMovement) =>
    m.creditSourceSplitId
      ? [{ receiptSplitId: m.creditSourceSplitId, amountCents: -m.amountCents }]
      : (m.creditAllocations ?? []);
  for (const m of (reserveFutureCredit ? allocationTargets : ordered).filter(
    (m) => m.amountCents < 0,
  ))
    for (const use of fixedUses(m)) {
      money(use.amountCents);
      reservations.set(
        use.receiptSplitId,
        (reservations.get(use.receiptSplitId) ?? 0) + use.amountCents,
      );
      money(reservations.get(use.receiptSplitId)!);
    }
  const creditUses: { receiptSplitId: string; outlaySplitId: string; amountCents: number }[] = [];
  let creditCents = 0;
  let balanceCents = 0;
  let closedThroughSplitId: string | null = null;
  for (const m of ordered) {
    if (!Number.isSafeInteger(m.amountCents))
      throw new ContactInvariantError('Invalid contact movement');
    balanceCents -= m.amountCents;
    if (!Number.isSafeInteger(balanceCents))
      throw new ContactInvariantError('Contact balance exceeds integer range');
    lines.push({ ...m, contactDeltaCents: -m.amountCents || 0, balanceCents });
    if (m.amountCents < 0) {
      for (const use of fixedUses(m))
        reservations.set(
          use.receiptSplitId,
          reservations.get(use.receiptSplitId)! - use.amountCents,
        );
      let uncovered = -m.amountCents;
      for (const credit of credits.filter((c) => c.targetOutlaySplitId === m.splitId)) {
        if (credit.remainingCents > uncovered)
          throw new ContactAllocationError('Allocation exceeds an open outlay');
        uncovered -= credit.remainingCents;
        creditCents -= credit.remainingCents;
        credit.remainingCents = 0;
      }
      const chosen = m.creditAllocations;
      if (chosen && new Set(chosen.map((a) => a.receiptSplitId)).size !== chosen.length)
        throw new ContactAllocationError('Repeated contact credit source');
      for (const credit of credits) {
        if (credit.targetOutlaySplitId) continue;
        if (m.creditSourceSplitId && credit.receiptSplitId !== m.creditSourceSplitId) continue;
        if (!m.creditSourceSplitId && m.categoryId && credit.onBudget !== m.onBudget) continue;
        if (!m.creditSourceSplitId && credit.categoryId && credit.categoryId !== m.categoryId)
          continue;
        const explicit = chosen?.find((a) => a.receiptSplitId === credit.receiptSplitId);
        // Recorded uses retain their cents even when an earlier purchase is inserted.
        const reserved = reservations.get(credit.receiptSplitId) ?? 0;
        const amountCents = chosen
          ? (explicit?.amountCents ?? 0)
          : Math.min(Math.max(0, credit.remainingCents - reserved), uncovered);
        money(amountCents);
        if (amountCents > credit.remainingCents || amountCents > uncovered)
          throw new ContactAllocationError('Selected contact credit is no longer available');
        if (!amountCents) continue;
        credit.remainingCents -= amountCents;
        uncovered -= amountCents;
        creditUses.push({
          receiptSplitId: credit.receiptSplitId,
          outlaySplitId: m.splitId,
          amountCents,
        });
      }
      if (
        chosen &&
        chosen.reduce((sum, a) => sum + a.amountCents, 0) !==
          creditUses
            .filter((u) => u.outlaySplitId === m.splitId)
            .reduce((sum, u) => sum + u.amountCents, 0)
      )
        throw new ContactAllocationError('Selected contact credit is no longer available');
      if (m.creditSourceSplitId && uncovered)
        throw new ContactAllocationError('Selected contact credit is no longer available');
      const covered = creditUses
        .filter((u) => u.outlaySplitId === m.splitId)
        .reduce((sum, u) => sum + u.amountCents, 0);
      creditCents -= covered;
      outlays.push({ ...m, remainingCents: uncovered });
    } else if (m.amountCents > 0) {
      const persisted = saved.get(m.splitId);
      const future = (persisted?.allocations ?? []).flatMap((a) => {
        if (outlays.some((o) => o.splitId === a.outlaySplitId)) return [];
        const target = allocationTargets.find((o) => o.splitId === a.outlaySplitId);
        if (
          !persisted?.allowFutureAllocations ||
          !target ||
          target.amountCents >= 0 ||
          target.creditSourceSplitId ||
          target.date < m.date
        )
          throw new ContactAllocationError('Allocation exceeds an open outlay');
        const reserved = credits
          .filter((c) => c.targetOutlaySplitId === target.splitId)
          .reduce((sum, c) => sum + c.remainingCents, 0);
        return [{ ...target, remainingCents: -target.amountCents - reserved }];
      });
      const plan = m.creditOnly
        ? { allocations: [], creditCents: m.amountCents }
        : persisted
          ? {
              ...allocateContactReceipt(
                [...outlays, ...future],
                m.amountCents - persisted.creditCents,
                persisted.allocations,
              ),
              creditCents: persisted.creditCents,
            }
          : allocateContactReceipt(outlays, m.amountCents);
      money(plan.creditCents);
      if (
        plan.allocations.reduce((sum, a) => sum + a.amountCents, 0) + plan.creditCents !==
        m.amountCents
      )
        throw new ContactAllocationError('Saved contact credit no longer matches its receipt');
      if (persisted && plan.creditCents !== persisted.creditCents)
        throw new ContactAllocationError('Saved contact credit no longer matches its receipt');
      for (const a of plan.allocations) {
        const target = outlays.find((o) => o.splitId === a.outlaySplitId);
        if (target) target.remainingCents -= a.amountCents;
        else {
          creditCents += a.amountCents;
          credits.push({
            receiptSplitId: m.splitId,
            remainingCents: a.amountCents,
            categoryId: future.find((o) => o.splitId === a.outlaySplitId)?.categoryId ?? null,
            targetOutlaySplitId: a.outlaySplitId,
          });
        }
      }
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
  if (saved.size)
    throw new ContactAllocationError('Contact settlement is missing its actual receipt');
  return {
    balanceCents,
    creditCents,
    credits: credits.filter((c) => c.remainingCents > 0),
    ...(reserveFutureCredit
      ? {
          availableCredits: credits
            .filter((c) => !c.targetOutlaySplitId)
            .map((c) => ({
              ...c,
              remainingCents: c.remainingCents - (reservations.get(c.receiptSplitId) ?? 0),
            }))
            .filter((c) => c.remainingCents > 0),
        }
      : {}),
    creditUses,
    outlays,
    receipts,
    movements: lines,
    closedThroughSplitId,
  };
}

/**
 * Prototype report 5.4 chain. Derived balances stay outside income and net worth. Contacts whose
 * stored allocation is contradictory (`allocationNeedsReview`) are excluded from the receivable and
 * credit sums and reported separately (count and plain balance), so the list totals never change
 * silently.
 */
export function contactTotals(
  contacts: readonly {
    balanceCents: number;
    receivableCents?: number;
    creditCents?: number;
    allocationNeedsReview?: boolean;
  }[],
) {
  let receivableCents = 0;
  let payableCents = 0;
  let reviewCount = 0;
  let reviewBalanceCents = 0;
  for (const {
    balanceCents,
    receivableCents: open,
    creditCents,
    allocationNeedsReview,
  } of contacts) {
    if (!Number.isSafeInteger(balanceCents))
      throw new ContactInvariantError('Invalid contact balance');
    if (allocationNeedsReview) {
      reviewCount += 1;
      reviewBalanceCents += balanceCents;
      if (!Number.isSafeInteger(reviewBalanceCents))
        throw new ContactInvariantError('Contact totals exceed integer range');
      continue;
    }
    receivableCents += open ?? Math.max(0, balanceCents);
    payableCents += creditCents ?? Math.max(0, -balanceCents);
    if (!Number.isSafeInteger(receivableCents) || !Number.isSafeInteger(payableCents))
      throw new ContactInvariantError('Contact totals exceed integer range');
  }
  return {
    receivableCents,
    payableCents,
    balanceCents: receivableCents - payableCents,
    reviewCount,
    reviewBalanceCents,
  };
}
export * from './checklist';
