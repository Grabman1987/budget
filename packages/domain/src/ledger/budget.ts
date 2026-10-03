import { lastDayOfMonth, nextMonth } from '../date';
import { incomeBudgetMonth } from '../income-month';
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
 * - Credit cards with a `card_payment` envelope ("Kartenzahlung", rule R06): a payment to the
 *   card from a budget account takes money out of that envelope, uncategorised card bookings move
 *   their amount in, and a refund in a category moves its full amount back into the category.
 *   Such a card's own balance is covered by its envelope, so it is not part of the cash.
 *   Under `'ynab'` (all verified against the owner's real export, 30.09.2026), income booked on
 *   a card ("Ready to Assign", e.g. a balance adjustment) moves no envelope, and while the card
 *   has a positive balance (paid in advance), categorised spending is paid from that balance
 *   first: that part moves no envelope and is no card spending (`cardBalanceCover`; by date,
 *   within a day by amount, largest outflow first).
 * - Categorised spending on such a card, `cardRule`:
 *   - `'ynab'` (default, owner decision 30.09.2026): only the **funded** part moves into the card
 *     envelope, i.e. what the category could cover at the end of the month (month-level: covering
 *     the category later in the month funds the card part retroactively). The rest is **credit
 *     overspending**: it stays as new debt on the card (`cardDebtGrowthCents`), the category is
 *     reset to 0 next month like any overspending, but it does NOT reduce the next month's
 *     "Zu verteilen". Only **cash overspending** does. When a category is overspent by cash and
 *     card spending in the same month, the **card** spending explains the overspending first
 *     (credit = min(overspending, net card spending)); cash only the rest. The real export shows
 *     this in every month, although YNAB's help suggests the opposite. Over several cards the
 *     credit part is the latest card spending of the month; refunds on a card first meet the
 *     credit part (`shareCredit`). Categories with `rolloverOverspending` carry their
 *     overspending themselves, so their card spending is always moved in full.
 *   - A transfer from such a card to a budget account without a card envelope (cash advance, e.g.
 *     paying an online wallet with the card) is new card debt and new money in "Zu verteilen";
 *     the card envelope does not move (YNAB help "Credit Card Cash Advances": the funds leave the
 *     card, move to the cash account and increase Ready to Assign).
 *   - `'concept'` (concept §3.1): every card spend moves in full; any overspending is cash
 *     overspending. Kept so the parallel run can show both.
 * - Carry: `max(0, available)` of the previous month, or the full (negative) amount for a category
 *   with `rolloverOverspending`. Cash overspending that is not carried ("ungedeckt") therefore
 *   reduces the next month's "Zu verteilen".
 * - Zu verteilen(m) = Σ cash balances at the end of m − Σ available(m) − held(m) − credit
 *   overspending(m). `held` is money kept for the next month. Credit overspending is subtracted
 *   in its own month because the category shows it as a negative available while no cash left.
 *   This stock formula reproduces YNAB's Ready to Assign (it is exactly 0 in the real export's
 *   fully assigned months); card bookings that move no envelope (`cardOffEnvelopeCents`) do not
 *   reach it, so the flow formula corrects for them.
 */

export interface LedgerAccount extends BalanceAccount {
  onBudget: boolean;
}

export interface LedgerCategory {
  id: string;
  kind: string;
  /** Optional read-model labels used by reports; budget arithmetic does not depend on them. */
  name?: string;
  class?: string | null;
  rolloverOverspending?: boolean;
  /** Set for a `card_payment` category: the card it belongs to. */
  cardAccountId?: string | null;
}

export interface LedgerSplit {
  /** Optional source identity for reports; budget arithmetic does not depend on it. */
  bookingId?: string;
  payeeId?: string | null;
  status?: string;
  accountId: string;
  /** `YYYY-MM-DD` of the booking. */
  date: string;
  incomeNextMonth?: boolean;
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
  /** How categorised card spending is funded (see the module comment). Default `'ynab'`. */
  cardRule?: CardRule;
}

export type CardRule = 'ynab' | 'concept';

export interface BudgetEnvelope extends EnvelopeMonth {
  /** Categorised card spending moved into the card envelopes (negative: net refunds moved back). */
  fundedCardCents: number;
  /** Overspending caused by card spending that no money covered: new card debt. */
  creditOverspentCents: number;
  /** Overspending paid with money that left a budget account: reduces next month's figure. */
  cashOverspentCents: number;
}

