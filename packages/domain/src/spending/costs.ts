import { cents } from '../money';
import { ratioBp, shareBps } from '../wealth/int';

/**
 * Bank- und Zinskosten (2.6): what the money itself costs, from booked costs only. Fund costs
 * (TER) are never booked, they lower the price; they are shown apart as an estimate and are not
 * part of these sums. Earnings (interest, dividends) are shown next to the costs, labelled, and
 * are not household income (owner decision 02.10.2026).
 */

export interface CostPart {
  key: string;
  name: string;
  /** Cost per month in positive cents; months without an entry are 0. */
  monthly: Readonly<Record<string, number>>;
}

export interface CostRow {
  key: string;
  name: string;
  cents: number;
  /** The twelve months before; `null` when the ledger does not reach back that far. */
  previousCents: number | null;
  changeBp: number | null;
  /** Share of the total in basis points (adds up to 10 000), 0 without costs. */
  shareBp: number;
}

export interface CostYear {
  year: number;
  /** First and last month of the year inside the data. */
  from: string;
  to: string;
  months: number;
  /** Fewer than twelve months: the year is cut at the start or at the end of the data. */
  partial: boolean;
  /** One cost per part, in the order of the parts. */
  partCents: number[];
  totalCents: number;
  earningsCents: number;
}

export interface CostsOverview {
  months: string[];
  previousMonths: string[] | null;
  rows: CostRow[];
  totalCents: number;
  previousTotalCents: number | null;
  changeCents: number | null;
  earningsCents: number;
  previousEarningsCents: number | null;
  /** Earnings minus costs; negative = net cost. */
  netCents: number;
  previousNetCents: number | null;
  /** Costs over the household income of the window in basis points; `null` without income. */
  incomeShareBp: number | null;
  years: CostYear[];
}

const sumOver = (values: Readonly<Record<string, number>>, months: ReadonlyArray<string>) => {
  let total = 0;
  for (const m of months) total += values[m] ?? 0;
  if (!Number.isSafeInteger(total)) throw new RangeError('Costs exceed safe integer cents');
  return total;
};

export function costsOverview(input: {
  /** Full months, ascending. */
  available: ReadonlyArray<string>;
  parts: ReadonlyArray<CostPart>;
  /** Interest and dividends per month, positive cents. */
  earnings: Readonly<Record<string, number>>;
  /** Household income of the last twelve months (without Kapitalerträge). */
  incomeCents: number;
}): CostsOverview {
  const { available } = input;
  const parts = input.parts.filter((p) => available.some((m) => (p.monthly[m] ?? 0) !== 0));
  const months = available.slice(-12);
  const previousMonths = available.length >= 24 ? available.slice(-24, -12) : null;
  const totals = parts.map((p) => sumOver(p.monthly, months));
  const previous = previousMonths ? parts.map((p) => sumOver(p.monthly, previousMonths)) : null;
  const totalCents = cents(totals.reduce((a, b) => a + b, 0));
  const previousTotalCents = previous ? cents(previous.reduce((a, b) => a + b, 0)) : null;
  const shares = shareBps(totals, totalCents);
  const rows: CostRow[] = parts.map((p, i) => {
    const before = previous ? (previous[i] as number) : null;
    return {
      key: p.key,
      name: p.name,
      cents: totals[i] as number,
      previousCents: before,
      changeBp:
        before !== null && before > 0 ? ratioBp((totals[i] as number) - before, before) : null,
      shareBp: shares[i] as number,
    };
  });
  const earningsCents = sumOver(input.earnings, months);
  const previousEarningsCents = previousMonths ? sumOver(input.earnings, previousMonths) : null;

  const years: CostYear[] = [];
  const byYear = new Map<number, string[]>();
  for (const m of available) {
    const y = Number(m.slice(0, 4));
    byYear.set(y, [...(byYear.get(y) ?? []), m]);
  }
  for (const [year, ms] of byYear) {
    const partCents = parts.map((p) => sumOver(p.monthly, ms));
    years.push({
      year,
      from: ms[0] as string,
      to: ms[ms.length - 1] as string,
      months: ms.length,
      partial: ms.length < 12,
      partCents,
      totalCents: partCents.reduce((a, b) => a + b, 0),
      earningsCents: sumOver(input.earnings, ms),
    });
  }
  return {
    months,
    previousMonths,
    rows,
    totalCents,
    previousTotalCents,
    changeCents: previousTotalCents === null ? null : totalCents - previousTotalCents,
    earningsCents,
    previousEarningsCents,
    netCents: earningsCents - totalCents,
    previousNetCents:
      previousTotalCents === null || previousEarningsCents === null
        ? null
        : previousEarningsCents - previousTotalCents,
    incomeShareBp: input.incomeCents > 0 ? ratioBp(totalCents, input.incomeCents) : null,
    years,
  };
}

/** An account's debt movement alone never establishes an interest/fee cost. */
export function isBookedCreditCost(input: {
  creditAccount: boolean;
  feeCategory: boolean;
  categoryKind: string;
  transfer: boolean;
  systemEntry: boolean;
}): boolean {
  return (
    input.creditAccount &&
    input.feeCategory &&
    !input.transfer &&
    !input.systemEntry &&
    !['debt', 'invest', 'card_payment', 'advance', 'income'].includes(input.categoryKind)
  );
}

export interface CombinedCosts {
  /** Household bank and interest costs without trade and depot fees (own block, no portfolio ratio). */
  householdCents: number;
  /** Trade fees and fees of depot-like accounts (counted once, from the bank reader). */
  portfolioFeeCents: number;
  /** Fund costs (TER share); never booked, so never part of the bank costs. */
  terCents: number;
  /** Portfolio-related costs: fees plus TER. Taxes are not part of it. */
  portfolioCostCents: number;
  /** Tax the broker withheld (negative = refund); shown apart and not in the cost ratio. */
  taxCents: number;
  /** Household costs, portfolio costs and taxes. */
  totalCents: number;
  /** Portfolio costs over portfolio value in basis points; `null` without a portfolio value. */
  ratioBp: number | null;
}

/**
 * One annual cost figure over the existing readers (2.6 and 4.5). `bankCents` is the whole bank
 * total, of which `portfolioFeeCents` (trade fees and fees of depot-like accounts) belongs to the
 * portfolio; the rest is household cost and gets no portfolio ratio. The portfolio reader's own
 * trading fees are left out on purpose: the bank reader already counts them, so adding both would
 * count them twice. Withheld taxes may be negative (refund) and stay out of the ratio.
 */
export function combinedCosts(input: {
  bankCents: number;
  portfolioFeeCents: number;
  terCents: number;
  taxCents: number;
  valueCents: number;
}): CombinedCosts {
  const totalCents = input.bankCents + input.terCents + input.taxCents;
  const portfolioCostCents = input.portfolioFeeCents + input.terCents;
  const householdCents = input.bankCents - input.portfolioFeeCents;
  if (![totalCents, portfolioCostCents, householdCents].every(Number.isSafeInteger))
    throw new RangeError('Costs exceed safe integer cents');
  return {
    householdCents,
    portfolioFeeCents: input.portfolioFeeCents,
    terCents: input.terCents,
    portfolioCostCents,
    taxCents: input.taxCents,
    totalCents,
    ratioBp: input.valueCents > 0 ? ratioBp(portfolioCostCents, input.valueCents) : null,
  };
}
