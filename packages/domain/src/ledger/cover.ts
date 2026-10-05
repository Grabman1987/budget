/** Cover targets in list order, spending positive sources largest first. Integer cents only. */
export function coverPlan(
  targets: readonly { id: string; overspentCents: number }[],
  sources: readonly { id: string | null; availableCents: number }[],
) {
  const pool = sources
    .filter((s) => s.availableCents > 0)
    .map((s) => ({ ...s }))
    .sort((a, b) => b.availableCents - a.availableCents);
  const moves: { fromId: string | null; toId: string; amountCents: number }[] = [];
  let coveredCount = 0;
  let missingCents = 0;
  for (const target of targets) {
    let left = target.overspentCents;
    for (const source of pool) {
      if (left <= 0) break;
      if (source.id === target.id) continue;
      const amountCents = Math.min(left, source.availableCents);
      if (amountCents <= 0) continue;
      moves.push({ fromId: source.id, toId: target.id, amountCents });
      source.availableCents -= amountCents;
      left -= amountCents;
    }
    if (left === 0) coveredCount++;
    missingCents += left;
  }
  return { moves, coveredCount, openCount: targets.length - coveredCount, missingCents };
}

/** Owner cover boundary: pending future spending plus unbooked dues, through the next income. */
export function coverAvailability(
  envelopes: readonly { categoryId: string; availableCents: number }[],
  bookings: readonly {
    categoryId: string | null;
    date: string;
    amountCents: number;
    status?: string;
  }[],
  dues: readonly {
    categoryId: string | null;
    dueDate: string;
    amountCents: number;
    booked: boolean;
  }[],
  month: string,
  today: string,
  nextIncome: string,
) {
  const committed = new Map<string, number>();
  const reserve = (id: string | null, amount: number) => {
    if (id && amount < 0) committed.set(id, (committed.get(id) ?? 0) - amount);
  };
  for (const b of bookings)
    if (b.status === 'pending' && b.date > today && b.date >= `${month}-01` && b.date <= nextIncome)
      reserve(b.categoryId, b.amountCents);
  for (const d of dues)
    if (!d.booked && d.dueDate >= today && d.dueDate >= `${month}-01` && d.dueDate <= nextIncome)
      reserve(d.categoryId, d.amountCents);
  return envelopes.map((e) => ({
    categoryId: e.categoryId,
    committedCents: committed.get(e.categoryId) ?? 0,
    freeCents: Math.max(0, e.availableCents - (committed.get(e.categoryId) ?? 0)),
  }));
}

export function coverShortfall(
  overspentCents: number,
  freeCents: readonly number[],
  toBeAssignedCents: number,
) {
  return Math.max(
    0,
    overspentCents -
      freeCents.reduce((sum, value) => sum + Math.max(0, value), 0) -
      Math.max(0, toBeAssignedCents),
  );
}

/** Signed on-budget balances; an unused credit line never increases money. */
export function budgetAccountMoney(
  accounts: readonly {
    id: string;
    name: string;
    balanceCents: number;
    onBudget: boolean;
    overdraftLimitCents?: number | null;
    creditLimitCents?: number | null;
  }[],
) {
  const rows = accounts
    .filter((a) => a.onBudget)
    .map((a) => ({
      id: a.id,
      name: a.name,
      balanceCents: a.balanceCents,
      usedCreditCents: Math.max(0, -a.balanceCents),
      creditLineCents: a.overdraftLimitCents ?? a.creditLimitCents ?? null,
    }));
  return {
    totalCents: rows.reduce((sum, a) => sum + a.balanceCents, 0),
    usedCreditCents: rows.reduce((sum, a) => sum + a.usedCreditCents, 0),
    accounts: rows,
  };
}
