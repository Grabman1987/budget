import { lastDayOfMonth, nextMonth } from '../date';
import { accountBalances, type BalanceAccount } from './balances';
import { envelopeMonth, type EnvelopeMonth } from './envelope';

/**
 * The budget (Envelope-Kern, concept §3.1 and §5.3) from raw ledger data, month by month.
 * One function computes "Zu verteilen" and every envelope; pages and read models call it and
 * never recompute either.
 *
 * Rules:
 * - Only on-budget accounts matter. A split on a tracking account never touches an envelope.
 * - A split with a category is activity of that envelope. A split without category is income to
 *   (or an outflow from) "Zu verteilen", unless it is a transfer leg whose other account is also
 *   on-budget: then it is neutral (money only moves between budget accounts), and a category on
 *   it has no effect either. Money to or from a tracking account is budgeted on the on-budget leg.
 * - Credit cards with a `card_payment` envelope: every booking on the card changes that envelope
 *   by the opposite of its amount. Spending on the card moves money from the spending envelope
 *   into "Kartenzahlung", a payment from the current account takes it out again (rule R06). Such a
 *   card's own balance is covered by its envelope, so it is not part of the cash in the formula.
 * - Carry: `max(0, available)` of the previous month, or the full (negative) amount for a category
 *   with `rolloverOverspending`. Overspending that is not carried ("ungedeckt") therefore reduces
 *   the next month's "Zu verteilen".
 * - Zu verteilen(m) = Σ cash balances at the end of m − Σ available(m) − held(m). `held` is money
 *   kept for the next month.
 */

export interface LedgerAccount extends BalanceAccount {
  onBudget: boolean;
}

export interface LedgerCategory {
  id: string;
  kind: string;
  rolloverOverspending?: boolean;
  /** Set for a `card_payment` category: the card it belongs to. */
  cardAccountId?: string | null;
}

export interface LedgerSplit {
  accountId: string;
  /** `YYYY-MM-DD` of the booking. */
  date: string;
  amountCents: number;
  categoryId: string | null;
  /** Account of the other leg when this split (or its whole booking) is a transfer leg. */
  transferAccountId?: string | null;
}

export interface BudgetInput {
  /** Live accounts only; splits on other accounts are ignored. */
  accounts: ReadonlyArray<LedgerAccount>;
  /** Live categories only; splits in other categories count as uncategorised. */
  categories: ReadonlyArray<LedgerCategory>;
  /** Splits of live bookings, any order. */
  splits: ReadonlyArray<LedgerSplit>;
  /** Consecutive months `YYYY-MM`, ascending. */
  months: ReadonlyArray<string>;
  /** `{ [month]: { [categoryId]: cents } }` */
  assigned?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** Held for next month, per month. */
  held?: Readonly<Record<string, number>>;
  /** Available per category before the first month (the opening envelopes). */
  openingCarry?: Readonly<Record<string, number>>;
}

export interface BudgetMonth {
  month: string;
  envelopes: Record<string, EnvelopeMonth>;
  /** Σ balances of the on-budget accounts not covered by a card envelope, end of month. */
  cashCents: number;
  availableCents: number;
  assignedCents: number;
  /** Net uncategorised money into "Zu verteilen" this month (income, refunds, outflows). */
  incomeCents: number;
  /** Overspending of the previous month that was not carried (reduces this month). */
  uncoveredCents: number;
  heldCents: number;
  toBeAssignedCents: number;
}

export type SplitEffect =
  | { kind: 'none' }
  | { kind: 'neutral' }
  | { kind: 'income' }
  | { kind: 'activity'; categoryId: string };

/** What a split does to the budget (see the rules above); the card move is separate. */
export function splitEffect(
  split: LedgerSplit,
  onBudget: ReadonlyMap<string, boolean>,
  liveCategories: ReadonlySet<string>,
): SplitEffect {
  if (onBudget.get(split.accountId) !== true) return { kind: 'none' };
  const partner = split.transferAccountId ?? null;
  if (partner !== null && onBudget.get(partner) === true) return { kind: 'neutral' };
  if (split.categoryId !== null && liveCategories.has(split.categoryId))
    return { kind: 'activity', categoryId: split.categoryId };
  return { kind: 'income' };
}