export interface BudgetMonth {
  month: string;
  envelopes: Record<string, BudgetEnvelope>;
  /** Per card with a card envelope: debt that grew this month without cover. */
  cards: Record<string, { cardDebtGrowthCents: number }>;
  /** Σ credit overspending of the month (part of the stock formula). */
  creditOverspentCents: number;
  /** Σ balances of the on-budget accounts not covered by a card envelope, end of month. */
  cashCents: number;
  availableCents: number;
  assignedCents: number;
  /** Net uncategorised money into "Zu verteilen" this month (income, refunds, outflows). */
  incomeCents: number;
  /**
   * Card bookings of the month that move no card envelope and so never reach "Zu verteilen"
   * (YNAB): minus income booked on a card (it lowers the debt; the envelope keeps the money), plus
   * spending paid from a positive card balance (the overpayment that made the balance was cash
   * overspending). Only the flow formula needs it; see `toBeAssignedFlow`.
   */
  cardOffEnvelopeCents: number;
  /** Cash overspending of the previous month that was not carried (reduces this month). */
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
  // Categorised spending per month, category and card (only cards with an envelope).
  const onCard = new Map<string, Map<string, CardRow[]>>();
  const rule: CardRule = input.cardRule ?? 'ynab';
  const cashIds = new Set(cashAccounts.map((a) => a.id));
  const incomeCategories = new Set(
    input.categories.filter((c) => c.kind === 'income').map((c) => c.id),
  );
  const effects = splits.map((s) => {
    if (!Number.isSafeInteger(s.amountCents))
      throw new RangeError(`Amounts are integer cents, got ${String(s.amountCents)}`);
    const partner = s.transferAccountId ?? '';
    // Cash advance (YNAB): money from a card into a budget account is new card debt and new money
    // to assign; the card envelope does not move.
    const advanceOut =
      rule === 'ynab' && cardEnvelope.has(s.accountId) && cashIds.has(partner) && s.amountCents < 0;
    const advanceIn =
      rule === 'ynab' && cashIds.has(s.accountId) && cardEnvelope.has(partner) && s.amountCents > 0;
    const effect: SplitEffect = advanceIn
      ? { kind: 'income' }
      : advanceOut
        ? { kind: 'neutral' }
        : splitEffect(s, onBudget, live);
    // Income labels are retained on the split; income still belongs to Zu verteilen.
    if (effect.kind === 'activity' && incomeCategories.has(effect.categoryId))
      return { effect: { kind: 'income' } as SplitEffect, advanceOut };
    return { effect, advanceOut };
  });
  const offEnvelope = new Map<string, number>();
  const unmoved =
    rule === 'ynab' ? creditBalanceCover(input.accounts, cardEnvelope, splits, effects) : [];
  splits.forEach((s, i) => {
    const { effect, advanceOut } = effects[i] as (typeof effects)[number];
    const month =
      effect.kind === 'income' ? incomeBudgetMonth(s.date, s.incomeNextMonth) : s.date.slice(0, 7);
    if (effect.kind === 'activity') add(month, effect.categoryId, s.amountCents);
    if (effect.kind === 'income') income.set(month, (income.get(month) ?? 0) + s.amountCents);
    const card = cardEnvelope.get(s.accountId);
    if (!card || advanceOut) return;
    // YNAB: income on a card ("Ready to Assign", e.g. a balance adjustment) leaves the card
    // envelope alone, like a cash advance.
    if (rule === 'ynab' && effect.kind === 'income') {
      offEnvelope.set(month, (offEnvelope.get(month) ?? 0) + s.amountCents);
      return;
    }
    // The part of a categorised card booking that a positive card balance covers is cash-like.
    const debt = s.amountCents - (unmoved[i] ?? 0);
    if (debt !== s.amountCents)
      offEnvelope.set(month, (offEnvelope.get(month) ?? 0) + s.amountCents - debt);
    add(month, card, -debt);
    if (effect.kind === 'activity' && debt !== 0) {
      const byCategory = onCard.get(month) ?? new Map<string, CardRow[]>();
      const rows = byCategory.get(effect.categoryId) ?? [];
      rows.push({ card: s.accountId, cents: debt, date: s.date, index: i });
      byCategory.set(effect.categoryId, rows);
      onCard.set(month, byCategory);
    }
  });
  const cardCategories = new Set(cardEnvelope.values());
  // Spending categories first: their credit overspending decides what the card envelopes get.
  const ordered = [
    ...input.categories.filter((c) => !cardCategories.has(c.id)),
    ...input.categories.filter((c) => cardCategories.has(c.id)),
  ];

