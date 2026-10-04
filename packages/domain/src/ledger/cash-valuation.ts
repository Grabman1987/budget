import { toEurCents } from '../invest/invest';

/** Stored rates are EUR per native unit, in micro-units. */
export interface CashRate {
  date: string;
  rateMicro: number;
  source: string;
}

export interface CashValuation {
  currency: string;
  asOf: string;
  eurCents: number | null;
  rateMicro: number | null;
  rateDate: string | null;
  rateSource: string | null;
}

/** Display valuation only; never changes a booking or a native reconciliation. */
export function cashValuation(
  amountCents: number,
  currency: string,
  asOf: string,
  rate?: CashRate,
): CashValuation {
  const available = currency === 'EUR' || (rate !== undefined && rate.date <= asOf);
  const rateMicro = currency === 'EUR' ? 1_000_000 : available ? rate!.rateMicro : null;
  return {
    currency,
    asOf,
    eurCents: rateMicro === null ? null : toEurCents(amountCents, rateMicro),
    rateMicro,
    rateDate: currency === 'EUR' || !available ? null : rate!.date,
    rateSource: currency === 'EUR' || !available ? null : rate!.source,
  };
}

/** Single rounding between currencies; rates are EUR per native unit in micro-units. */
export function convertCashCents(
  amountCents: number,
  fromRateMicro: number,
  toRateMicro: number,
): number {
  if (
    ![amountCents, fromRateMicro, toRateMicro].every(Number.isSafeInteger) ||
    fromRateMicro <= 0 ||
    toRateMicro <= 0
  )
    throw new RangeError('Cash conversion requires integer cents and positive integer rates');
  const numerator = BigInt(Math.abs(amountCents)) * BigInt(fromRateMicro);
  const denominator = BigInt(toRateMicro);
  const result =
    Number((numerator * 2n + denominator) / (denominator * 2n)) * Math.sign(amountCents);
  if (!Number.isSafeInteger(result)) throw new RangeError('Cash conversion exceeds safe cents');
  return result;
}
