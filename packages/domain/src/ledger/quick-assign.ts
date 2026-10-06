import { addMonths, monthOf } from '../date';
import type { TableMonth } from '../report-tables';
import { averageCents, freedomSumCents } from '../wealth/freedom';

export type QuickAssignMode = 'empty' | 'last-month' | 'average' | 'target';
export interface QuickAssignFigures {
  lastMonthCents: number;
  averageCents: number;
  ghostCents: number;
  ghostSource: 'target' | 'median';
  historyMonths: string[];
}

/** Existing report spending/assignment and existing target need; no ledger reclassification. */
export function quickAssignFigures(
  month: string,
  today: string,
  categoryId: string,
  target: object | null,
  needCents: number,
  history: ReadonlyArray<Pick<TableMonth, 'month' | 'spending' | 'assigned'>>,
  previousAssignedCents?: number,
): QuickAssignFigures {
  const end = month < monthOf(today) ? month : monthOf(today);
  const historyMonths = [-3, -2, -1].map((n) => addMonths(end, n));
  const byMonth = new Map(history.map((m) => [m.month, m]));
  // Empty calendar months count as zero, including months before the budget started.
  const spent = historyMonths.map((m) => byMonth.get(m)?.spending[categoryId] ?? 0);
  if (freedomSumCents(spent) === null)
    throw new RangeError('Quick assignment history exceeds safe cents');
  const median = [...spent].sort((a, b) => a - b)[1]!;
  return {
    lastMonthCents:
      previousAssignedCents ?? byMonth.get(addMonths(month, -1))?.assigned[categoryId] ?? 0,
    averageCents: Math.max(0, averageCents(spent)),
    ghostCents: Math.max(0, target ? needCents : median),
    ghostSource: target ? 'target' : 'median',
    historyMonths,
  };
}

interface QuickAssignRow {
  categoryId: string;
  assignedCents: number;
  needCents: number;
  target: object | null;
  quickAssign?: QuickAssignFigures;
}

/** Absolute assignments in displayed sort order, capped at shared Zu verteilen. */
export function quickAssignPlan(
  rows: ReadonlyArray<QuickAssignRow>,
  mode: QuickAssignMode,
  toBeAssignedCents: number,
) {
  const wanted = rows.flatMap((r) => {
    if (!r.quickAssign || (mode === 'empty' && r.assignedCents !== 0)) return [];
    const value =
      mode === 'empty'
        ? r.quickAssign.ghostCents
        : mode === 'last-month'
          ? r.quickAssign.lastMonthCents
          : mode === 'average'
            ? r.quickAssign.averageCents
            : r.target
              ? r.assignedCents + r.needCents
              : r.assignedCents;
    return [{ ...r, value }];
  });
  // A reduction can fund another selected category in the same atomic action.
  const released = wanted.map((r) => Math.max(0, r.assignedCents - r.value));
  let left = freedomSumCents([toBeAssignedCents, ...released]);
  if (left === null) throw new RangeError('Quick assignment pool exceeds safe cents');
  left = Math.max(0, left);
  const items: Array<{ categoryId: string; assignedCents: number }> = [];
  const missing: number[] = [];
  for (const r of wanted) {
    const added = Math.max(0, r.value - r.assignedCents);
    const funded = Math.min(added, left);
    left -= funded;
    const assignedCents = added > 0 ? r.assignedCents + funded : r.value;
    if (!Number.isSafeInteger(assignedCents))
      throw new RangeError('Quick assignment exceeds safe cents');
    if (assignedCents !== r.assignedCents) items.push({ categoryId: r.categoryId, assignedCents });
    if (funded < added) missing.push(added - funded);
  }
  const missingCents = freedomSumCents(missing);
  if (missingCents === null) throw new RangeError('Quick assignment shortfall exceeds safe cents');
  return { items, changedCount: items.length, openCount: missing.length, missingCents };
}
