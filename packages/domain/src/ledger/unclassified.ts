import type { BudgetInput } from './budget';

/** Unclassified or pending money, once per split; transfers and tracking accounts are excluded. */
export function unclassifiedMonth(input: Pick<BudgetInput, 'accounts' | 'splits'>, month: string) {
  const accounts = new Map(input.accounts.filter((a) => a.onBudget).map((a) => [a.id, a]));
  const ids = new Set<string>();
  let inflowCents = 0;
  let outflowCents = 0;
  for (const s of input.splits) {
    const account = accounts.get(s.accountId);
    if (
      !account ||
      s.date < account.openingDate ||
      s.date.slice(0, 7) !== month ||
      s.transferAccountId
    )
      continue;
    if (s.categoryId !== null && s.status !== 'pending') continue;
    ids.add(s.bookingId ?? `${s.accountId}:${s.date}:${ids.size}`);
    if (s.amountCents > 0) inflowCents += s.amountCents;
    else outflowCents -= s.amountCents;
  }
  return { count: ids.size, inflowCents, outflowCents, netCents: inflowCents - outflowCents };
}
