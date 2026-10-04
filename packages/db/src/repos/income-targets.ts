import {
  addMonths,
  dueDates,
  incomeBudgetMonth,
  incomeMonthDefault,
  incomeTargets,
  lastDayOfMonth,
  versionOn,
  type MonthSummary,
} from '@budget/domain';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { booking, expectedOccurrence, INCOME_TYPES } from '../schema';
import { schedulePayment } from './expected';
import { incomeMonthRules } from './income-month';
import { loadFacts, type RuleFacts } from './rule-inputs';
import type { Executor } from './types';

/**
 * Read live schedules, including future versions; never materialise or match payments. Income is
 * counted in the month it is assigned to (decision 42), not the month of its cash date.
 */
export function planIncomeTargets(
  db: Executor,
  summary: MonthSummary,
  today: string,
  /** Facts of the month when the caller has them (they only differ by `firstMonth` and budgets). */
  preloaded?: RuleFacts,
) {
  const month = summary.month;
  const facts = preloaded ?? loadFacts(db, lastDayOfMonth(month));
  const excluded = new Set<string>([INCOME_TYPES.capital.id, INCOME_TYPES.refund.id]);
  const accounts = new Map(facts.accounts.map((a) => [a.id, a]));
  const categories = new Map(facts.categories.map((c) => [c.id, c]));
  const expected: Array<number | null> = [];
  const rules = incomeMonthRules(db);
  // A booking linked to an occurrence is the owner's decision and beats the rule default.
  const linked = new Map<string, boolean>();
  for (const row of db
    .select({
      key: expectedOccurrence.expectedPaymentId,
      due: expectedOccurrence.dueDate,
      next: booking.incomeNextMonth,
    })
    .from(expectedOccurrence)
    .innerJoin(booking, eq(booking.id, expectedOccurrence.bookingId))
    .where(and(isNotNull(expectedOccurrence.bookingId), isNull(booking.deletedAt)))
    .all())
    linked.set(row.key + '|' + row.due, row.next);
  for (const p of facts.payments) {
    if (p.kind !== 'inflow' || (p.incomeTypeId && excluded.has(p.incomeTypeId))) continue;
    if (p.categoryId && categories.get(p.categoryId)?.kind === 'advance') continue;
    if (p.accountId && !accounts.get(p.accountId)?.onBudget) continue;
    const ruleNext = incomeMonthDefault(rules, p.payeeId, p.categoryId, p.incomeTypeId);
    // The previous month is read too: a payment due then may be assigned to this month.
    for (const day of dueDates(
      schedulePayment(p),
      `${addMonths(month, -1)}-01`,
      lastDayOfMonth(month),
    )) {
      if (incomeBudgetMonth(day, linked.get(p.id + '|' + day) ?? ruleNext) !== month) continue;
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
      .filter(
        (s) => incomeBudgetMonth(s.day, s.incomeNextMonth) === m && !excluded.has(s.incomeTypeId),
      )
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
