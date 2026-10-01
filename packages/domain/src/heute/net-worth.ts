import { addMonths, lastDayOfMonth, monthOf } from '../date';

/**
 * Net worth on Heute: the split into liquidity, invested and debt (the Maßkette), the change
 * against the previous month end and the 12 month ends of the sparkline. Pure.
 */

export interface NetWorthAccount {
  role: 'budget' | 'reserve' | 'investment' | 'debt' | 'receivable';
  /** Balance plus positions in EUR cents (negative for a card or loan owed). */
  valueCents: number;
}

export interface NetWorthParts {
  /** Positive balances of budget and reserve accounts. */
  liquidCents: number;
  /** Accounts with the investment role (balance plus market value). */
  investedCents: number;
  /** Open receivables from contacts (role receivable); shown separately, see the owner decision. */
  receivableCents: number;
  /** Everything owed: every negative account value, any role (≤ 0). */
  debtCents: number;
  /** liquid + invested + receivable + debt = net worth. */
  totalCents: number;
}

export function netWorthParts(accounts: ReadonlyArray<NetWorthAccount>): NetWorthParts {
  let liquidCents = 0;
  let investedCents = 0;
  let receivableCents = 0;
  let debtCents = 0;
  for (const a of accounts) {
    if (a.valueCents < 0) debtCents += a.valueCents;
    else if (a.role === 'investment') investedCents += a.valueCents;
    else if (a.role === 'receivable') receivableCents += a.valueCents;
    else if (a.role === 'debt') debtCents += a.valueCents;
    else liquidCents += a.valueCents;
  }
  return {
    liquidCents,
    investedCents,
    receivableCents,
    debtCents,
    totalCents: liquidCents + investedCents + receivableCents + debtCents,
  };
}

/** Change in basis points of the previous value, rounded half away from zero; `null` from 0. */
export function changeBp(currentCents: number, previousCents: number): number | null {
  if (previousCents === 0) return null;
  const v = Math.round(((currentCents - previousCents) * 10_000) / Math.abs(previousCents));
  return v === 0 ? 0 : v;
}

/**
 * The days of the net worth series: the end of each of the 11 months before today's month and
 * today itself (the last point), oldest first; the point before the last is the previous month end.
 */
export function netWorthDays(today: string, months = 12): string[] {
  const out: string[] = [];
  for (let k = months - 1; k >= 1; k--) out.push(lastDayOfMonth(addMonths(monthOf(today), -k)));
  out.push(today);
  return out;
}
