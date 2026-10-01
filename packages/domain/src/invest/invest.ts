/**
 * Investment arithmetic. Units are integers in 1e-8, prices integers in micro-units (1e-6) of the
 * price currency, values integer cents. Products of units and prices exceed 2^53 for real
 * positions, so the conversions use BigInt.
 */

const E12 = 10n ** 12n;

/** Value in cents of `unitsE8` at `priceMicro`, rounded half up. */
export function marketValueCents(unitsE8: number, priceMicro: number): number {
  const scaled = BigInt(unitsE8) * BigInt(priceMicro);
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const rounded = (abs + E12 / 2n) / E12;
  return Number(negative ? -rounded : rounded);
}

const E18 = 10n ** 18n;

/**
 * Value in EUR cents of `unitsE8` at `priceMicro` in a foreign currency and `fxRateMicro` (EUR per
 * unit of that currency, the stored ECB rate): one rounding, half up. A EUR price uses 1 000 000.
 */
export function marketValueEurCents(
  unitsE8: number,
  priceMicro: number,
  fxRateMicro: number,
): number {
  const scaled = BigInt(unitsE8) * BigInt(priceMicro) * BigInt(fxRateMicro);
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const rounded = (abs + E18 / 2n) / E18;
  return Number(negative ? -rounded : rounded);
}

/** Cents in a foreign currency converted to EUR cents at `fxRateMicro`, rounded half up. */
export function toEurCents(cents: number, fxRateMicro: number): number {
  return Math.sign(cents) * Math.round((Math.abs(cents) * fxRateMicro) / 1e6);
}

/** Units (1e-8) that `cents` buy at `priceMicro`, rounded half up. */
export function unitsFor(cents: number, priceMicro: number): number {
  if (!Number.isSafeInteger(priceMicro) || priceMicro <= 0)
    throw new RangeError('Price must be a positive integer (micro-units)');
  const negative = cents < 0;
  const abs = BigInt(Math.abs(cents));
  const price = BigInt(priceMicro);
  const rounded = (abs * E12 + price / 2n) / price;
  return Number(negative ? -rounded : rounded);
}

export interface HoldingSnapshot {
  asOf: string;
  unitsE8: number;
}

/** Units held on `date`: the snapshot plus every trade after it (signed units) up to the date. */
export function unitsHeld(
  snapshot: HoldingSnapshot | undefined,
  trades: ReadonlyArray<{ date: string; unitsE8: number }>,
  date: string,
): number {
  if (snapshot && snapshot.asOf > date) return 0;
  let units = snapshot?.unitsE8 ?? 0;
  for (const t of trades) {
    if ((snapshot === undefined || t.date > snapshot.asOf) && t.date <= date) units += t.unitsE8;
  }
  return units;
}

/** Return of a portfolio for one month: product returns weighted by their value at the previous month end. */
export function monthlyPortfolioReturn(
  positions: ReadonlyArray<{ previousValueCents: number; returnRate: number }>,
): number {
  let weighted = 0;
  let total = 0;
  for (const p of positions) {
    weighted += p.previousValueCents * p.returnRate;
    total += p.previousValueCents;
  }
  return total === 0 ? 0 : weighted / total;
}

/** True time-weighted rate of return: monthly returns chained, cash flows do not matter. */
export function chainReturns(monthly: ReadonlyArray<number>): number {
  let growth = 1;
  for (const r of monthly) growth *= 1 + r;
  return growth - 1;
}

/** What the market did: value change minus the net money that was put in (buys minus sales). */
export function marketMoveCents(input: {
  previousValueCents: number;
  valueCents: number;
  netContributionCents: number;
}): number {
  return input.valueCents - input.previousValueCents - input.netContributionCents;
}

export interface CostTrade {
  /** Signed units: buys and deliveries in are positive, sales and deliveries out negative. */
  unitsE8: number;
  /** Gross trade value, positive. */
  amountCents: number;
  feeCents: number;
  taxCents?: number;
  kind: 'buy' | 'sell' | 'delivery_in' | 'delivery_out' | 'split';
}

export interface CostResult {
  unitsE8: number;
  costBasisCents: number;
  /** Proceeds after fees and taxes minus the cost of the units sold. */
  realizedGainCents: number;
}

