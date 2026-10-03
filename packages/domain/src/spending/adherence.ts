import { ratioBp } from '../wealth/int';

/**
 * Budgettreue (2.2): do we keep the plan? "Plan" is the money assigned to a category (Zugewiesen):
 * that is what the owner decided in Plan > Monat. A periodic category spends its yearly bill in
 * the due month out of the reserve saved in the months before, so its plan is the reserve that
 * was there (carry in plus assigned); comparing it with the twelfth alone would call every bill
 * an overspend. Over twelve months the carry cancels out and plan is plain assigned money.
 */
export interface AdherenceInput {
  id: string;
  name: string;
  groupName: string;
  class: 'need' | 'want';
  kind: string;
  assignedCents: number;
  /** Available amount carried in from the previous month (never negative in the budget). */
  carryCents: number;
  /** Net spending of the month, positive. */
  spendCents: number;
}

export interface AdherenceItem {
  id: string;
  name: string;
  groupName: string;
  class: 'need' | 'want';
  planCents: number;
  istCents: number;
  /** `reserve` = periodic category (carry in plus assigned), `assigned` = assigned in the month. */
  planBasis: 'assigned' | 'reserve';
  over: boolean;
}

export interface AdherenceMonth {
  items: AdherenceItem[];
  /** Group names in the order of first appearance. */
  groups: string[];
  overCount: number;
  planCents: number;
  istCents: number;
  /** Plan minus Ist; negative = overspent in total. */
  restCents: number;
}

/** One month of the plan against the actuals, for the consumption categories (Bedarf, Wunsch). */
export function adherenceMonth(rows: ReadonlyArray<AdherenceInput>): AdherenceMonth {
  const items: AdherenceItem[] = rows
    .map((r): AdherenceItem => {
      const reserve = r.kind === 'periodic';
      const planCents = reserve ? Math.max(0, r.carryCents) + r.assignedCents : r.assignedCents;
      return {
        id: r.id,
        name: r.name,
        groupName: r.groupName,
        class: r.class,
        planCents,
        istCents: r.spendCents,
        planBasis: reserve ? 'reserve' : 'assigned',
        over: r.spendCents > planCents,
      };
    })
    .filter((x) => x.planCents !== 0 || x.istCents !== 0);
  const planCents = items.reduce((a, x) => a + x.planCents, 0);
  const istCents = items.reduce((a, x) => a + x.istCents, 0);
  if (!Number.isSafeInteger(planCents) || !Number.isSafeInteger(istCents))
    throw new RangeError('Plan exceeds safe integer cents');
  return {
    items,
    groups: [...new Set(items.map((x) => x.groupName))],
    overCount: items.filter((x) => x.over).length,
    planCents,
    istCents,
    restCents: planCents - istCents,
  };
}

export interface PlanDeviationRow {
  id: string;
  name: string;
  class: 'need' | 'want';
  planCents: number;
  istCents: number;
  /** Ist against plan in basis points (+1 000 = 10 % more than planned). */
  deviationBp: number | null;
  deviationCents: number;
  /** Within ± 10 %. */
  inBand: boolean | null;
}

/** The band of the plan deviation: "Ziel ± 10 %". */
export const DEVIATION_BAND_BP = 1_000;

/**
 * Rolling plan deviation per category: Σ assigned against Σ spent over the given months. Only
 * nonempty categories count; absolute deviation first, ties by name. A nonpositive net plan or
 * any withdrawal from assigned money has no meaningful percentage comparison.
 */
export function planDeviation(
  months: ReadonlyArray<ReadonlyArray<AdherenceInput>>,
): PlanDeviationRow[] {
  const sums = new Map<string, PlanDeviationRow>();
  const withdrawals = new Set<string>();
  for (const month of months)
    for (const r of month) {
      if (r.assignedCents < 0) withdrawals.add(r.id);
      const row = sums.get(r.id) ?? {
        id: r.id,
        name: r.name,
        class: r.class,
        planCents: 0,
        istCents: 0,
        deviationBp: null,
        deviationCents: 0,
        inBand: true,
      };
      row.planCents += r.assignedCents;
      row.istCents += r.spendCents;
      sums.set(r.id, row);
    }
  return [...sums.values()]
    .filter((r) => r.planCents !== 0 || r.istCents !== 0)
    .map((r) => {
      const deviationCents = r.istCents - r.planCents;
      const deviationBp =
        r.planCents > 0 && !withdrawals.has(r.id) ? ratioBp(deviationCents, r.planCents) : null;
      return {
        ...r,
        deviationCents,
        deviationBp,
        inBand: deviationBp === null ? null : Math.abs(deviationBp) <= DEVIATION_BAND_BP,
      };
    })
    .sort(
      (a, b) =>
        Math.abs(b.deviationCents) - Math.abs(a.deviationCents) ||
        a.name.localeCompare(b.name, 'de'),
    );
}
