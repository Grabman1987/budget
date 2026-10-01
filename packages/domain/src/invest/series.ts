import { addDays } from '../date';
import { marketValueEurCents, toEurCents } from './invest';
import type { CashFlow } from './returns';

/**
 * Daily valuation series and the cash flows of a portfolio (P5.2). Pure: the repositories read the
 * rows, these functions turn them into series. Units are integers in 1e-8, prices and FX rates
 * integers in micro-units, values integer cents with ONE rounding per position and day
 * (`marketValueEurCents`). No floating point touches money.
 *
 * Portfolio Performance semantics implemented here
 * ------------------------------------------------
 * A cash flow is money put INTO the portfolio (positive) or taken OUT of it (negative), in EUR
 * cents on the day of the booking; `ttwror`, `irr` and `modifiedDietz` (returns.ts) consume them.
 *
 * 1. View "securities only" (`securityFlows`): the portfolio is the set of positions. A buy puts
 *    money in (gross amount plus fee plus tax), a sale takes money out (gross amount minus fee
 *    minus tax), a delivery in/out counts like a buy/sale at its stored amount (the caller stores
 *    the market value of the delivery day). Dividends and interest are paid out to the investor:
 *    outflows of the net amount (minus fee and tax). A standalone fee or tax on a security is a
 *    cost borne by the investor against an unchanged position value: an inflow of that amount,
 *    which lowers the gain. A split moves units only; no flow. The value of the portfolio is the
 *    market value of the positions.
 * 2. View "depot incl. reference account" (`depotFlows`): the portfolio is the positions plus the
 *    cash of its reference account(s). Buys, sales, dividends, fees and taxes are internal moves
 *    between cash and positions; only transfers that cross the portfolio boundary (deposits and
 *    withdrawals) are flows. The value is positions plus cash balance. This is the view used for
 *    the Gate 3 comparison with Portfolio Performance. A plain booking directly on the
 *    reference account is a flow from outside, too: an inflow is a deposit (Einlage), an outflow
 *    a withdrawal (Entnahme), as in PP. Interest, dividends, fees and taxes are performance.
 *
 * Prices must be split-adjusted for a split to keep the value continuous (`quote_adjusted`).
 */

/** Trade kinds, as in the `trade` table. */
export type TradeKind =
  | 'buy'
  | 'sell'
  | 'delivery_in'
  | 'delivery_out'
  | 'split'
  | 'dividend'
  | 'interest'
  | 'fee'
  | 'tax';

export interface SeriesTrade {
  date: string;
  kind: TradeKind;
  /** Signed units (see `TRADE_KINDS`). */
  unitsE8: number;
  /** Gross value, positive, in `currency`. */
  amountCents: number;
  feeCents: number;
  taxCents: number;
  /** Currency of the account the trade was booked on (default EUR). */
  currency?: string;
}

export interface DatedPrice {
  date: string;
  priceMicro: number;
  currency: string;
}

export interface DatedRate {
  date: string;
  rateMicro: number;
}

/** ECB rates per currency (EUR per unit, micro), ascending by date. EUR needs no entry. */
export type RateTable = ReadonlyMap<string, ReadonlyArray<DatedRate>>;

/** A valuation needs a rate that is not present on or before the requested day. */
export class ExchangeRateUnavailableError extends Error {
  override readonly name = 'ExchangeRateUnavailableError';
  constructor(
    readonly currency: string,
    readonly asOf: string,
  ) {
    super(`No exchange rate for ${currency} on or before ${asOf}`);
  }
}

/** A held position cannot be valued without a stored quote on or before the day. */
export class PriceUnavailableError extends Error {
  override readonly name = 'PriceUnavailableError';
  constructor(
    readonly accountId: string,
    readonly securityId: string,
    readonly asOf: string,
  ) {
    super(`No price for ${securityId} in ${accountId} on or before ${asOf}`);
  }
}

