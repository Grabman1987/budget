import { averageCost, fifoCost, terCostCents, type CostResult, type CostTrade } from './invest';
import { sameDayMonthsBack } from './performance';
import type { SeriesTrade } from './series';

/**
 * One cost basis (Einstand), gain and fund cost per product, used by every page (SPEC §6: the
 * prototype's `costOf`, `gainOf`, `terOf`). FIFO is the default, like Portfolio Performance;
 * average cost is available for the reports that want it. Money is integer cents throughout.
 */
export type CostMethod = 'fifo' | 'average';

export type ProductTrade = SeriesTrade;

const COST_KINDS = new Set(['buy', 'sell', 'delivery_in', 'delivery_out', 'split']);

/** Trades that move units, oldest first; on one day buys and deliveries in come before sales. */
function costTrades(trades: ReadonlyArray<ProductTrade>): CostTrade[] {
  const rank = (t: ProductTrade) => (t.kind === 'buy' || t.kind === 'delivery_in' ? 0 : 1);
  return trades
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => COST_KINDS.has(t.kind))
    .sort((a, b) => a.t.date.localeCompare(b.t.date) || rank(a.t) - rank(b.t) || a.i - b.i)
    .map(({ t }) => ({
      kind: t.kind as CostTrade['kind'],
      unitsE8: t.unitsE8,
      amountCents: t.amountCents,
      feeCents: t.feeCents,
      taxCents: t.taxCents,
    }));
}

/**
 * Units, cost basis and realised gain of one product (or one position): the opening holding
 * (snapshot with its cost, if any) plus the trades after it. Realised gain = proceeds after fees and
 * taxes minus the cost of the units sold.
 */
export function costOf(
  trades: ReadonlyArray<ProductTrade>,
  opening: { unitsE8: number; costBasisCents: number } = { unitsE8: 0, costBasisCents: 0 },
  method: CostMethod = 'fifo',
): CostResult {
  const list = costTrades(trades);
  return method === 'fifo' ? fifoCost(opening, list) : averageCost(opening, list);
}

/** Documented realised subtotal, with explicit incompleteness instead of invented zero costs. */
function documentedCostReplay(
  trades: readonly ProductTrade[],
  opening: { unitsE8: number; costBasisCents: number | null } = { unitsE8: 0, costBasisCents: 0 },
  method: CostMethod = 'average',
) {
  const knownOpening =
    opening.costBasisCents === null
      ? { unitsE8: 0, costBasisCents: 0 }
      : { unitsE8: opening.unitsE8, costBasisCents: opening.costBasisCents };
  let unknownUnits = opening.costBasisCents === null ? opening.unitsE8 : 0;
  let knownUnits = knownOpening.unitsE8;
  let complete = true;
  let unknownAveragePool = method === 'average' && unknownUnits > 0;
  const backed: CostTrade[] = [];
  for (const t of costTrades(trades)) {
    // Unknown average cost affects every unit in that pool. FIFO consumes the older unknown lot.
    if (unknownAveragePool) {
      if (t.kind === 'sell' && t.unitsE8 !== 0) complete = false;
      if (t.kind === 'buy' || t.kind === 'delivery_in') unknownUnits += Math.abs(t.unitsE8);
      else if (t.kind === 'sell' || t.kind === 'delivery_out')
        unknownUnits = Math.max(0, unknownUnits - Math.abs(t.unitsE8));
      else if (t.kind === 'split') unknownUnits += t.unitsE8;
      if (unknownUnits === 0) unknownAveragePool = false;
      continue;
    }
    if (t.kind === 'buy' || t.kind === 'delivery_in') {
      knownUnits += Math.abs(t.unitsE8);
      backed.push(t);
    } else if (t.kind === 'sell' || t.kind === 'delivery_out') {
      const requested = Math.abs(t.unitsE8);
      const unknownTaken = Math.min(unknownUnits, requested);
      unknownUnits -= unknownTaken;
      const taken = Math.min(knownUnits, requested - unknownTaken);
      knownUnits -= taken;
      if (t.kind === 'sell' && (unknownTaken > 0 || taken < requested)) complete = false;
      if (taken > 0) {
        const share = taken / requested;
        backed.push({
          ...t,
          unitsE8: t.unitsE8 < 0 ? -taken : taken,
          amountCents: Math.round(t.amountCents * share),
          feeCents: Math.round(t.feeCents * share),
          taxCents: Math.round((t.taxCents ?? 0) * share),
        });
      }
    } else {
      const allUnits = unknownUnits + knownUnits;
      const knownExtra = allUnits > 0 ? Math.round((t.unitsE8 * knownUnits) / allUnits) : 0;
      unknownUnits += t.unitsE8 - knownExtra;
      knownUnits += knownExtra;
      if (knownExtra !== 0) backed.push({ ...t, unitsE8: knownExtra });
    }
  }
  const result =
    method === 'fifo' ? fifoCost(knownOpening, backed) : averageCost(knownOpening, backed);
  return { cost: result, complete, unknownUnits };
}