const adds = (t: CostTrade) => t.kind === 'buy' || t.kind === 'delivery_in';
const removes = (t: CostTrade) => t.kind === 'sell' || t.kind === 'delivery_out';
const proceeds = (t: CostTrade) =>
  t.kind === 'sell' ? t.amountCents - t.feeCents - (t.taxCents ?? 0) : 0;

/**
 * Cost basis (Einstand) with average cost: buys add amount and fees, a sale removes the cost of the
 * units sold in proportion to the units held; a split changes units only. One function serves
 * Reports and Vermögen (the other method is `fifoCost`).
 */
export function averageCost(
  opening: { unitsE8: number; costBasisCents: number },
  trades: ReadonlyArray<CostTrade>,
): CostResult {
  let units = opening.unitsE8;
  let cost = opening.costBasisCents;
  let realized = 0;
  for (const t of trades) {
    if (adds(t)) {
      units += Math.abs(t.unitsE8);
      cost += t.amountCents + t.feeCents;
    } else if (removes(t) && units > 0) {
      const sold = Math.min(units, Math.abs(t.unitsE8));
      const soldCost = Math.round((cost * sold) / units);
      cost -= soldCost;
      units -= sold;
      if (t.kind === 'sell') realized += proceeds(t) - soldCost;
    } else if (t.kind === 'split') units += t.unitsE8;
  }
  return { unitsE8: units, costBasisCents: cost, realizedGainCents: realized };
}

/** `averageCost(...).costBasisCents`, kept for existing callers. */
export const costBasisCents = (
  opening: { unitsE8: number; costBasisCents: number },
  trades: ReadonlyArray<CostTrade>,
): number => averageCost(opening, trades).costBasisCents;

/**
 * Cost basis first-in, first-out (Portfolio Performance's default for gains): a sale uses up the
 * oldest lots first; a split scales every lot's units, not its cost.
 */
export function fifoCost(
  opening: { unitsE8: number; costBasisCents: number },
  trades: ReadonlyArray<CostTrade>,
): CostResult {
  const lots: { units: number; cost: number }[] =
    opening.unitsE8 > 0 ? [{ units: opening.unitsE8, cost: opening.costBasisCents }] : [];
  let realized = 0;
  for (const t of trades) {
    if (adds(t)) lots.push({ units: Math.abs(t.unitsE8), cost: t.amountCents + t.feeCents });
    else if (removes(t)) {
      let left = Math.abs(t.unitsE8);
      let soldCost = 0;
      while (left > 0 && lots.length > 0) {
        const lot = lots[0] as { units: number; cost: number };
        const take = Math.min(left, lot.units);
        const part = take === lot.units ? lot.cost : Math.round((lot.cost * take) / lot.units);
        soldCost += part;
        lot.units -= take;
        lot.cost -= part;
        left -= take;
        if (lot.units === 0) lots.shift();
      }
      if (t.kind === 'sell') realized += proceeds(t) - soldCost;
    } else if (t.kind === 'split') {
      const total = lots.reduce((a, l) => a + l.units, 0);
      if (total > 0) {
        let given = 0;
        lots.forEach((l, i) => {
          const extra =
            i === lots.length - 1 ? t.unitsE8 - given : Math.round((t.unitsE8 * l.units) / total);
          given += extra;
          l.units += extra;
        });
      }
    }
  }
  return {
    unitsE8: lots.reduce((a, l) => a + l.units, 0),
    costBasisCents: lots.reduce((a, l) => a + l.cost, 0),
    realizedGainCents: realized,
  };
}

/** Fund cost over a period: month-end values times TER (basis points per year) divided by 12. */
export function terCostCents(monthEndValuesCents: ReadonlyArray<number>, terBp: number): number {
  const sum = monthEndValuesCents.reduce((a, v) => a + v, 0);
  return Math.round((sum * terBp) / 120000);
}

/**
 * Price in micro-units per unit (EUR) that values `unitsE8` at `valueCents`, rounded half up:
 * the inverse of `marketValueCents`. Used when a manually valued position gets a new value.
 */
export function priceMicroForValue(valueCents: number, unitsE8: number): number {
  if (unitsE8 <= 0) throw new RangeError('Units must be positive');
  if (valueCents < 0) throw new RangeError('A value cannot be negative');
  const units = BigInt(unitsE8);
  return Number((BigInt(valueCents) * E12 + units / 2n) / units);
}