/** Every day from `from` to `to`, both included. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Last element of an ascending list whose `date` is on or before `day` (binary search). */
export function latestOnOrBefore<T extends { date: string }>(
  sorted: ReadonlyArray<T>,
  day: string,
): T | undefined {
  let lo = 0;
  let hi = sorted.length - 1;
  let found: T | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const item = sorted[mid] as T;
    if (item.date <= day) {
      found = item;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** EUR per unit of `currency` on a day: the latest rate on or before it. A missing rate is an error. */
export function fxOn(rates: RateTable, currency: string, day: string): number {
  if (currency === 'EUR') return 1_000_000;
  const found = latestOnOrBefore(rates.get(currency) ?? [], day);
  if (!found) throw new ExchangeRateUnavailableError(currency, day);
  return found.rateMicro;
}

export interface PositionInput {
  accountId: string;
  securityId: string;
  /** Holding snapshots (Bestand): units on their day. The latest one on or before a day counts. */
  snapshots: ReadonlyArray<{ date: string; unitsE8: number }>;
  /** Units-moving trades of this position (buy, sell, delivery, split); other kinds are ignored. */
  trades: ReadonlyArray<{ date: string; unitsE8: number }>;
  /** Prices of the security ascending by date, including those before the first day. */
  prices: ReadonlyArray<DatedPrice>;
}

export interface PositionSeries {
  accountId: string;
  securityId: string;
  /** Parallel to `days`. */
  unitsE8: number[];
  valueCents: number[];
}

export interface ValuationSeries {
  days: string[];
  positions: PositionSeries[];
  /** Sum of all positions per day, parallel to `days`. */
  totalCents: number[];
}

/**
 * Units of a position on a day: the latest snapshot on or before it plus every trade after the
 * snapshot's day up to the day (the rule of `holdingValuesAsOf`, here for many days in one pass).
 */
function unitsSeries(position: PositionInput, days: ReadonlyArray<string>): number[] {
  const trades = [...position.trades].sort((a, b) => a.date.localeCompare(b.date));
  const snapshots = [...position.snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const cumulative: { date: string; units: number }[] = [];
  let run = 0;
  for (const t of trades) {
    run += t.unitsE8;
    cumulative.push({ date: t.date, units: run });
  }
  const cumOn = (day: string) => latestOnOrBefore(cumulative, day)?.units ?? 0;
  return days.map((day) => {
    const snap = latestOnOrBefore(snapshots, day);
    return snap ? snap.unitsE8 + cumOn(day) - cumOn(snap.date) : cumOn(day);
  });
}

/**
 * Daily valuation of positions: units held that day times the latest price on or before it (carried
 * forward over weekends and gaps), times the ECB rate of the price currency of that day, one
 * rounding. A position without units is 0 and needs no quote or rate; missing prices or rates
 * for held positions make the series unavailable.
 */
export function dailyValuation(
  positions: ReadonlyArray<PositionInput>,
  days: ReadonlyArray<string>,
  rates: RateTable,
): ValuationSeries {
  const totalCents = days.map(() => 0);
  const out = positions.map((p): PositionSeries => {
    const prices = [...p.prices].sort((a, b) => a.date.localeCompare(b.date));
    const unitsE8 = unitsSeries(p, days);
    const valueCents = days.map((day, i) => {
      const units = unitsE8[i] as number;
      if (units === 0) return 0;
      const latest = latestOnOrBefore(prices, day);
      if (!latest) throw new PriceUnavailableError(p.accountId, p.securityId, day);
      const value = marketValueEurCents(
        units,
        latest.priceMicro,
        fxOn(rates, latest.currency, day),
      );
      totalCents[i] = (totalCents[i] as number) + value;
      return value;
    });
    return { accountId: p.accountId, securityId: p.securityId, unitsE8, valueCents };
  });
  return { days: [...days], positions: out, totalCents };
}

/** Element-wise sum of series of equal length (positions plus reference cash, and so on). */
export function sumSeries(...series: ReadonlyArray<ReadonlyArray<number>>): number[] {
  const length = series[0]?.length ?? 0;
  const out = new Array<number>(length).fill(0);
  for (const s of series) {
    if (s.length !== length) throw new RangeError('Series must have the same length');
    s.forEach((v, i) => (out[i] = (out[i] as number) + v));
  }
  return out;
}

/** Signed flow of one trade in the trade's currency (securities-only view); 0 for a split. */
export function securityFlowCents(t: SeriesTrade): number {
  switch (t.kind) {
    case 'buy':
    case 'delivery_in':
      return t.amountCents + t.feeCents + t.taxCents;
    case 'sell':
    case 'delivery_out':
    case 'dividend':
    case 'interest':
      return -(t.amountCents - t.feeCents - t.taxCents);
    case 'fee':
    case 'tax':
      return t.amountCents + t.feeCents + t.taxCents;
    case 'split':
      return 0;
  }
}

const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);

/** Merge flows of the same day into one (amounts add up), ascending by date. */
function mergeByDay(flows: ReadonlyArray<CashFlow>): CashFlow[] {
  const sorted = [...flows].sort(byDate);
  const out: CashFlow[] = [];
  for (const f of sorted) {
    const last = out[out.length - 1];
    if (last && last.date === f.date) last.cents += f.cents;
    else out.push({ ...f });
  }
  return out.filter((f) => f.cents !== 0);
}

/** Cash flows of the securities-only view in EUR cents (converted at the rate of the trade day). */
export function securityFlows(trades: ReadonlyArray<SeriesTrade>, rates: RateTable): CashFlow[] {
  return mergeByDay(
    trades.map((t) => {
      const cents = securityFlowCents(t);
      const currency = t.currency ?? 'EUR';
      return {
        date: t.date,
        cents:
          currency === 'EUR' || cents === 0
            ? cents
            : toEurCents(cents, fxOn(rates, currency, t.date)),
      };
    }),
  );
}

/**
 * Cash flows of the "depot incl. reference account" view: the transfers that cross the portfolio
 * boundary (positive = deposit into the portfolio's cash, negative = withdrawal), in EUR cents.
 */
export function depotFlows(
  boundaryTransfers: ReadonlyArray<{ date: string; cents: number; currency?: string }>,
  rates: RateTable,
): CashFlow[] {
  return mergeByDay(
    boundaryTransfers.map((t) => {
      const currency = t.currency ?? 'EUR';
      return {
        date: t.date,
        cents:
          currency === 'EUR' || t.cents === 0
            ? t.cents
            : toEurCents(t.cents, fxOn(rates, currency, t.date)),
      };
    }),
  );
}

/**
 * Market move of one day: the change of the positions' value minus the money put into them by
 * trades that day (`gross` value of buys and deliveries in, minus that of sales and deliveries
 * out; fees, dividends and taxes are not market). `changeCents` is the day's change of any total.
 */
export function dailyMarketMoveCents(
  valueChangeCents: number,
  trades: ReadonlyArray<SeriesTrade>,
  rates: RateTable,
): number {
  let contribution = 0;
  for (const t of trades) {
    const sign =
      t.kind === 'buy' || t.kind === 'delivery_in'
        ? 1
        : t.kind === 'sell' || t.kind === 'delivery_out'
          ? -1
          : 0;
    if (sign === 0) continue;
    const currency = t.currency ?? 'EUR';
    const eur =
      currency === 'EUR' ? t.amountCents : toEurCents(t.amountCents, fxOn(rates, currency, t.date));
    contribution += sign * eur;
  }
  return valueChangeCents - contribution;
}
