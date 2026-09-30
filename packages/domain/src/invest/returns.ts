import { daysBetween } from '../date';

/**
 * Money-weighted and time-weighted returns with cash flows (concept §5.3, ported from
 * `investment-performance.mjs`). A cash flow is money put into (positive) or taken out of
 * (negative) the portfolio; values are market values in cents. All results are rates (0.1 = 10 %).
 */
export interface CashFlow {
  date: string;
  cents: number;
}

export interface Valuation {
  date: string;
  valueCents: number;
}

/**
 * True time-weighted rate of return: sub-periods between consecutive valuations, a flow in a
 * sub-period counts at its end (the valuation already contains it), so
 * `r = (value − flows) / previous value − 1`, chained. Exact when there is a valuation on every
 * cash-flow day. Periods starting at 0 (before the first buy) do not count.
 */
export function ttwror(
  valuations: ReadonlyArray<Valuation>,
  flows: ReadonlyArray<CashFlow>,
): number {
  const sorted = [...valuations].sort((a, b) => a.date.localeCompare(b.date));
  let growth = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1] as Valuation;
    const cur = sorted[i] as Valuation;
    const flow = flows
      .filter((f) => f.date > prev.date && f.date <= cur.date)
      .reduce((a, f) => a + f.cents, 0);
    if (prev.valueCents <= 0) continue;
    growth *= (cur.valueCents - flow) / prev.valueCents;
  }
  return growth - 1;
}

/**
 * Modified Dietz return of one period: gain over the average capital, each flow weighted by the
 * share of the period it was invested (by days).
 */
export function modifiedDietz(
  start: Valuation,
  end: Valuation,
  flows: ReadonlyArray<CashFlow>,
): number {
  const days = daysBetween(start.date, end.date);
  if (days <= 0) throw new RangeError('The period must end after it starts');
  let net = 0;
  let weighted = 0;
  for (const f of flows) {
    if (f.date <= start.date || f.date > end.date) continue;
    net += f.cents;
    weighted += (f.cents * daysBetween(f.date, end.date)) / days;
  }
  const capital = start.valueCents + weighted;
  return capital === 0 ? 0 : (end.valueCents - start.valueCents - net) / capital;
}

/**
 * Internal rate of return per year (XIRR, actual/365): the rate at which the start value plus the
 * flows, compounded to the end, equal the end value. Newton's method with bisection as fallback.
 */
export function irr(start: Valuation, end: Valuation, flows: ReadonlyArray<CashFlow>): number {
  // From the investor's side: money in is negative, the end value comes back.
  const items = [
    { t: 0, cents: -start.valueCents },
    ...flows
      .filter((f) => f.date > start.date && f.date <= end.date)
      .map((f) => ({ t: daysBetween(start.date, f.date) / 365, cents: -f.cents })),
    { t: daysBetween(start.date, end.date) / 365, cents: end.valueCents },
  ];
  const npv = (r: number) => items.reduce((a, x) => a + x.cents / Math.pow(1 + r, x.t), 0);
  const slope = (r: number) =>
    items.reduce((a, x) => a - (x.t * x.cents) / Math.pow(1 + r, x.t + 1), 0);
  let r = 0.05;
  for (let i = 0; i < 50; i++) {
    const d = slope(r);
    if (d === 0 || !Number.isFinite(d)) break;
    const next = r - npv(r) / d;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-12) return next;
    r = next;
  }
  let lo = -0.9999;
  let hi = 10;
  if (npv(lo) * npv(hi) > 0) throw new RangeError('No rate of return in -99,99 % … 1000 %');
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
