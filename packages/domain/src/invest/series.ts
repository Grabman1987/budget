import { addDays, daysBetween } from '../date';
import { costOf, type ProductTrade } from './cost';
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
 *    withdrawals) are flows, and so are deliveries in and out, which move value across the boundary
 *    without cash and count at their stored amount, as in PP. The value is positions plus cash balance. This is the view used for
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
    // German: this text can reach the UI (never ids or technical wording).
    super(`Für ${currency} ist bis einschließlich ${asOf} kein Wechselkurs gespeichert.`);
  }
}

/**
 * A held position cannot be valued without a stored quote on or before the day. Only the strict
 * rule (`estimate: false`) throws it; the default valuation estimates instead.
 */
export class PriceUnavailableError extends Error {
  override readonly name = 'PriceUnavailableError';
  constructor(
    readonly accountId: string,
    readonly securityId: string,
    readonly asOf: string,
  ) {
    super(`Für ein Wertpapier fehlt bis einschließlich ${asOf} ein Kurs.`);
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

/**
 * Valuation fallbacks for a position on a day (a missing quote must never abort a valuation).
 *
 * Order, per held position and day:
 * 1. the latest price on or before the day: `exact` when it is at most `PRICE_STALE_AFTER_DAYS`
 *    days old (weekends and holidays are carried forward), `stale` when it is older;
 * 2. no such price: latest gross execution on/before the day, otherwise earliest after it,
 *    excluding fees/taxes, in execution currency: `exact` (not a cost estimate);
 * 3. still none: the position's cost basis (moving average, in the account currency, converted
 *    with the rate of the day): `estimated`;
 * 4. no cost basis either (a snapshot without cost, or an unconvertible currency): the position
 *    adds nothing and is flagged `missing`.
 * A position without units (expired, knocked out, sold) needs none of this and adds nothing.
 */
export const PRICE_STALE_AFTER_DAYS = 7;
export const PRICE_BACKFILL_TOLERANCE_DAYS = 7;

/** How trustworthy the value of one position is. */
export type ValuationQuality = 'exact' | 'stale' | 'estimated' | 'missing';

const QUALITY_RANK: Record<ValuationQuality, number> = {
  exact: 0,
  stale: 1,
  estimated: 2,
  missing: 3,
};

/** The worse of two qualities (`missing` > `estimated` > `stale` > `exact`). */
export function worstQuality(a: ValuationQuality, b: ValuationQuality): ValuationQuality {
  return QUALITY_RANK[a] >= QUALITY_RANK[b] ? a : b;
}

/** A position valued only by a cost estimate or not at all: what the UI flags as incomplete. */
export type IncompleteQuality = 'estimated' | 'missing';

export const isIncompleteQuality = (q: ValuationQuality): q is IncompleteQuality =>
  q === 'estimated' || q === 'missing';

export interface PriceChoice {
  price: DatedPrice;
  quality: 'exact' | 'stale' | 'estimated';
  /** Exact gross/units ratio behind an execution price, before micro rounding. */
  execution?: { amountCents: number; unitsE8: number };
}

/** One cent rounding, also when an execution price lies between stored micro-units. */
export function valueAtPrice(unitsE8: number, choice: PriceChoice, fxRateMicro: number): number {
  if (!choice.execution) return marketValueEurCents(unitsE8, choice.price.priceMicro, fxRateMicro);
  const scaled = BigInt(unitsE8) * BigInt(choice.execution.amountCents) * BigInt(fxRateMicro);
  const denominator = BigInt(Math.abs(choice.execution.unitsE8)) * 1_000_000n;
  const negative = scaled < 0n;
  const rounded = ((negative ? -scaled : scaled) + denominator / 2n) / denominator;
  return Number(negative ? -rounded : rounded);
}

/**
 * Select a stored quote from an ascending list. Valuation uses `backfill: false` and fills gaps
 * with execution prices; the optional legacy backfill only accepts a quote within seven days.
 */
export function pickPrice(
  sortedPrices: ReadonlyArray<DatedPrice>,
  day: string,
  backfill = true,
): PriceChoice | undefined {
  const before = latestOnOrBefore(sortedPrices, day);
  if (before)
    return {
      price: before,
      quality:
        before.date === day || daysBetween(before.date, day) <= PRICE_STALE_AFTER_DAYS
          ? 'exact'
          : 'stale',
    };
  if (!backfill) return undefined;
  // Nothing on or before the day, so the first price of the ascending list is the earliest after.
  const after = sortedPrices[0];
  if (after && daysBetween(day, after.date) <= PRICE_BACKFILL_TOLERANCE_DAYS)
    return { price: after, quality: 'estimated' };
  return undefined;
}

/** Execution gross / absolute units, without fees/taxes; latest before, earliest after. */
export function pickTradePrice(
  trades: ReadonlyArray<ProductTrade & { currency?: string }>,
  day: string,
  currency = 'EUR',
): PriceChoice | undefined {
  let before: (typeof trades)[number] | undefined;
  let after: (typeof trades)[number] | undefined;
  const splitDays: string[] = [];
  for (const t of trades) {
    if (t.kind === 'split' && t.unitsE8 !== 0) splitDays.push(t.date);
    // A zero-amount execution (e.g. a free delivery) has no price: fall through to the cost basis.
    if (
      !['buy', 'sell', 'delivery_in', 'delivery_out'].includes(t.kind) ||
      t.unitsE8 === 0 ||
      t.amountCents <= 0
    )
      continue;
    if (t.date <= day) {
      if (!before || t.date >= before.date) before = t;
    } else if (!after || t.date < after.date) after = t;
  }
  const found = before ?? after;
  if (!found) return undefined;
  // A split between the execution and the day changes the unit basis: the price no longer fits
  // the units held, so leave it to the (split-aware) cost basis.
  const [lo, hi] = found.date <= day ? [found.date, day] : [day, found.date];
  if (splitDays.some((d) => (found.date <= day ? d >= lo && d <= hi : d > lo && d <= hi)))
    return undefined;
  const units = BigInt(Math.abs(found.unitsE8));
  const scaled = BigInt(found.amountCents) * 10n ** 12n;
  const priceMicro = Number((scaled + units / 2n) / units);
  if (!Number.isSafeInteger(priceMicro))
    throw new RangeError('Execution price exceeds safe integer range');
  return {
    price: {
      date: found.date,
      priceMicro,
      currency: found.currency ?? currency,
    },
    quality: 'exact',
    execution: { amountCents: found.amountCents, unitsE8: found.unitsE8 },
  };
}

/** What a position cost: the data of the moving-average fallback (step 3). */
export interface PositionCostInput {
  /** Currency of the trade amounts and the snapshot costs (the account currency). */
  currency: string;
  /** Cost basis of each holding snapshot by its day; `null` = unknown. */
  snapshots: ReadonlyArray<{ date: string; costBasisCents: number | null }>;
  /** Units-moving trades with their amounts (other kinds are ignored). */
  trades: ReadonlyArray<ProductTrade>;
}

/**
 * Moving-average cost basis of a position on a day, in the cost currency: the latest snapshot on or
 * before the day (its cost) plus the trades after the snapshot's day up to the day, like the units.
 * `null` when the cost is unknown (the snapshot has no cost).
 */
export function costBasisOnDay(
  snapshots: ReadonlyArray<{ date: string; unitsE8: number }>,
  cost: PositionCostInput,
  day: string,
): number | null {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const snap = latestOnOrBefore(sorted, day);
  let opening = { unitsE8: 0, costBasisCents: 0 };
  let after = '';
  if (snap) {
    const known = cost.snapshots.find((s) => s.date === snap.date)?.costBasisCents ?? null;
    if (known === null) return null;
    opening = { unitsE8: snap.unitsE8, costBasisCents: known };
    after = snap.date;
  }
  return costOf(
    cost.trades.filter((t) => t.date > after && t.date <= day),
    opening,
    'average',
  ).costBasisCents;
}

/** Cost in `currency` to EUR cents with the rate of the day; `null` without a rate. */
export function costInEur(
  costCents: number,
  currency: string,
  rates: RateTable,
  day: string,
): number | null {
  if (currency === 'EUR') return costCents;
  const found = latestOnOrBefore(rates.get(currency) ?? [], day);
  return found ? toEurCents(costCents, found.rateMicro) : null;
}

export interface PositionInput {
  accountId: string;
  securityId: string;
  /** Holding snapshots (Bestand): units on their day. The latest one on or before a day counts. */
  snapshots: ReadonlyArray<{ date: string; unitsE8: number }>;
  /** Units-moving trades of this position (buy, sell, delivery, split); other kinds are ignored. */
  trades: ReadonlyArray<{ date: string; unitsE8: number }>;
  /**
   * Prices of the security, including those before the first day.
   */
  prices: ReadonlyArray<DatedPrice>;
  /** All executions of this security, including other accounts and future days. */
  priceTrades?: ReadonlyArray<SeriesTrade>;
  /** Cost data for the cost-basis fallback; without it a position with no price is `missing`. */
  cost?: PositionCostInput;
}

export interface PositionSeries {
  accountId: string;
  securityId: string;
  /** Parallel to `days`. */
  unitsE8: number[];
  valueCents: number[];
  /** Worst quality over the days the position was held; `exact` when it never was. */
  quality: ValuationQuality;
}

/** A position that was valued by an estimate or not at all on some days. */
export interface IncompleteValuation {
  accountId: string;
  securityId: string;
  quality: IncompleteQuality;
  /** Number of held days valued like this, and the first and last of them. */
  days: number;
  from: string;
  to: string;
}

export interface ValuationSeries {
  days: string[];
  positions: PositionSeries[];
  /** Sum of all positions per day, parallel to `days`. */
  totalCents: number[];
  /** Positions with estimated or missing values, for the "teilweise geschätzt" hint. */
  incomplete: IncompleteValuation[];
}

export interface ValuationOptions {
  /**
   * Fall back to an execution price or the cost basis when there is no quote on/before the day
   * (default). `false` is the strict rule: a held position without a price throws
   * `PriceUnavailableError` (Portfolio Performance comparisons).
   */
  estimate?: boolean;
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
 * Daily valuation of positions: units held that day times the price of the fallback order above
 * (`pickPrice`: the latest price carried forward over weekends and gaps), times the ECB rate of
 * the price currency of that day, one rounding. A position without units is 0 and needs no quote
 * or rate. A held position without any usable price falls back to its cost basis (`estimated`) or
 * adds nothing (`missing`); both are listed in `incomplete`. A missing exchange rate still makes
 * the series unavailable.
 */
export function dailyValuation(
  positions: ReadonlyArray<PositionInput>,
  days: ReadonlyArray<string>,
  rates: RateTable,
  options: ValuationOptions = {},
): ValuationSeries {
  const estimate = options.estimate ?? true;
  const totalCents = days.map(() => 0);
  const incomplete: IncompleteValuation[] = [];
  const out = positions.map((p): PositionSeries => {
    const prices = [...p.prices].sort((a, b) => a.date.localeCompare(b.date));
    const unitsE8 = unitsSeries(p, days);
    let quality: ValuationQuality = 'exact';
    const flagged = new Map<IncompleteQuality, { days: number; from: string; to: string }>();
    const valueCents = days.map((day, i) => {
      const units = unitsE8[i] as number;
      if (units === 0) return 0;
      let value: number;
      let dayQuality: ValuationQuality;
      const choice =
        pickPrice(prices, day, false) ??
        (estimate
          ? pickTradePrice(p.priceTrades ?? p.cost?.trades ?? [], day, p.cost?.currency)
          : undefined);
      if (choice) {
        value = valueAtPrice(units, choice, fxOn(rates, choice.price.currency, day));
        dayQuality = choice.quality;
      } else if (!estimate) {
        throw new PriceUnavailableError(p.accountId, p.securityId, day);
      } else {
        const cost = p.cost ? costBasisOnDay(p.snapshots, p.cost, day) : null;
        const eur = cost === null || !p.cost ? null : costInEur(cost, p.cost.currency, rates, day);
        value = eur ?? 0;
        dayQuality = eur === null ? 'missing' : 'estimated';
      }
      quality = worstQuality(quality, dayQuality);
      if (isIncompleteQuality(dayQuality)) {
        const f = flagged.get(dayQuality);
        if (f) {
          f.days += 1;
          f.to = day;
        } else flagged.set(dayQuality, { days: 1, from: day, to: day });
      }
      totalCents[i] = (totalCents[i] as number) + value;
      return value;
    });
    for (const [q, f] of flagged)
      incomplete.push({ accountId: p.accountId, securityId: p.securityId, quality: q, ...f });
    return { accountId: p.accountId, securityId: p.securityId, unitsE8, valueCents, quality };
  });
  return { days: [...days], positions: out, totalCents, incomplete };
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
