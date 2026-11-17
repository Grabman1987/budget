import { balanceChain, type ChainTerm } from '../chain';
import { daysBetween } from '../date';
import { cents } from '../money/cents';

/**
 * "Frei bis Gehalt" (the Leitmaß of Heute) as a cash-flow figure: cash balance of the budget cash
 * accounts today - open outflows due before payday. Owner decisions 2026-11-17: neither the
 * overdraft nor expected inflows count as free money; the overdraft is the separate line
 * `lastResortCents`, expected inflows exist only in `liquidityForecast`. Integer cents.
 */

export interface FreeAccount {
  id: string;
  name: string;
  /** Balance today; negative when overdrawn. */
  balanceCents: number;
  /** Activated overdraft limit (positive); null/0 = no Dispo. */
  overdraftLimitCents: number | null;
}

export interface OpenOutflow {
  id: string;
  label: string;
  /** Due day `YYYY-MM-DD`. */
  day: string;
  /** Positive amount still to pay. */
  cents: number;
}

export interface FreeUntilPaydayInput {
  /** Budget cash accounts. */
  accounts: ReadonlyArray<FreeAccount>;
  /** Expected outflows that are not paid yet (paid ones must not be passed). */
  openOutflows: ReadonlyArray<OpenOutflow>;
  /** `YYYY-MM-DD` of the next salary. Items due on or after it are not counted. */
  payday: string;
  today: string;
  /** Rounding of the chain terms (`balanceChain`). Always cent precision; retained for caller compatibility. */
  precision?: 'euro' | 'cent';
}

export interface FreeUntilPayday {
  balanceCents: number;
  openCents: number;
  /** Letzte Reserve: unused activated overdraft limit; never part of `freeCents`. */
  lastResortCents: number;
  freeCents: number;
  /** Whole days from today to payday (0 on payday, negative when it has passed). */
  daysToPayday: number;
  /** Maßkette: Kontostand - offen bis Gehalt = frei verfügbar. */
  chain: ChainTerm[];
  /** Drill-down behind the terms. */
  items: {
    accounts: FreeAccount[];
    open: OpenOutflow[];
  };
}

const sum = (xs: ReadonlyArray<number>): number => xs.reduce((a, v) => a + v, 0);

/**
 * "Letzte Reserve (Dispo)": the unused part of the activated overdraft limits, per account
 * (limit minus the amount already overdrawn, never below 0). Credit from the bank that has to be
 * repaid: never free money, shown on its own line, identical on Heute and in the forecast.
 */
export function overdraftLastResort(
  accounts: ReadonlyArray<Pick<FreeAccount, 'balanceCents' | 'overdraftLimitCents'>>,
): number {
  accounts.forEach((a) => {
    cents(a.balanceCents);
    cents(a.overdraftLimitCents ?? 0);
  });
  return cents(
    sum(
      accounts.map((a) =>
        Math.max(0, Math.max(0, a.overdraftLimitCents ?? 0) - Math.max(0, -a.balanceCents)),
      ),
    ),
  );
}

export function freeUntilPayday(input: FreeUntilPaydayInput): FreeUntilPayday {
  input.accounts.forEach((a) => {
    cents(a.balanceCents);
    cents(a.overdraftLimitCents ?? 0);
  });
  input.openOutflows.forEach((o) => cents(o.cents));
  const open = input.openOutflows.filter((o) => o.day < input.payday);
  const balanceCents = sum(input.accounts.map((a) => a.balanceCents));
  const openCents = sum(open.map((o) => o.cents));
  const freeCents = balanceCents - openCents;
  const terms: ChainTerm[] = [
    { label: 'Kontostand', value: cents(balanceCents) },
    { label: 'offen bis Gehalt', value: cents(openCents), op: '-' },
  ];
  terms.push({ label: 'frei verfügbar', value: cents(freeCents), op: '=', result: true });
  return {
    balanceCents,
    openCents,
    lastResortCents: overdraftLastResort(input.accounts),
    freeCents,
    daysToPayday: daysBetween(input.today, input.payday),
    chain: balanceChain(terms, 'cent'),
    items: { accounts: [...input.accounts], open },
  };
}
