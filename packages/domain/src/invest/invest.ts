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
  unitsE8: number;
  /** Gross trade value, positive. */
  amountCents: number;
  feeCents: number;
  kind: 'buy' | 'sell';
}

/**
 * Cost basis (Einstand) with average cost: buys add amount and fees, a sale removes the cost of the
 * units sold in proportion to the units held. One function serves Reports and Vermögen.
 */
export function costBasisCents(
  opening: { unitsE8: number; costBasisCents: number },
  trades: ReadonlyArray<CostTrade>,
): number {
  let units = opening.unitsE8;
  let cost = opening.costBasisCents;
  for (const t of trades) {
    if (t.kind === 'buy') {
      units += Math.abs(t.unitsE8);
      cost += t.amountCents + t.feeCents;
    } else if (units > 0) {
      const sold = Math.min(units, Math.abs(t.unitsE8));
      cost -= Math.round((cost * sold) / units);
      units -= sold;
    }
  }
  return cost;
}

/** Fund cost over a period: month-end values times TER (basis points per year) divided by 12. */
export function terCostCents(monthEndValuesCents: ReadonlyArray<number>, terBp: number): number {
  const sum = monthEndValuesCents.reduce((a, v) => a + v, 0);
  return Math.round((sum * terBp) / 120000);
}
