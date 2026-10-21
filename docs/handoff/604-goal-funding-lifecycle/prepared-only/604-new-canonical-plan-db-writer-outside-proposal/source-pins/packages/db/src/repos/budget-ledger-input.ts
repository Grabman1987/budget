import type { BudgetInput, LedgerSplit } from '@budget/domain';

/** SQL row shapes shared by the live reader and read-only audited-state reconstruction. */
export interface BudgetLedgerRows {
  accounts: BudgetInput['accounts'];
  categories: ReadonlyArray<BudgetInput['categories'][number] & { openingAvailableCents: number }>;
  rows: Array<{
    bookingId: string;
    splitId: string;
    payeeId: string | null;
    status: string;
    accountId: string;
    date: string;
    incomeNextMonth: boolean;
    amountCents: number;
    categoryId: string | null;
    bookingTransferId: string | null;
    splitTransferId: string | null;
  }>;
  assigned: NonNullable<BudgetInput['assigned']>;
  held: NonNullable<BudgetInput['held']>;
}

/** No financial arithmetic: preserve the existing transfer resolution and opening carry mapping. */
export function budgetInputFromRows({ accounts, categories, rows, assigned, held }: BudgetLedgerRows): Omit<BudgetInput, 'months'> {
  const legs = new Map<string, { bookingId: string; accountId: string }[]>();
  const addLeg = (transferId: string, bookingId: string, accountId: string) => {
    const list = legs.get(transferId) ?? [];
    if (!list.some((l) => l.bookingId === bookingId)) list.push({ bookingId, accountId });
    legs.set(transferId, list);
  };
  for (const r of rows) {
    if (r.bookingTransferId) addLeg(r.bookingTransferId, r.bookingId, r.accountId);
    if (r.splitTransferId) addLeg(r.splitTransferId, r.bookingId, r.accountId);
  }
  const partnerOf = (transferId: string | null, bookingId: string) =>
    transferId === null
      ? null
      : (legs.get(transferId)?.find((l) => l.bookingId !== bookingId)?.accountId ?? null);
  const splits: LedgerSplit[] = rows.map((r) => ({
    bookingId: r.bookingId,
    splitId: r.splitId,
    payeeId: r.payeeId,
    status: r.status,
    accountId: r.accountId,
    date: r.date,
    incomeNextMonth: r.incomeNextMonth,
    amountCents: r.amountCents,
    categoryId: r.categoryId,
    transferAccountId: partnerOf(r.splitTransferId ?? r.bookingTransferId, r.bookingId),
  }));
  const openingCarry = Object.fromEntries(
    categories.filter((c) => c.openingAvailableCents !== 0).map((c) => [c.id, c.openingAvailableCents]),
  );
  return { accounts, categories, splits, assigned, held, openingCarry };
}