  const out: BudgetMonth[] = [];
  let previous: Map<string, number> = new Map(Object.entries(input.openingCarry ?? {}));
  let previousCredit = 0;
  let firstMonth = true;
  for (const month of months) {
    const assigned = input.assigned?.[month] ?? {};
    const envelopes: Record<string, BudgetEnvelope> = {};
    const cards: Record<string, { cardDebtGrowthCents: number }> = {};
    for (const card of cardEnvelope.keys()) cards[card] = { cardDebtGrowthCents: 0 };
    let availableCents = 0;
    let assignedCents = 0;
    // Overspending reset at the start of this month, less its credit part (that is card debt).
    let uncoveredCents = -previousCredit;
    let creditOverspentCents = 0;
    const next = new Map<string, number>();
    for (const c of ordered) {
      const prev = previous.get(c.id) ?? 0;
      // The opening carry is taken as given; later months apply the carry rule.
      const carryCents = firstMonth || c.rolloverOverspending ? prev : Math.max(0, prev);
      uncoveredCents += carryCents - prev;
      const card = cardCategories.has(c.id)
        ? [...cardEnvelope].find(([, id]) => id === c.id)?.[0]
        : undefined;
      const unfunded = card ? (cards[card]?.cardDebtGrowthCents ?? 0) : 0;
      const e = envelopeMonth({
        carryCents,
        assignedCents: assigned[c.id] ?? 0,
        // A card envelope does not receive the card spending that no category could cover.
        activityCents: (activity.get(month)?.get(c.id) ?? 0) - unfunded,
      });
      const cardRows = onCard.get(month)?.get(c.id);
      const cardNet = (cardRows ?? []).reduce((a, r) => a + r.cents, 0);
      const overspent = e.overspentCents;
      let credit = 0;
      if (rule === 'ynab' && overspent > 0 && !c.rolloverOverspending && cardRows) {
        // Card spending of the month explains the overspending first, cash spending the rest.
        credit = Math.min(overspent, Math.max(0, -cardNet));
        shareCredit(credit, cardRows, cards);
      }
      envelopes[c.id] = {
        ...e,
        fundedCardCents: -cardNet - credit || 0, // never -0
        creditOverspentCents: credit,
        cashOverspentCents: overspent - credit,
      };
      creditOverspentCents += credit;
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
    // Actual cash has arrived already, but next-month income is unavailable this month.
    const deferred = splits.reduce(
      (sum, s, i) =>
        sum +
        (cashIds.has(s.accountId) &&
        effects[i]?.effect.kind === 'income' &&
        s.incomeNextMonth &&
        s.date.slice(0, 7) === month
          ? s.amountCents
          : 0),
      0,
    );
    const heldCents = input.held?.[month] ?? 0;
    out.push({
      month,
      envelopes,
      cards,
      creditOverspentCents,
      cashCents,
      availableCents,
      assignedCents,
      incomeCents: income.get(month) ?? 0,
      cardOffEnvelopeCents: -(offEnvelope.get(month) ?? 0) || 0,
      uncoveredCents,
      heldCents,
      toBeAssignedCents: cashCents - availableCents - heldCents - creditOverspentCents - deferred,
    });
    previous = next;
    previousCredit = creditOverspentCents;
    firstMonth = false;
  }
  return out;
}

/**
 * YNAB: a card with a positive balance (paid in advance) pays categorised spending from that
 * balance first; that part creates no debt, so it neither moves into the card envelope nor counts
 * as card spending. Symmetrically, the part of a refund that lifts the balance above 0 does not
 * move back. For the rows of one card (any order): the signed amount of each row that stays out
 * of the envelope (0 for rows that are not categorised spending or refunds). Rows are taken by
 * date and within a day by amount, largest outflow first (the order of YNAB's register export;
 * the real export only reconciles with it), then in the given order.
 */
export function cardBalanceCover(
  openingBalanceCents: number,
  rows: ReadonlyArray<{ date: string; amountCents: number; categorised: boolean }>,
): number[] {
  const out: number[] = new Array<number>(rows.length).fill(0);
  const order = rows
    .map((r, i) => ({ r, i }))
    .sort(
      (x, y) => x.r.date.localeCompare(y.r.date) || x.r.amountCents - y.r.amountCents || x.i - y.i,
    );
  let balance = openingBalanceCents;
  for (const { r, i } of order) {
    if (r.categorised) out[i] = Math.max(0, balance + r.amountCents) - Math.max(0, balance) || 0;
    balance += r.amountCents;
  }
  return out;
}

function creditBalanceCover(
  accounts: ReadonlyArray<LedgerAccount>,
  cardEnvelope: ReadonlyMap<string, string>,
  splits: ReadonlyArray<LedgerSplit>,
  effects: ReadonlyArray<{ effect: SplitEffect }>,
): number[] {
  const out: number[] = new Array<number>(splits.length).fill(0);
  for (const a of accounts) {
    if (!cardEnvelope.has(a.id)) continue;
    const index = splits.flatMap((s, i) => (s.accountId === a.id ? [i] : []));
    const cover = cardBalanceCover(
      a.openingBalanceCents,
      index.map((i) => ({
        date: (splits[i] as LedgerSplit).date,
        amountCents: (splits[i] as LedgerSplit).amountCents,
        categorised: effects[i]?.effect.kind === 'activity',
      })),
    );
    index.forEach((i, k) => (out[i] = cover[k] as number));
  }
  return out;
}

interface CardRow {
  card: string;
  /** Debt part of a categorised card split (negative: spending, positive: refund). */
  cents: number;
  date: string;
  /** Position in the input: orders rows of one day with the same amount. */
  index: number;
}

/**
 * Share the credit overspending of one category over the cards it was spent on (YNAB, real
 * export): the latest card spending of the month is the unfunded part (within a day, in the
 * order of `cardBalanceCover`: the smallest outflow counts as the latest). Refunds on a card first
 * reduce credit overspending: `credit` plus the refunds (at most the spending) is laid on the
 * spending from the latest row backwards, then the refunds take their part back from the latest
 * refund backwards (a card whose refund met credit overspending gets negative debt growth: the
 * refund stays in its envelope instead of moving back to the category).
 */
function shareCredit(
  credit: number,
  rows: ReadonlyArray<CardRow>,
  cards: Record<string, { cardDebtGrowthCents: number }>,
): void {
  const latestFirst = [...rows].sort(
    (a, b) => b.date.localeCompare(a.date) || b.cents - a.cents || b.index - a.index,
  );
  const spent = rows.reduce((a, r) => a + Math.max(0, -r.cents), 0);
  const refunded = rows.reduce((a, r) => a + Math.max(0, r.cents), 0);
  let lay = Math.min(credit + refunded, spent);
  let back = lay - credit;
  for (const r of latestFirst) {
    const entry = cards[r.card];
    if (!entry) continue;
    const part = r.cents < 0 ? Math.min(lay, -r.cents) : -Math.min(back, r.cents);
    if (r.cents < 0) lay -= part;
    else back += part;
    entry.cardDebtGrowthCents += part;
  }
}

/**
 * The same figure as a flow from the previous month (for checks and explanations): what was
 * left, plus income, minus everything assigned, minus last month's uncovered cash overspending
 * (credit overspending became card debt and does not count), plus the amount held last month,
 * minus the amount held now.
 */
export function toBeAssignedFlow(input: {
  previousCents: number;
  incomeCents: number;
  assignedCents: number;
  uncoveredCents: number;
  heldPreviousCents?: number;
  heldCents?: number;
  /** `BudgetMonth.cardOffEnvelopeCents` of this month. */
  cardOffEnvelopeCents?: number;
}): number {
  return (
    input.previousCents +
    input.incomeCents -
    input.assignedCents -
    input.uncoveredCents +
    (input.heldPreviousCents ?? 0) -
    (input.heldCents ?? 0) +
    (input.cardOffEnvelopeCents ?? 0)
  );
}
