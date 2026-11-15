import { overspentEnvelopes } from '@budget/domain';
import type { PlanRow } from './plan-model';

export const PLAN_FILTERS = [
  'all',
  'attention',
  'underfunded',
  'overfunded',
  'overspent',
  'available',
  'uncategorized',
] as const;
export type PlanFilter = (typeof PLAN_FILTERS)[number];
export interface PlanFilterSearch {
  filter?: PlanFilter | undefined;
  q?: string | undefined;
  /** Guided routine on Plan › Monat (#1055): "verteilen" opens "Geld verteilen". */
  ablauf?: 'verteilen' | undefined;
}

/** Bound the shareable presentation state; financial rows still come from the budget API. */
export function validatePlanFilterSearch(search: Record<string, unknown>): PlanFilterSearch {
  return {
    filter: PLAN_FILTERS.includes(search['filter'] as PlanFilter)
      ? (search['filter'] as PlanFilter)
      : undefined,
    q: typeof search['q'] === 'string' ? search['q'].slice(0, 100) : undefined,
    ...(search['ablauf'] === 'verteilen' ? { ablauf: 'verteilen' as const } : {}),
  };
}

export function categoryNameMatches(name: string, query: string): boolean {
  return name.toLocaleLowerCase('de-AT').includes(query.trim().toLocaleLowerCase('de-AT'));
}

/** The same row set drives each count and its list, including the hidden-category boundary. */
export function filterPlanRows(rows: PlanRow[], filter: PlanFilter): PlanRow[] {
  switch (filter) {
    case 'attention': {
      const overspent = new Set(overspentEnvelopes({ envelopes: rows }));
      return rows.filter((row) => row.needCents > 0 || overspent.has(row));
    }
    case 'underfunded':
      return rows.filter((row) => row.needCents > 0);
    case 'overfunded':
      return rows.filter(
        (row) =>
          row.overspentCents === 0 &&
          row.needCents === 0 &&
          row.target &&
          row.assignedCents > row.goalCents,
      );
    case 'overspent':
      return overspentEnvelopes({ envelopes: rows });
    case 'available':
      return rows.filter((row) => row.availableCents > 0);
    case 'uncategorized':
      return [];
    default:
      return rows;
  }
}
