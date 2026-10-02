import { cardBalanceCover, lastDayOfMonth } from '@budget/domain';
import { READY_TO_ASSIGN, type RawModel, type RawSplit } from './model';

/**
 * YNAB's own budget figures per plan month, derived from the export alone (no mapping): the
 * Ready to Assign of the month and the credit overspending per card.
 *
 * Ready to Assign = Σ budget cash (without cards) at the end of the month − Σ Available − credit
 * overspending, where the credit overspending of a card is what its payment category did not
 * receive: −(Σ card rows of the month without cash advances, income on the card and the part paid
 * from a positive card balance) − Activity of the payment category. Plan.tsv has no Ready to
 * Assign row; this stock formula reproduces the figure YNAB shows (verified against the owner's
 * screenshots).
 */

export interface YnabMonth {
  month: string;
  readyToAssignCents: number;
  /** Σ Available of all plan categories. */
  availableCents: number;
  /** Credit overspending per card account (YNAB name). */
  creditByCard: Record<string, number>;
  creditCents: number;
}

/** Σ amounts dated on or before a day, from entries in any order. */
export function running(entries: { date: string; cents: number }[]): (day: string) => number {
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

/** Balance of a YNAB account at the end of a day; scheduled rows are left out. */
export function ynabBalances(raw: RawModel): (account: string, day: string) => number {
  const rows = new Map<string, { date: string; cents: number }[]>();
  for (const b of raw.bookings) {
    if (b.scheduled) continue;
    const list = rows.get(b.account) ?? [];
    list.push({ date: b.date, cents: b.amountCents });
    rows.set(b.account, list);
  }
  const sums = new Map([...rows].map(([name, list]) => [name, running(list)]));
  return (account, day) => sums.get(account)?.(day) ?? 0;
}

/** YNAB's figures for every plan month (see the module comment). */
export function ynabMonths(raw: RawModel): YnabMonth[] {
  const balance = ynabBalances(raw);
  const booked = raw.bookings.filter((b) => !b.scheduled);
  const names = new Set(booked.map((b) => b.account));
  const cards = raw.categories.filter((c) => c.cardAccount !== null && names.has(c.cardAccount));
  const cardNames = new Set(cards.map((c) => c.cardAccount));
  const cash = raw.accounts.filter((a) => a.proposal.onBudget && !cardNames.has(a.name));
  const cashNames = new Set(cash.map((a) => a.name));
  const onBudgetNames = new Set(raw.accounts.filter((a) => a.proposal.onBudget).map((a) => a.name));
  // Card rows per card and month that move its payment category (the debt part), without cash
  // advances (card → budget account) and income on the card ("Ready to Assign"), which YNAB
  // neither moves into the payment category nor counts as overspending, and without the part of
  // categorised rows that a positive card balance covers (`cardBalanceCover`).
  const cardRows = new Map<string, number>();
  for (const name of cardNames) {
    const rows = booked
      .filter((b) => b.account === name)
      .flatMap((b) => b.splits.map((x) => ({ date: b.date, x })));
    const budgetPartner = (x: RawSplit) =>
      x.transferAccount !== null && onBudgetNames.has(x.transferAccount);
    const noCategory = (x: RawSplit) => x.categoryKey === null || x.categoryKey === READY_TO_ASSIGN;
    const cover = cardBalanceCover(
      0,
      rows.map(({ date, x }) => ({
        date,
        amountCents: x.amountCents,
        categorised: !noCategory(x) && !budgetPartner(x),
      })),
    );
    rows.forEach(({ date, x }, i) => {
      const advance =
        x.amountCents < 0 && x.transferAccount !== null && cashNames.has(x.transferAccount);
      const income = noCategory(x) && !budgetPartner(x);
      if (advance || income) return;
      const k = `${name}|${date.slice(0, 7)}`;
      cardRows.set(k, (cardRows.get(k) ?? 0) + x.amountCents - (cover[i] as number));
    });
  }
  const asOf = raw.asOf ?? '9999-12-31';
  return raw.months.map((month) => {
    const plan = raw.plan[month] ?? {};
    const end = lastDayOfMonth(month) < asOf ? lastDayOfMonth(month) : asOf;
    const creditByCard: Record<string, number> = {};
    let creditCents = 0;
    for (const c of cards) {
      const name = c.cardAccount as string;
      const credit =
        -(cardRows.get(`${name}|${month}`) ?? 0) - (plan[c.key]?.activityCents ?? 0) || 0;
      creditByCard[name] = (creditByCard[name] ?? 0) + credit;
      creditCents += credit;
    }
    let availableCents = 0;
    for (const cell of Object.values(plan)) availableCents += cell.availableCents;
    const cashCents = cash.reduce((a, acc) => a + balance(acc.name, end), 0);
    return {
      month,
      readyToAssignCents: cashCents - availableCents - creditCents,
      availableCents,
      creditByCard,
      creditCents,
    };
  });
}
