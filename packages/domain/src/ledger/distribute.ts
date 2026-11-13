import { overspentEnvelopes } from './envelope';
import { waterfallFill, waterfallOrder, type WaterfallRow } from './targets';

/**
 * Guided "Geld verteilen" (#1055, PR04): read-only figures of the distribution pass. Every input
 * is an existing budget read-model figure in integer cents; nothing here writes or changes how an
 * assignment works. The flow applies the results through the existing assignment call only.
 */

export interface DistributionGapRow extends Omit<WaterfallRow, 'needCents'> {
  needCents: number;
  availableCents: number;
  overspentCents: number;
  /** Card-payment envelopes never take waterfall money (same rule as `waterfallFill` callers). */
  isCard?: boolean;
}

/** Overspent and underfunded envelopes in waterfall priority, with their totals. */
export function distributionGaps<T extends DistributionGapRow>(rows: readonly T[]) {
  const ordered = waterfallOrder(rows);
  // The shared predicate (available below zero); `overspentCents` is its amount.
  const overspent = overspentEnvelopes({ envelopes: ordered });
  const underfunded = ordered.filter((row) => !row.isCard && row.needCents > 0);
  return {
    overspent,
    underfunded,
    overspentCents: overspent.reduce((sum, row) => sum + row.overspentCents, 0),
    needCents: underfunded.reduce((sum, row) => sum + row.needCents, 0),
  };
}

/**
 * Cover overspent envelopes (in the given, waterfall order) from "Zu verteilen", never beyond
 * what is there. Count, sum and items always refer to the same rows. `coversAll` is true only
 * when "Zu verteilen" covers every row in full, so a single "alle decken" cannot overdraw it.
 */
export function coverFromToBeAssigned<T extends { overspentCents: number }>(
  overspent: readonly T[],
  toBeAssignedCents: number,
) {
  let left = Math.max(0, toBeAssignedCents);
  const items: Array<{ row: T; coverCents: number }> = [];
  for (const row of overspent) {
    const coverCents = Math.min(Math.max(0, row.overspentCents), left);
    if (coverCents <= 0) continue;
    items.push({ row, coverCents });
    left -= coverCents;
  }
  const totalCents = overspent.reduce((sum, row) => sum + Math.max(0, row.overspentCents), 0);
  const coveredCents = items.reduce((sum, item) => sum + item.coverCents, 0);
  return {
    items,
    count: overspent.length,
    totalCents,
    coveredCents,
    uncoveredCents: totalCents - coveredCents,
    coversAll: totalCents > 0 && toBeAssignedCents >= totalCents,
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
  let freeCents = 0;
  const moves: Array<{ row: T; takeCents: number }> = [];
  for (const row of waterfallOrder(rows.filter((r) => !r.isCard)).reverse()) {
    freeCents += Math.max(0, row.freeCents);
    if (left <= 0) continue;
    const takeCents = Math.min(left, Math.max(0, row.freeCents), Math.max(0, row.assignedCents));
    if (takeCents <= 0) continue;
    moves.push({ row, takeCents });
    left -= takeCents;
  }
  // What keeps the rest: free money exists but was not assigned this month ('assigned'), or the
  // envelopes simply do not hold enough free money ('free').
  const reason: 'assigned' | 'free' | null =
    left <= 0 ? null : freeCents >= Math.max(0, overCents) ? 'assigned' : 'free';
  return { moves, takenCents: Math.max(0, overCents) - left, missingCents: left, reason };
}

export type DistributionState = 'balanced' | 'left' | 'over';

/** State of the remaining "Zu verteilen" (read-model figure). */
export function distributionPass(toBeAssignedCents: number): {
  remainingCents: number;
  state: DistributionState;
} {
  return {
    remainingCents: toBeAssignedCents,
    state: toBeAssignedCents > 0 ? 'left' : toBeAssignedCents < 0 ? 'over' : 'balanced',
  };
}

export interface PassWrite {
  /** 'assign' and 'cover' add to envelopes, 'take' takes back; cents are positive amounts. */
  kind: 'assign' | 'cover' | 'take';
  cents: number;
  undone?: boolean;
}

/**
 * Totals of one pass from the flow's own successful (not undone) writes. `externalCents` is the
 * rest of the change of the month's assigned total since the pass started: changes made outside
 * this flow (other tabs, toast undo, Plan edits).
 */
export function passTotals(
  writes: readonly PassWrite[],
  startAssignedCents: number,
  assignedCents: number,
) {
  let added = 0;
  let taken = 0;
  for (const w of writes) {
    if (w.undone) continue;
    if (w.kind === 'take') taken += w.cents;
    else added += w.cents;
  }
  return {
    assignedCents: added,
    takenBackCents: taken,
    externalCents: assignedCents - startAssignedCents - (added - taken),
  };
}
