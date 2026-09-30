import { budgetMonths, lastDayOfMonth, monthsBetween, type BudgetMonth } from '@budget/domain';
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
 *   money between categories but keep the total). A rule also changes how much card spending its
 *   categories can fund; from the first move on, card envelopes are not compared, the total
 *   includes the credit overspending and its change is listed in `creditShift`.
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
  /**
   * From the first rule move on: how much the credit overspending differs from YNAB's per month.
   * A rule changes a category's carry and so how much of its card spending is funded.
   */
  creditShift: { month: string; cents: number }[];
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
  // Rows after the export's "as of" day are scheduled: YNAB counts them nowhere yet.
  const booked = raw.bookings.filter((b) => !b.scheduled);
  const ynabRows = byAccount(
    booked,
    (b) => b.account,
    (b) => ({ date: b.date, cents: b.amountCents }),
  );
  const ynab = new Map([...ynabRows].map(([name, rows]) => [name, running(rows)]));
  const targetRows = byAccount(
    target.bookings.filter((b) => !b.scheduled),
    (b) => b.accountId,
    (b) => ({ date: b.date, cents: b.amountCents }),
  );
  const ynabBalance = (name: string, day: string) => ynab.get(name)?.(day) ?? 0;
  const targetBalance = (a: TargetAccount) => {
    const sum = running((targetRows.get(a.id) ?? []).filter((r) => r.date >= a.openingDate));
    return (day: string) => (day < a.openingDate ? 0 : a.openingBalanceCents + sum(day));
  };

  // Balances.
  const lastBooking = booked.reduce((a, b) => (b.date > a ? b.date : a), '');
  const lastMonth = [
    target.months[target.months.length - 1] ?? '',
    lastBooking.slice(0, 7),
  ].sort()[1] as string;
  const asOf = raw.asOf ?? '9999-12-31';
  const days = monthsBetween(target.startMonth, lastMonth)
    .map(lastDayOfMonth)
    .filter((day) => day <= asOf);
  const today = options.today ?? raw.asOf;
  if (today) days.push(today);
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
  const creditShift: Reconciliation['creditShift'] = [];
  const kept = new Set(target.categories.flatMap((c) => c.sources));
  // YNAB's side uses the export's own budget status, not the mapping's.
  const cards = raw.categories.filter((c) => c.cardAccount !== null && ynab.has(c.cardAccount));
  const cardNames = new Set(cards.map((c) => c.cardAccount));
  const cash = raw.accounts.filter((a) => a.proposal.onBudget && !cardNames.has(a.name));
  const cashNames = new Set(cash.map((a) => a.name));
  // Card rows per card and month, without cash advances (card → budget account), which YNAB
  // neither moves into the payment category nor counts as overspending.
  const cardRows = new Map<string, number>();
  for (const b of booked)
    if (cardNames.has(b.account))
      for (const x of b.splits) {
        if (x.amountCents < 0 && x.transferAccount !== null && cashNames.has(x.transferAccount))
          continue;
        const k = `${b.account}|${b.date.slice(0, 7)}`;
        cardRows.set(k, (cardRows.get(k) ?? 0) + x.amountCents);
      }
  target.months.forEach((month, i) => {
    const b = budget[i] as BudgetMonth;
    const plan = raw.plan[month] ?? {};
    const moved = anyMove !== null && month >= anyMove;
    for (const c of target.categories) {
      const until = firstMove.get(c.id);
      // Card envelopes depend on every category's funding, so they count as touched by any move.
      const touched =
        (until !== undefined && month >= until) || (moved && c.kind === 'card_payment');
      if (c.sources.length === 0 || touched) continue;
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
    const end = lastDayOfMonth(month) < asOf ? lastDayOfMonth(month) : asOf;
    const credit = cards.reduce(
      (a, c) =>
        a - (cardRows.get(`${c.cardAccount}|${month}`) ?? 0) - (plan[c.key]?.activityCents ?? 0),
      0,
    );
    let available = 0;
    let dropped = 0;
    for (const [key, cell] of Object.entries(plan)) {
      available += cell.availableCents;
      if (!kept.has(key)) dropped += cell.availableCents;
    }
    const readyToAssign =
      cash.reduce((a, acc) => a + ynabBalance(acc.name, end), 0) - available - credit;
    if (!moved)
      compare({
        check: 'to_be_assigned',
        month,
        expectedCents: readyToAssign + dropped,
        actualCents: b.toBeAssignedCents,
      });
    // Σ Available + Zu verteilen; once rules moved money, plus the credit overspending (whose
    // change is listed in `creditShift`).
    compare({
      check: 'total',
      month,
      expectedCents: readyToAssign + available + (moved ? credit : 0),
      actualCents: b.toBeAssignedCents + b.availableCents + (moved ? b.creditOverspentCents : 0),
    });
    if (moved && b.creditOverspentCents !== credit)
      creditShift.push({ month, cents: b.creditOverspentCents - credit });
  });

  return { differences, moved: target.moved, creditShift, checked, budget };
}
