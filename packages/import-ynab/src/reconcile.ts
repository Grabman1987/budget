import {
  addMonths,
  budgetMonths,
  lastDayOfMonth,
  monthsBetween,
  type BudgetMonth,
} from '@budget/domain';
import {
  budgetInputOf,
  INVESTMENT_TYPES,
  type MovedAmount,
  type TargetAccount,
  type TargetModel,
} from './mapping';
import type { RawModel } from './model';

/**
 * Gate 2 as data (`docs/migration/ynab-export.md` §Import run and checks): the target model run
 * through the domain's `budgetMonths` (`cardRule: 'ynab'`) against the export.
 *
 * - `balance`: every budget account and loan at every month end from the start (and `today`)
 *   against the register sums, independent of any mapping. Investment accounts are Gate 3.
 * - `activity` / `available`: per target category and month against the sum of its YNAB
 *   categories in Plan.tsv, until the first month a rule moved money into or out of it.
 * - `to_be_assigned`: "Zu verteilen" against YNAB's Ready to Assign plus the Available of dropped
 *   categories, until the first month any rule moved money. YNAB's figure is derived from the
 *   export: Σ budget cash (without cards) − Σ Available − credit overspending, where the credit
 *   overspending of a card is what its payment category did not receive:
 *   −(Σ card rows of the month) − Activity of the payment category.
 * - `total`: Σ Available + Zu verteilen against the same total of YNAB, in every month (rules move
 *   money between categories but keep the total).
 */

export type Check = 'balance' | 'activity' | 'available' | 'to_be_assigned' | 'total';

export interface Difference {
  check: Check;
  month: string;
  /** Target account id (balance) or target category id (activity, available). */
  account?: string;
  category?: string;
  /** Day of a balance check. */
  day?: string;
  expectedCents: number;
  actualCents: number;
}

export interface Reconciliation {
  differences: Difference[];
  /** Amounts moved by rules, per rule, month and pair of categories. */
  moved: MovedAmount[];
  checked: Record<Check, number>;
  budget: BudgetMonth[];
}

/** Σ amounts dated on or before a day, from entries in any order. */
function running(entries: { date: string; cents: number }[]): (day: string) => number {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const prefix: number[] = [];
  sorted.reduce((a, e) => (prefix.push(a + e.cents), a + e.cents), 0);
  return (day) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((sorted[mid] as { date: string }).date <= day) lo = mid + 1;
      else hi = mid;
    }
    return lo === 0 ? 0 : (prefix[lo - 1] as number);
  };
}

export function reconcile(
  raw: RawModel,
  target: TargetModel,
  options: { today?: string } = {},
): Reconciliation {
  const budget = budgetMonths(budgetInputOf(target));
  const differences: Difference[] = [];
  const checked: Record<Check, number> = {
    balance: 0,
    activity: 0,
    available: 0,
    to_be_assigned: 0,
    total: 0,
  };
  const compare = (d: Difference) => {
    checked[d.check] += 1;
    if (d.expectedCents !== d.actualCents) differences.push(d);
  };

  const byAccount = <T>(
    rows: T[],
    account: (r: T) => string,
    entry: (r: T) => { date: string; cents: number },
  ) => {
    const out = new Map<string, { date: string; cents: number }[]>();
    for (const r of rows) {
      const list = out.get(account(r)) ?? [];
      list.push(entry(r));
      out.set(account(r), list);
    }
    return out;
  };
  const ynabRows = byAccount(
    raw.bookings,
    (b) => b.account,
    (b) => ({ date: b.date, cents: b.amountCents }),
  );
  const ynab = new Map([...ynabRows].map(([name, rows]) => [name, running(rows)]));
  const targetRows = byAccount(
    target.bookings,
    (b) => b.accountId,
    (b) => ({ date: b.date, cents: b.amountCents }),
  );
  const ynabBalance = (name: string, day: string) => ynab.get(name)?.(day) ?? 0;
  const targetBalance = (a: TargetAccount) => {
    const sum = running((targetRows.get(a.id) ?? []).filter((r) => r.date >= a.openingDate));
    return (day: string) => (day < a.openingDate ? 0 : a.openingBalanceCents + sum(day));
  };

  // Balances.
  const lastBooking = raw.bookings.reduce((a, b) => (b.date > a ? b.date : a), '');
  const lastMonth = [
    target.months[target.months.length - 1] ?? '',
    lastBooking.slice(0, 7),
  ].sort()[1] as string;
  const days = monthsBetween(target.startMonth, lastMonth).map(lastDayOfMonth);
  if (options.today) days.push(options.today);
  for (const a of target.accounts) {
    if (INVESTMENT_TYPES.includes(a.type)) continue;
    const balance = targetBalance(a);
    for (const day of days)
      compare({
        check: 'balance',
        month: day.slice(0, 7),
        account: a.id,
        day,
        expectedCents: ynabBalance(a.ynabName, day),
        actualCents: balance(day),
      });
  }

  // Categories, Zu verteilen and totals.
  const firstMove = new Map<string, string>();
  let anyMove: string | null = null;
  for (const m of target.moved) {
    for (const id of [m.fromCategory, m.toCategory])
      if (id !== null && (firstMove.get(id) ?? '9999') > m.month) firstMove.set(id, m.month);
    if (anyMove === null || m.month < anyMove) anyMove = m.month;
  }
  const kept = new Set(target.categories.flatMap((c) => c.sources));
  const cards = raw.categories.filter((c) => c.cardAccount !== null && ynab.has(c.cardAccount));
  const cardNames = new Set(cards.map((c) => c.cardAccount));
  const cash = target.accounts.filter((a) => a.onBudget && !cardNames.has(a.ynabName));
  target.months.forEach((month, i) => {
    const b = budget[i] as BudgetMonth;
    const plan = raw.plan[month] ?? {};
    for (const c of target.categories) {
      const until = firstMove.get(c.id);
      if (c.sources.length === 0 || (until !== undefined && month >= until)) continue;
      const e = b.envelopes[c.id];
      const sum = (f: 'activityCents' | 'availableCents') =>
        c.sources.reduce((a, key) => a + (plan[key]?.[f] ?? 0), 0);
      compare({
        check: 'activity',
        month,
        category: c.id,
        expectedCents: sum('activityCents'),
        actualCents: e?.activityCents ?? 0,
      });
      compare({
        check: 'available',
        month,
        category: c.id,
        expectedCents: sum('availableCents'),
        actualCents: e?.availableCents ?? 0,
      });
    }
    const end = lastDayOfMonth(month);
    const credit = cards.reduce((a, c) => {
      const card = c.cardAccount as string;
      const spent =
        ynabBalance(card, end) - ynabBalance(card, lastDayOfMonth(addMonths(month, -1)));
      return a - spent - (plan[c.key]?.activityCents ?? 0);
    }, 0);
    let available = 0;
    let dropped = 0;
    for (const [key, cell] of Object.entries(plan)) {
      available += cell.availableCents;
      if (!kept.has(key)) dropped += cell.availableCents;
    }
    const readyToAssign =
      cash.reduce((a, acc) => a + ynabBalance(acc.ynabName, end), 0) - available - credit;
    if (anyMove === null || month < anyMove)
      compare({
        check: 'to_be_assigned',
        month,
        expectedCents: readyToAssign + dropped,
        actualCents: b.toBeAssignedCents,
      });
    compare({
      check: 'total',
      month,
      expectedCents: readyToAssign + available,
      actualCents: b.toBeAssignedCents + b.availableCents,
    });
  });

  return { differences, moved: target.moved, checked, budget };
}
