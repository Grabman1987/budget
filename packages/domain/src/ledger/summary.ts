import type { BudgetEnvelope, BudgetMonth } from './budget';
import { targetNeed, type CategoryTarget, type TargetNeed } from './targets';

/**
 * One month of the budget as Plan › Monat shows it: "Zu verteilen" with its dimension chain,
 * every envelope with its target need, and the sums per group. Computed from one `budgetMonths`
 * result; the pages never add these figures up themselves.
 */

export interface SummaryCategory {
  id: string;
  groupId: string;
  kind: string;
}

export interface VersionedTarget extends CategoryTarget {
  categoryId: string;
  /** `YYYY-MM` from which this version applies. */
  validFrom: string;
}

export interface EnvelopeSummary extends BudgetEnvelope, TargetNeed {
  categoryId: string;
  target: VersionedTarget | null;
}

export interface Totals {
  assignedCents: number;
  activityCents: number;
  availableCents: number;
}

export interface MonthSummary extends Totals {
  month: string;
  /** Dimension chain: carry-in + income − uncovered − assigned − held = to be assigned. */
  carryInCents: number;
  incomeCents: number;
  uncoveredCents: number;
  heldCents: number;
  toBeAssignedCents: number;
  creditOverspentCents: number;
  cashOverspentCents: number;
  fundedCardCents: number;
  envelopes: EnvelopeSummary[];
  groups: Array<Totals & { groupId: string }>;
  cards: Array<{ accountId: string; cardDebtGrowthCents: number }>;
}

/** The target version that applies in `month` (latest `validFrom` ≤ month), if any. */
export function targetFor(
  targets: ReadonlyArray<VersionedTarget>,
  categoryId: string,
  month: string,
): VersionedTarget | null {
  let best: VersionedTarget | null = null;
  for (const t of targets) {
    if (t.categoryId !== categoryId || t.validFrom > month) continue;
    if (!best || t.validFrom > best.validFrom) best = t;
  }
  return best;
}

const add = (a: Totals, e: Totals) => {
  a.assignedCents += e.assignedCents;
  a.activityCents += e.activityCents;
  a.availableCents += e.availableCents;
};

/** Summary of one computed month (categories in list order). Pure. */
export function summarizeMonth(
  month: BudgetMonth,
  categories: ReadonlyArray<SummaryCategory>,
  targets: ReadonlyArray<VersionedTarget> = [],
): MonthSummary {
  const envelopes: EnvelopeSummary[] = [];
  const groups = new Map<string, Totals & { groupId: string }>();
  const totals: Totals = { assignedCents: 0, activityCents: 0, availableCents: 0 };
  let cash = 0;
  let funded = 0;
  for (const c of categories) {
    const e = month.envelopes[c.id];
    if (!e) continue;
    const target = targetFor(targets, c.id, month.month);
    const need = target
      ? targetNeed(target, {
          month: month.month,
          carryCents: e.carryCents,
          assignedCents: e.assignedCents,
          refill: c.kind === 'variable',
        })
      : { goalCents: 0, needCents: 0, dueMonth: null };
    envelopes.push({ ...e, ...need, categoryId: c.id, target });
    const g = groups.get(c.groupId) ?? {
      groupId: c.groupId,
      assignedCents: 0,
      activityCents: 0,
      availableCents: 0,
    };
    add(g, e);
    groups.set(c.groupId, g);
    add(totals, e);
    cash += e.cashOverspentCents;
    funded += e.fundedCardCents;
  }
  const { incomeCents, uncoveredCents, heldCents, toBeAssignedCents } = month;
  return {
    month: month.month,
    ...totals,
    // Whatever the previous month left (its "Zu verteilen" and the money held for this month):
    // derived from the stock so the chain always adds up, also in the first month.
    carryInCents: toBeAssignedCents - incomeCents + uncoveredCents + month.assignedCents + heldCents,
    incomeCents,
    uncoveredCents,
    heldCents,
    toBeAssignedCents,
    creditOverspentCents: month.creditOverspentCents,
    cashOverspentCents: cash,
    fundedCardCents: funded,
    envelopes,
    groups: [...groups.values()],
    cards: Object.entries(month.cards).map(([accountId, c]) => ({ accountId, ...c })),
  };
}
