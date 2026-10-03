import { lastDayOfMonth } from '../date';
import type { PaceFixed } from '../kpi/pace';

export interface PaceCategorySource {
  kind: string;
  planCents: number;
  actualCents: number;
  dueDay: number | null;
  scheduled: ReadonlyArray<PaceFixed>;
}

/** Fixed spending is never multiplied by elapsed days. Partial payments reduce open bills. */
export function paceSources(
  month: string,
  today: string,
  categories: ReadonlyArray<PaceCategorySource>,
) {
  const fixed: PaceFixed[] = [];
  let fixedSpentCents = 0;
  let limitCents = 0;
  const complete = today >= lastDayOfMonth(month);
  for (const c of categories) {
    const scheduled = [...c.scheduled].sort((a, b) => a.day.localeCompare(b.day));
    let actual = c.actualCents;
    const planned = Math.max(0, c.planCents);
    const scheduledTotal = scheduled.reduce((sum, o) => sum + o.cents, 0);
    limitCents += Math.max(planned, scheduledTotal);
    const fixedCategory = ['fixed', 'periodic', 'debt'].includes(c.kind);
    if (!fixedCategory && scheduled.length === 0) continue;
    fixedSpentCents += fixedCategory ? actual : Math.min(Math.max(0, actual), scheduledTotal);
    if (scheduled.length > 0) {
      for (const o of scheduled) {
        const paidCents = Math.min(Math.max(0, actual), o.cents);
        fixed.push({
          ...o,
          settled: complete || o.settled === true || paidCents === o.cents,
          paidCents,
        });
        actual = Math.max(0, actual - o.cents);
      }
    } else {
      const dueDay = Math.min(c.dueDay ?? 1, Number(lastDayOfMonth(month).slice(8)));
      fixed.push({
        day: `${month}-${String(dueDay).padStart(2, '0')}`,
        cents: c.kind === 'periodic' ? Math.max(0, actual) : Math.max(planned, actual),
        settled: complete || actual >= planned,
        paidCents: Math.max(0, actual),
      });
    }
  }
  return { fixed, fixedSpentCents, limitCents };
}
