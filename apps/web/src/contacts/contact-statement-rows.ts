import type { ContactMovement } from '@budget/domain';
import { monthName } from '../ledger/format';
import { receivableDelta } from './contact-balance';

/** Memo of the booking that `waiveContactOutlay` creates; it is the only marker of a gift. */
export const GIFT_MEMO = 'Geschenk an Kontakt';

interface StatementLike {
  movements: ContactMovement[];
  receipts: {
    receiptSplitId: string;
    allocations: { outlaySplitId: string; amountCents: number }[];
  }[];
}

/** Read-only derivation from the existing statement; no allocation or balance logic of its own. */
export function giftInfo(statement: StatementLike) {
  const memoBySplit = new Map(statement.movements.map((m) => [m.splitId, m.memo?.trim()]));
  const receiptIds = new Set<string>();
  const giftedByOutlay = new Map<string, number>();
  for (const receipt of statement.receipts) {
    if (memoBySplit.get(receipt.receiptSplitId) !== GIFT_MEMO) continue;
    receiptIds.add(receipt.receiptSplitId);
    for (const a of receipt.allocations)
      giftedByOutlay.set(
        a.outlaySplitId,
        (giftedByOutlay.get(a.outlaySplitId) ?? 0) + a.amountCents,
      );
  }
  return { giftReceiptIds: receiptIds, giftedByOutlay };
}

const monthKey = (day: string) => day.slice(0, 7);
export const monthTitle = (day: string) => `${monthName(day)} ${day.slice(0, 4)}`;

/** Running receivable balance (positive = contact owes) after each movement, in statement order. */
export function runningBalances(movements: readonly ContactMovement[]) {
  const after = new Map<string, number>();
  const monthEnd = new Map<string, number>();
  let balance = 0;
  for (const m of movements) {
    balance += receivableDelta(m.amountCents);
    after.set(m.splitId, balance);
    monthEnd.set(monthKey(m.date), balance);
  }
  return { after, monthEnd };
}

/** First index of the "current" stretch: after the last zero balance, never past an open outlay. */
export function currentStretchStart(
  movements: readonly ContactMovement[],
  openSplitIds: ReadonlySet<string>,
): number {
  const { after } = runningBalances(movements);
  let start = 0;
  movements.forEach((m, i) => {
    if (after.get(m.splitId) === 0) start = i + 1;
  });
  const firstOpen = movements.findIndex((m) => openSplitIds.has(m.splitId));
  return firstOpen >= 0 ? Math.min(start, firstOpen) : start;
}

export interface MonthGroup<T extends ContactMovement> {
  key: string;
  title: string;
  rows: T[];
  endBalanceCents: number;
}

/** Month groups of the given rows; the end balance comes from the complete statement. */
export function groupByMonth<T extends ContactMovement>(
  rows: readonly T[],
  monthEnd: ReadonlyMap<string, number>,
): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = [];
  for (const row of rows) {
    const key = monthKey(row.date);
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = {
        key,
        title: monthTitle(row.date),
        rows: [],
        endBalanceCents: monthEnd.get(key) ?? 0,
      };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}