/** The budget for each of `input.months` (see the module comment). Pure. */
export function budgetMonths(input: BudgetInput): BudgetMonth[] {
  const { months } = input;
  months.forEach((m, i) => {
    if (i > 0 && nextMonth(months[i - 1] as string) !== m)
      throw new Error(`Months must be consecutive, got ${months[i - 1]} then ${m}`);
  });
  const onBudget = new Map(input.accounts.map((a) => [a.id, a.onBudget]));
  const live = new Set(input.categories.map((c) => c.id));
  const cardEnvelope = new Map<string, string>();
  for (const c of input.categories)
    if (c.kind === 'card_payment' && c.cardAccountId && onBudget.get(c.cardAccountId))
      cardEnvelope.set(c.cardAccountId, c.id);
  const cashAccounts = input.accounts.filter((a) => a.onBudget && !cardEnvelope.has(a.id));
  const openedOn = new Map(input.accounts.map((a) => [a.id, a.openingDate]));
  // The opening-date rule (C5): bookings before an account's opening date are not part of it.
  const splits = input.splits.filter((s) => {
    const from = openedOn.get(s.accountId);
    return from !== undefined && s.date >= from;
  });

  // Activity and income per month.
  const activity = new Map<string, Map<string, number>>();
  const income = new Map<string, number>();
  // A budget account opened during the period brings its opening balance as income.
  for (const a of cashAccounts) {
    const month = a.openingDate.slice(0, 7);
    income.set(month, (income.get(month) ?? 0) + a.openingBalanceCents);
  }
  const add = (month: string, categoryId: string, cents: number) => {
    const row = activity.get(month) ?? new Map<string, number>();
    row.set(categoryId, (row.get(categoryId) ?? 0) + cents);
    activity.set(month, row);
  };
  for (const s of splits) {
    if (!Number.isSafeInteger(s.amountCents))
      throw new RangeError(`Amounts are integer cents, got ${String(s.amountCents)}`);
    const month = s.date.slice(0, 7);
    const effect = splitEffect(s, onBudget, live);
    if (effect.kind === 'activity') add(month, effect.categoryId, s.amountCents);
    if (effect.kind === 'income') income.set(month, (income.get(month) ?? 0) + s.amountCents);
    const card = cardEnvelope.get(s.accountId);
    if (card) add(month, card, -s.amountCents);
  }

  const out: BudgetMonth[] = [];
  let previous: Map<string, number> = new Map(Object.entries(input.openingCarry ?? {}));
  let firstMonth = true;
  for (const month of months) {
    const assigned = input.assigned?.[month] ?? {};
    const envelopes: Record<string, EnvelopeMonth> = {};
    let availableCents = 0;
    let assignedCents = 0;
    let uncoveredCents = 0;
    const next = new Map<string, number>();
    for (const c of input.categories) {
      const prev = previous.get(c.id) ?? 0;
      // The opening carry is taken as given; later months apply the carry rule.
      const carryCents = firstMonth || c.rolloverOverspending ? prev : Math.max(0, prev);
      uncoveredCents += carryCents - prev;
      const e = envelopeMonth({
        carryCents,
        assignedCents: assigned[c.id] ?? 0,
        activityCents: activity.get(month)?.get(c.id) ?? 0,
      });
      envelopes[c.id] = e;
      availableCents += e.availableCents;
      assignedCents += e.assignedCents;
      next.set(c.id, e.availableCents);
    }
    const balances = accountBalances(
      cashAccounts,
      splits.filter((s) => cashAccounts.some((a) => a.id === s.accountId)),
      lastDayOfMonth(month),
    );
    let cashCents = 0;
    for (const v of balances.values()) cashCents += v;
    const heldCents = input.held?.[month] ?? 0;
    out.push({
      month,
      envelopes,
      cashCents,
      availableCents,
      assignedCents,
      incomeCents: income.get(month) ?? 0,
      uncoveredCents,
      heldCents,
      toBeAssignedCents: cashCents - availableCents - heldCents,
    });
    previous = next;
    firstMonth = false;
  }
  return out;
}

/**
 * The same figure as a flow from the previous month (for checks and explanations): what was
 * left, plus income, minus everything assigned, minus last month's uncovered overspending, plus
 * the amount held last month, minus the amount held now.
 */
export function toBeAssignedFlow(input: {
  previousCents: number;
  incomeCents: number;
  assignedCents: number;
  uncoveredCents: number;
  heldPreviousCents?: number;
  heldCents?: number;
}): number {
  return (
    input.previousCents +
    input.incomeCents -
    input.assignedCents -
    input.uncoveredCents +
    (input.heldPreviousCents ?? 0) -
    (input.heldCents ?? 0)
  );
}