/** Only documented sale gains; false completeness marks a known subtotal. */
export function documentedRealizedGain(
  trades: readonly ProductTrade[],
  opening?: { unitsE8: number; costBasisCents: number | null },
  method: CostMethod = 'average',
): { cents: number; complete: boolean } {
  const result = documentedCostReplay(trades, opening, method);
  return { cents: result.cost.realizedGainCents, complete: result.complete };
}

/** Remaining cost is unavailable while any unit of the method's unknown pool remains. */
export function documentedCostOf(
  trades: readonly ProductTrade[],
  opening?: { unitsE8: number; costBasisCents: number | null },
  method: CostMethod = 'average',
): CostResult | null {
  const result = documentedCostReplay(trades, opening, method);
  return result.unknownUnits > 0 ? null : result.cost;
}

export interface Gain {
  /** Market value minus cost basis of the units still held. */
  unrealizedCents: number;
  realizedCents: number;
  totalCents: number;
}

/** Gain of a product: unrealised (value − Einstand) and realised. */
export function gainOf(valueCents: number, cost: CostResult): Gain {
  const unrealizedCents = valueCents - cost.costBasisCents;
  return {
    unrealizedCents,
    realizedCents: cost.realizedGainCents,
    totalCents: unrealizedCents + cost.realizedGainCents,
  };
}

/** Realised gain of the sales in `(from, to]`: the running total at `to` minus the one at `from`. */
export function realizedGainIn(
  trades: ReadonlyArray<ProductTrade>,
  from: string,
  to: string,
  opening?: { unitsE8: number; costBasisCents: number },
  method: CostMethod = 'fifo',
): number {
  const upTo = (day: string) =>
    costOf(
      trades.filter((t) => t.date <= day),
      opening,
      method,
    ).realizedGainCents;
  return upTo(to) - upTo(from);
}

/** Fund cost (TER) over month-end values: value × TER (bp per year) / 12 per month. */
export const terOf = terCostCents;

export interface IncomeSummary {
  grossCents: number;
  taxCents: number;
  feeCents: number;
  /** Gross minus tax and fees: what reached the investor. */
  netCents: number;
}

const inLast12Months = (t: { date: string }, today: string) =>
  t.date > sameDayMonthsBack(today, 12) && t.date <= today;

/** Dividends and interest of the 12 months up to `today` (in the trades' own currency). */
export function incomeLast12Months(
  trades: ReadonlyArray<ProductTrade>,
  today: string,
): IncomeSummary {
  let grossCents = 0;
  let taxCents = 0;
  let feeCents = 0;
  for (const t of trades) {
    if ((t.kind !== 'dividend' && t.kind !== 'interest') || !inLast12Months(t, today)) continue;
    grossCents += t.amountCents;
    taxCents += t.taxCents;
    feeCents += t.feeCents;
  }
  return { grossCents, taxCents, feeCents, netCents: grossCents - taxCents - feeCents };
}

/** Fees of the 12 months up to `today`: the fee of every trade plus standalone fee bookings. */
export function feesLast12Months(trades: ReadonlyArray<ProductTrade>, today: string): number {
  let sum = 0;
  for (const t of trades) {
    if (!inLast12Months(t, today)) continue;
    sum += t.feeCents + (t.kind === 'fee' ? t.amountCents : 0);
  }
  return sum;
}

export interface FundCosts {
  terCents: number;
  feesCents: number;
  totalCents: number;
  /** Total cost over the current value in basis points (integer, half up); 0 without value. */
  costRateBp: number;
}

/**
 * Cost of a product over the last 12 months: TER on the month-end values (`terOf`) plus the fees
 * of the 12 months, and that total in basis points of the current value.
 */
export function fundCosts(input: {
  monthEndValuesCents: ReadonlyArray<number>;
  terBp: number;
  trades: ReadonlyArray<ProductTrade>;
  today: string;
  valueCents: number;
}): FundCosts {
  const terCents = terOf(input.monthEndValuesCents, input.terBp);
  const feesCents = feesLast12Months(input.trades, input.today);
  const totalCents = terCents + feesCents;
  return {
    terCents,
    feesCents,
    totalCents,
    costRateBp: input.valueCents > 0 ? Math.round((totalCents * 10_000) / input.valueCents) : 0,
  };
}
