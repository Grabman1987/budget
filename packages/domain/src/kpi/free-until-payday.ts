import { balanceChain, type ChainTerm } from '../chain';
import { daysBetween } from '../date';
import { cents } from '../money/cents';

/**
 * "Frei bis Gehalt" (the Leitmaß of Heute) as a cash-flow figure: cash balance of the budget cash
 * accounts today + expected inflows before payday - open outflows due before payday + the
 * activated overdraft headroom (sum of the limits of accounts that have one). Integer cents.
 */

export interface FreeAccount {
  id: string;
  name: string;
  /** Balance today; negative when overdrawn. */
  balanceCents: number;
  /** Activated overdraft limit (positive); null/0 = no Dispo. */
  overdraftLimitCents: number | null;
}

export interface ExpectedInflow {
  id: string;
  label: string;
  /** Due day `YYYY-MM-DD`. */
  day: string;
  /** Positive amount still expected. */
  cents: number;
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
  /** Inflows that are not received yet. Those due on or after payday are ignored. */
  expectedInflows: ReadonlyArray<ExpectedInflow>;
  /** Expected outflows that are not paid yet (paid ones must not be passed). */
  openOutflows: ReadonlyArray<OpenOutflow>;
  /** `YYYY-MM-DD` of the next salary. Items due on or after it are not counted. */
  payday: string;
  today: string;
  /** Rounding of the chain terms (`balanceChain`). Default: whole euros, the largest term absorbs. */
  precision?: 'euro' | 'cent';
}

export interface FreeUntilPayday {
  balanceCents: number;
  inflowCents: number;
  openCents: number;
  /** Sum of the activated overdraft limits. */
  overdraftCents: number;
  freeCents: number;
  /** Whole days from today to payday (0 on payday, negative when it has passed). */
  daysToPayday: number;
  /** Maßkette: Kontostand + Eingänge - offen bis Gehalt + Dispo-Rahmen = frei verfügbar. */
  chain: ChainTerm[];
  /** Drill-down behind the terms. */
  items: {
    accounts: FreeAccount[];
    inflow: ExpectedInflow[];
    open: OpenOutflow[];
  };
}

const sum = (xs: ReadonlyArray<number>): number => xs.reduce((a, v) => a + v, 0);

export function freeUntilPayday(input: FreeUntilPaydayInput): FreeUntilPayday {
  const inflow = input.expectedInflows.filter((i) => i.day < input.payday);
  const open = input.openOutflows.filter((o) => o.day < input.payday);
  const balanceCents = sum(input.accounts.map((a) => a.balanceCents));
  const inflowCents = sum(inflow.map((i) => i.cents));
  const openCents = sum(open.map((o) => o.cents));
  const overdraftCents = sum(input.accounts.map((a) => Math.max(0, a.overdraftLimitCents ?? 0)));
  const freeCents = balanceCents + inflowCents - openCents + overdraftCents;
  const terms: ChainTerm[] = [
    { label: 'Kontostand', value: cents(balanceCents) },
    { label: 'erwartete Eingänge', value: cents(inflowCents), op: '+' },
    { label: 'offen bis Gehalt', value: cents(openCents), op: '-' },
  ];
  if (overdraftCents > 0)
    terms.push({ label: 'Dispo-Rahmen', value: cents(overdraftCents), op: '+' });
  terms.push({ label: 'frei verfügbar', value: cents(freeCents), op: '=', result: true });
  return {
    balanceCents,
    inflowCents,
    openCents,
    overdraftCents,
    freeCents,
    daysToPayday: daysBetween(input.today, input.payday),
    chain: balanceChain(terms, input.precision ?? 'euro'),
    items: { accounts: [...input.accounts], inflow, open },
  };
}
