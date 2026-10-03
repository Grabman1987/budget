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
  const { available, parts } = input;
  const months = available.slice(-12);
  const previousMonths = available.length >= 24 ? available.slice(-24, -12) : null;
  const totals = parts.map((p) => sumOver(p.monthly, months));
  const previous = previousMonths ? parts.map((p) => sumOver(p.monthly, previousMonths)) : null;
  const totalCents = totals.reduce((a, b) => a + b, 0);
  const previousTotalCents = previous ? previous.reduce((a, b) => a + b, 0) : null;
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
