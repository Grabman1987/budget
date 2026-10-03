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
