import { budgetMonths, type BudgetInput, type LedgerSplit } from '@budget/domain';
import type { SampleLedger } from './types';

/**
 * R03 "vom Vormonat leben" for the sample plan: a month is funded by money that arrived before
 * it. The salary of the 30th stays in "Zu verteilen" for the next month, so at every month end
 * "Zu verteilen" holds at least the salary of that month (in the current month, which has no
 * salary yet, at least 0). Where the prototype's plan asks for more, the "want" envelopes of that
 * month get less, in proportion to their plan: first the savings envelopes (their money stays on the
 * savings account), then the wants. Computed with the domain's `budgetMonths`, the same
 * figure Plan › Monat shows.
 */
export function fundByR03(
  ledger: Pick<SampleLedger, 'accounts' | 'categories' | 'bookings' | 'splits' | 'envelopeMonths'>,
  salary: (month: string) => number,
  isWant: (categoryId: string) => boolean,
  isSaving: (categoryId: string) => boolean,
): SampleLedger['envelopeMonths'] {
  const live = ledger.bookings.filter((b) => !b.deletedAt);
  const byId = new Map(live.map((b) => [b.id, b]));
  const legs = new Map<string, { id: string; accountId: string }[]>();
  for (const b of live)
    if (b.transferId)
      legs.set(b.transferId, [
        ...(legs.get(b.transferId) ?? []),
        { id: b.id, accountId: b.accountId },
      ]);
  const splits: LedgerSplit[] = ledger.splits.flatMap((s) => {
    const b = byId.get(s.bookingId);
    if (!b) return [];
    const partner = b.transferId
      ? (legs.get(b.transferId)?.find((l) => l.id !== b.id)?.accountId ?? null)
      : null;
    return [
      {
        accountId: b.accountId,
        date: b.date,
        amountCents: s.amountCents,
        categoryId: s.categoryId ?? null,
        transferAccountId: partner,
      },
    ];
  });
  const months = [...new Set(ledger.envelopeMonths.map((e) => e.month))].sort();
  const assigned: Record<string, Record<string, number>> = {};
  for (const e of ledger.envelopeMonths)
    (assigned[e.month] ??= {})[e.categoryId] = e.assignedCents ?? 0;
  const input: BudgetInput = {
    accounts: ledger.accounts.map((a) => ({
      id: a.id,
      onBudget: a.onBudget,
      openingBalanceCents: a.openingBalanceCents ?? 0,
      openingDate: a.openingDate,
    })),
    categories: ledger.categories.map((c) => ({
      id: c.id,
      kind: c.kind ?? 'variable',
      rolloverOverspending: c.rolloverOverspending ?? false,
      cardAccountId: c.cardAccountId ?? null,
    })),
    splits,
    months,
    assigned,
  };

  months.forEach((month, i) => {
    const run = budgetMonths({ ...input, months: months.slice(0, i + 1) });
    const zv = run[i]?.toBeAssignedCents ?? 0;
    const short = salary(month) - zv;
    if (short <= 0) return;
    const row = assigned[month] ?? {};
    // Savings envelopes first (their money stays on the savings account), then the wants.
    let left = short;
    for (const pass of [isSaving, isWant]) {
      const ids = Object.keys(row).filter((id) => pass(id) && (row[id] ?? 0) > 0);
      const total = ids.reduce((a, id) => a + (row[id] ?? 0), 0);
      const cut = Math.min(left, total);
      let rest = cut;
      ids.forEach((id, n) => {
        const part = n === ids.length - 1 ? rest : Math.round((cut * (row[id] ?? 0)) / total);
        row[id] = (row[id] ?? 0) - part;
        rest -= part;
      });
      left -= cut;
    }
  });
  return ledger.envelopeMonths.map((e) => ({
    ...e,
    assignedCents: assigned[e.month]?.[e.categoryId] ?? e.assignedCents,
  }));
}
