import { budgetMonths, lastDayOfMonth, monthsBetween, type BudgetMonth } from '@budget/domain';
import { budgetInputOf, type AssignedShift, type MovedAmount, type TargetModel } from './mapping';
import type { RawModel } from './model';
import { running, ynabBalances, ynabMonths } from './ynab-budget';

/**
 * Gate 2 as data (`docs/migration/ynab-export.md` §Import run and checks): the target model run
 * through the domain's `budgetMonths` (`cardRule: 'ynab'`) against the export, in every month.
 *
 * - `balance`: every account (budget, card, loan and tracking) at every month end from the start
 *   (and `today`) against the register sums plus the adjustments the mapping declares.
 * - `available`: per target category and month against the sum of its YNAB categories in
 *   Plan.tsv; a card payment envelope plus the change of its card's credit overspending
 *   (`creditShift`: spending the app funds and YNAB did not, or the other way round).
 * - `activity`: per spending category and month against its sources plus what rules moved in.
 * - `to_be_assigned`: "Zu verteilen" against YNAB's Ready to Assign (`ynabMonths`).
 * - `total`: Σ Available + Zu verteilen + credit overspending (the budget cash).
 *
 * `applyMapping` re-derives the assigned amounts so that all of these hold (`balanceEnvelopes`);
 * the reconciliation checks the result independently through the domain's budget.
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
  /** Assigned amounts the importer changed to keep the envelopes (`balanceEnvelopes`). */
  shifts: AssignedShift[];
  /**
   * How much the app's credit overspending differs from YNAB's per month: a rule that moves card
   * spending changes how much of it is funded. The card envelopes hold the difference.
   */
  creditShift: { month: string; cents: number }[];
  checked: Record<Check, number>;
  budget: BudgetMonth[];
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

  // Balances of every account (budget, card, loan and tracking accounts alike) against the register
  // plus the adjustments the mapping declares; rows after the "as of" day are scheduled and count
  // nowhere yet.
  const ynabBalance = ynabBalances(raw);
  const targetRows = new Map<string, { date: string; cents: number }[]>();
  for (const b of target.bookings) {
    const list = targetRows.get(b.accountId) ?? [];
    list.push({ date: b.date, cents: b.amountCents });
    targetRows.set(b.accountId, list);
  }
  const lastBooking = raw.bookings
    .filter((b) => !b.scheduled)
    .reduce((a, b) => (b.date > a ? b.date : a), '');
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
    const sum = running((targetRows.get(a.id) ?? []).filter((r) => r.date >= a.openingDate));
    const declared = running(a.adjustments.map((x) => ({ date: x.date, cents: x.amountCents })));
    for (const day of days)
      compare({
        check: 'balance',
        month: day.slice(0, 7),
        account: a.id,
        day,
        expectedCents: ynabBalance(a.ynabName, day) + declared(day),
        actualCents: day < a.openingDate ? 0 : a.openingBalanceCents + sum(day),
      });
  }

  // Categories, Zu verteilen and totals in every month.
  const ynab = new Map(ynabMonths(raw).map((m) => [m.month, m]));
  const movedIn = new Map<string, number>();
  for (const m of target.moved) {
    if (m.toCategory !== null) {
      const k = `${m.month}|${m.toCategory}`;
      movedIn.set(k, (movedIn.get(k) ?? 0) + m.cents);
    }
    if (m.fromCategory !== null) {
      const k = `${m.month}|${m.fromCategory}`;
      movedIn.set(k, (movedIn.get(k) ?? 0) - m.cents);
    }
  }
  const cards = new Map(
    target.categories
      .filter((c) => c.kind === 'card_payment' && c.cardAccountId !== null)
      .map((c) => [c.id, target.accounts.find((a) => a.id === c.cardAccountId)]),
  );
  const creditShift: Reconciliation['creditShift'] = [];
  target.months.forEach((month, i) => {
    const b = budget[i] as BudgetMonth;
    const y = ynab.get(month);
    const plan = raw.plan[month] ?? {};
    for (const c of target.categories) {
      const e = b.envelopes[c.id];
      const sum = (f: 'activityCents' | 'availableCents') =>
        c.sources.reduce((a, key) => a + (plan[key]?.[f] ?? 0), 0);
      const card = cards.get(c.id);
      // A card envelope also holds the card spending the app funds and YNAB did not (or the
      // other way round): YNAB's credit overspending of the card minus the app's.
      const credit = card
        ? (y?.creditByCard[card.ynabName] ?? 0) - (b.cards[card.id]?.cardDebtGrowthCents ?? 0)
        : 0;
      if (c.sources.length > 0 || e?.availableCents)
        compare({
          check: 'available',
          month,
          category: c.id,
          expectedCents: sum('availableCents') + credit,
          actualCents: e?.availableCents ?? 0,
        });
      // Activity: the sources' plus what rules moved in (card envelopes depend on the funding of
      // every category and are covered by their Available).
      if (!card && (c.sources.length > 0 || e?.activityCents))
        compare({
          check: 'activity',
          month,
          category: c.id,
          expectedCents: sum('activityCents') + (movedIn.get(`${month}|${c.id}`) ?? 0),
          actualCents: e?.activityCents ?? 0,
        });
    }
    const readyToAssign = y?.readyToAssignCents ?? 0;
    const credit = y?.creditCents ?? 0;
    compare({
      check: 'to_be_assigned',
      month,
      expectedCents: readyToAssign,
      actualCents: b.toBeAssignedCents,
    });
    // Σ Available + Zu verteilen + credit overspending: the cash of the budget accounts.
    compare({
      check: 'total',
      month,
      expectedCents: readyToAssign + (y?.availableCents ?? 0) + credit,
      actualCents: b.toBeAssignedCents + b.availableCents + b.creditOverspentCents,
    });
    if (b.creditOverspentCents !== credit)
      creditShift.push({ month, cents: b.creditOverspentCents - credit });
  });

  return {
    differences,
    moved: target.moved,
    shifts: target.shifts,
    creditShift,
    checked,
    budget,
  };
}
