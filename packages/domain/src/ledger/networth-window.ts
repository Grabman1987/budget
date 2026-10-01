import { daysBetween } from '../date';

/** One day of the net worth series: the value and its split into own contribution and market. */
export interface NetWorthDayInput {
  date: string;
  netWorthCents: number;
  ownCents: number;
  marketCents: number;
}

export interface NetWorthWindow {
  /** Value on the day before the first row (the close of the start day). */
  startCents: number;
  ownCents: number;
  marketCents: number;
  nowCents: number;
  deltaCents: number;
}

/**
 * The chain of a window, Anfang + Eigenleistung + Markt = jetzt: the sums of the daily split. The
 * rows must add up (each day's own + market = its change), so the chain is exact in cents.
 */
export function netWorthWindow(
  days: ReadonlyArray<NetWorthDayInput>,
  startCents: number,
): NetWorthWindow {
  let previous = startCents;
  let own = 0;
  let market = 0;
  for (const d of days) {
    if (d.ownCents + d.marketCents !== d.netWorthCents - previous)
      throw new Error(`Net worth on ${d.date} does not add up (own + market != change)`);
    own += d.ownCents;
    market += d.marketCents;
    previous = d.netWorthCents;
  }
  return {
    startCents,
    ownCents: own,
    marketCents: market,
    nowCents: previous,
    deltaCents: previous - startCents,
  };
}

export interface NetWorthBucket {
  /** First and last day of the bucket, both included. */
  from: string;
  to: string;
  ownCents: number;
  marketCents: number;
}

/**
 * Bars of the net worth page: own contribution and market per week (blocks of 7 days from the
 * first row, as the prototype; the last one may be short) or per calendar month (the first and
 * last may be partial).
 */
export function bucketNetWorth(
  days: ReadonlyArray<NetWorthDayInput>,
  unit: 'week' | 'month',
): NetWorthBucket[] {
  const first = days[0];
  if (!first) return [];
  const out: NetWorthBucket[] = [];
  let key = '';
  for (const d of days) {
    const k =
      unit === 'week'
        ? String(Math.floor(daysBetween(first.date, d.date) / 7))
        : d.date.slice(0, 7);
    let bucket = out[out.length - 1];
    if (!bucket || k !== key) {
      key = k;
      bucket = { from: d.date, to: d.date, ownCents: 0, marketCents: 0 };
      out.push(bucket);
    }
    bucket.to = d.date;
    bucket.ownCents += d.ownCents;
    bucket.marketCents += d.marketCents;
  }
  return out;
}
