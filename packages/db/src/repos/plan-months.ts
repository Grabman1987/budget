import {
  addMonths,
  lastDayOfMonth,
  monthOf,
  monthsBetween,
  quickAssignFigures,
  summarizeMonth,
  unclassifiedMonth,
  type BudgetMonth,
  type CardRule,
} from '@budget/domain';
import { coverBudgetMoney, coverCommitments } from './cover-limits';
import { categoryTree } from './categories';
import { planIncomeTargets } from './income-targets';
import { budgetLedger, budgetOfLedger } from './queries';
import { loadFacts } from './rule-inputs';
import { reportTables } from './report-tables';
import type { Executor } from './types';

/**
 * Plan › Monat for several months in one read (Plan › Jahr shows twelve): the same
 * `{ summary, groups, categories, incomeTargets }` as the single-month endpoint, but the ledger,
 * the category tree, the budget run from the budget start and the rule facts are read and computed
 * once for all months instead of once per month. `budgetMonths` carries money forward only, so a
 * month's figures do not depend on how far the run continues past it.
 */
export function planMonthViews(
  db: Executor,
  months: ReadonlyArray<string>,
  options: { cardRule?: CardRule },
  today: string,
) {
  const wanted = [...new Set(months)].sort();
  const last = wanted[wanted.length - 1];
  if (last === undefined) return {};
  const tree = categoryTree(db);
  const ledger = budgetLedger(db);
  const history = reportTables(db, { today }).months;
  const categoryById = new Map(tree.categories.map((c) => [c.id, c]));
  const facts = loadFacts(db, lastDayOfMonth(last), ledger);
  // Cover limits always read today's facts, as the single and bulk cover do.
  const coverFacts = loadFacts(db, today, ledger);
  const budgetMoney = coverBudgetMoney(db, today, coverFacts);
  const starts = ledger.accounts.filter((a) => a.onBudget).map((a) => monthOf(a.openingDate));
  // One budget run from the first budget month (the facts hold it for the default card rule).
  // Months before it (no budget account was open) keep their own single-month run, as before.
  const run: ReadonlyMap<string, BudgetMonth> = options.cardRule
    ? new Map(
        budgetOfLedger(
          ledger,
          monthsBetween(
            starts.reduce((a, m) => (m < a ? m : a), last),
            last,
          ),
          options,
        ).map((m) => [m.month, m]),
      )
    : facts.budgetByMonth;
  const view = (m: BudgetMonth, month: string) => {
    const base = summarizeMonth(m, tree.categories, tree.targets);
    const limits = new Map(
      coverCommitments(
        db,
        month,
        today,
        ledger,
        coverFacts,
      )(base.envelopes).map((e) => [e.categoryId, e]),
    );
    const summary = {
      ...base,
      envelopes: base.envelopes.map((e) => ({
        ...e,
        ...limits.get(e.categoryId)!,
        ...(categoryById.get(e.categoryId)?.class && {
          quickAssign: quickAssignFigures(
            month,
            today,
            e.categoryId,
            e.target,
            e.needCents,
            history,
            run.get(addMonths(month, -1))?.envelopes[e.categoryId]?.assignedCents ?? 0,
          ),
        }),
      })),
      unclassified: unclassifiedMonth(ledger, month),
    };
    // Facts as `loadFacts(db, lastDayOfMonth(month))` would read them: only the first month differs.
    const monthFacts = {
      ...facts,
      firstMonth: starts.reduce((a, s) => (s < a ? s : a), month),
    };
    return {
      summary,
      budgetMoney,
      groups: tree.groups,
      categories: tree.categories,
      incomeTargets: planIncomeTargets(db, summary, today, monthFacts),
    };
  };
  const out: Record<string, ReturnType<typeof view>> = {};
  for (const month of wanted) {
    const m = run.get(month) ?? budgetOfLedger(ledger, [month], options)[0];
    if (!m) throw new RangeError(`No budget for ${month}`);
    out[month] = view(m, month);
  }
  return out;
}
