import { waterfallFill, waterfallOrder, type WaterfallRow } from './targets';

/**
 * Guided "Geld verteilen" (#1055, PR04): read-only figures of the distribution pass. Every input
 * is an existing budget read-model figure in integer cents; nothing here writes or changes how an
 * assignment works. The flow applies the results through the existing assignment call only.
 */

export interface DistributionGapRow extends Omit<WaterfallRow, 'needCents'> {
  needCents: number;
  overspentCents: number;
  /** Card-payment envelopes never take waterfall money (same rule as `waterfallFill` callers). */
  isCard?: boolean;
}

/** Overspent and underfunded envelopes in waterfall priority, with their totals. */
export function distributionGaps<T extends DistributionGapRow>(rows: readonly T[]) {
  const ordered = waterfallOrder(rows);
  const overspent = ordered.filter((row) => row.overspentCents > 0);
  const underfunded = ordered.filter((row) => !row.isCard && row.needCents > 0);
  return {
    overspent,
    underfunded,
    overspentCents: overspent.reduce((sum, row) => sum + row.overspentCents, 0),
    needCents: underfunded.reduce((sum, row) => sum + row.needCents, 0),
  };
}

/**
 * The waterfall plan for "Zu verteilen" (the same `waterfallFill` the Plan suggestions use, cards
 * excluded), as ordered items with the plan total and what stays unassigned.
 */
export function distributionFill<T extends DistributionGapRow>(
  rows: readonly T[],
  toBeAssignedCents: number,
) {
  const fill = waterfallFill(
    rows.filter((row) => !row.isCard),
    toBeAssignedCents,
  );
  const items = waterfallOrder(rows)
    .filter((row) => (fill[row.id] ?? 0) > 0)
    .map((row) => ({ row, addCents: fill[row.id]! }));
  const totalCents = items.reduce((sum, item) => sum + item.addCents, 0);
  return { items, totalCents, leftCents: Math.max(0, toBeAssignedCents) - totalCents };
}

export interface TakeBackRow extends Omit<WaterfallRow, 'needCents'> {
  assignedCents: number;
  /** Server boundary of free money (available minus fixed commitments), never negative. */
  freeCents: number;
  isCard?: boolean;
}

/**
 * "Zu viel zugewiesen": take `overCents` back from envelopes with free money, lowest waterfall
 * priority first. A take never exceeds the envelope's free money or its own assignment, so no
 * envelope becomes overspent. `missingCents` is what free money cannot cover.
 */
export function takeBackPlan<T extends TakeBackRow>(rows: readonly T[], overCents: number) {
  let left = Math.max(0, overCents);
  const moves: Array<{ row: T; takeCents: number }> = [];
  for (const row of waterfallOrder(rows.filter((r) => !r.isCard)).reverse()) {
    if (left <= 0) break;
    const takeCents = Math.min(left, Math.max(0, row.freeCents), Math.max(0, row.assignedCents));
    if (takeCents <= 0) continue;
    moves.push({ row, takeCents });
    left -= takeCents;
  }
  return { moves, takenCents: Math.max(0, overCents) - left, missingCents: left };
}

export type DistributionState = 'balanced' | 'left' | 'over';

/**
 * Result of one pass: net assignment change since the pass started (both month totals from the
 * read model) and the state of the remaining "Zu verteilen".
 */
export function distributionPass(
  startAssignedCents: number,
  assignedCents: number,
  toBeAssignedCents: number,
): { assignedInPassCents: number; remainingCents: number; state: DistributionState } {
  return {
    assignedInPassCents: assignedCents - startAssignedCents,
    remainingCents: toBeAssignedCents,
    state: toBeAssignedCents > 0 ? 'left' : toBeAssignedCents < 0 ? 'over' : 'balanced',
  };
}
