import {
  addMonths,
  dueDates,
  incomeTargets,
  lastDayOfMonth,
  versionOn,
  type MonthSummary,
} from '@budget/domain';
import { INCOME_TYPES } from '../schema';
import { schedulePayment } from './expected';
import { loadFacts } from './rule-inputs';
import type { Executor } from './types';

/** Read live schedules, including future versions; never materialise or match payments. */
export function planIncomeTargets(db: Executor, summary: MonthSummary, today: string) {
  const month = summary.month;
  const facts = loadFacts(db, lastDayOfMonth(month));
  const excluded = new Set<string>([INCOME_TYPES.capital.id, INCOME_TYPES.refund.id]);
  const accounts = new Map(facts.accounts.map((a) => [a.id, a]));
  const categories = new Map(facts.categories.map((c) => [c.id, c]));
  const expected: Array<number | null> = [];
  for (const p of facts.payments) {
    if (p.kind !== 'inflow' || (p.incomeTypeId && excluded.has(p.incomeTypeId))) continue;
    if (p.categoryId && categories.get(p.categoryId)?.kind === 'advance') continue;
    if (p.accountId && !accounts.get(p.accountId)?.onBudget) continue;
    for (const day of dueDates(schedulePayment(p), `${month}-01`, lastDayOfMonth(month))) {
      const v = versionOn(facts.versions.get(p.id) ?? [], day);
      // Lower end of an income range is the conservative estimate. No implicit FX conversion.
      expected.push(
        v?.currency === 'EUR' ? Math.min(v.amountCents, v.amountMaxCents ?? v.amountCents) : null,
      );
    }
  }
  const previous = addMonths(month, -1);
  const history = [-3, -2, -1].map((delta) => {
    const m = addMonths(month < today.slice(0, 7) ? month : today.slice(0, 7), delta);
    if (m < facts.firstMonth) return null;
    const total = facts.incomeSplits
      .filter((s) => s.day.startsWith(m) && !excluded.has(s.incomeTypeId))
      .reduce((a, s) => a + s.cents, 0);
    return total;
  });
  return incomeTargets({
    expected,
    history,
    heldCents: summary.heldCents,
    previousHeldCents: facts.budgetByMonth.get(previous)?.heldCents ?? 0,
    envelopes: summary.envelopes,
  });
}
