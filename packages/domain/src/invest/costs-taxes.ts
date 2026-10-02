import { mulDivRound } from '../wealth/int';
import { sameDayMonthsBack } from './performance';
import type { ProductTrade } from './cost';

/**
 * Report 4.5 (Kosten, Steuern, Erträge). Taxes are shown exactly as the broker booked them on the
 * trades (`taxCents`, or the amount of a `tax` booking): this module never computes a withholding.
 * The only calculated tax is the illustrative latent tax on unrealised gains, labelled as such.
 */

/** Austrian KESt on capital income and gains, also for crypto bought since 2022 (27,5 %). */
export const KEST_RATE_BP = 2_750;

/** Rule S3-2 / concept ch. 8: total costs at most 0,30 % of the portfolio value per year. */
export const COST_RATE_TARGET_BP = 30;

/**
 * Illustrative tax if a position with this unrealised gain were sold today: the rate on a gain,
 * nothing on a loss (a loss is not refunded; netting between products is not applied, so a sum of
 * these is an upper bound). Rounded half up to whole cents.
 */
export function latentTaxCents(unrealizedGainCents: number, rateBp: number = KEST_RATE_BP): number {
  return unrealizedGainCents > 0 ? mulDivRound(unrealizedGainCents, rateBp, 10_000) : 0;
}

const inLast12Months = (t: { date: string }, today: string) =>
  t.date > sameDayMonthsBack(today, 12) && t.date <= today;

export interface TaxBreakdown {
  /** Withheld by the broker on dividends. */
  dividendCents: number;
  /** Withheld by the broker on interest. */
  interestCents: number;
  /** Withheld on sales and deliveries out (tax on realised gains). */
  saleCents: number;
  /** Tax charged on purchases and deliveries in. */
  purchaseCents: number;
  /** Standalone tax bookings (e.g. a broker's advance lump sum). */
  bookingCents: number;
  /** Dividend plus interest: the tax that belongs to the income. */
  onIncomeCents: number;
  /** Everything above. */
  totalCents: number;
}

/** Taxes of the 12 months up to `today` as booked on the trades (EUR trades). */
export function taxBreakdownLast12Months(
  trades: ReadonlyArray<ProductTrade>,
  today: string,
): TaxBreakdown {
  const out = {
    dividendCents: 0,
    interestCents: 0,
    saleCents: 0,
    purchaseCents: 0,
    bookingCents: 0,
  };
  for (const t of trades) {
    if (!inLast12Months(t, today)) continue;
    switch (t.kind) {
      case 'dividend':
        out.dividendCents += t.taxCents;
        break;
      case 'interest':
        out.interestCents += t.taxCents;
        break;
      case 'sell':
      case 'delivery_out':
        out.saleCents += t.taxCents;
        break;
      case 'buy':
      case 'delivery_in':
        out.purchaseCents += t.taxCents;
        break;
      case 'tax':
        out.bookingCents += t.amountCents + t.taxCents;
        break;
      case 'fee':
      case 'split':
        break;
    }
  }
  const onIncomeCents = out.dividendCents + out.interestCents;
  return {
    ...out,
    onIncomeCents,
    totalCents: onIncomeCents + out.saleCents + out.purchaseCents + out.bookingCents,
  };
}

export interface FeeBreakdown {
  /** Fee on buys, sales and deliveries (Orderentgelt). */
  orderCents: number;
  /** Fee deducted from dividends and interest. */
  incomeCents: number;
  /** Standalone fee bookings (account or custody fees). */
  bookingCents: number;
  /** Fees on tax bookings and splits, if a broker books any. */
  otherCents: number;
  /** Equals `feesLast12Months` of the same trades. */
  totalCents: number;
}

/** Fees of the 12 months up to `today` by origin; the parts add up to `feesLast12Months`. */
export function feeBreakdownLast12Months(
  trades: ReadonlyArray<ProductTrade>,
  today: string,
): FeeBreakdown {
  const out = { orderCents: 0, incomeCents: 0, bookingCents: 0, otherCents: 0 };
  for (const t of trades) {
    if (!inLast12Months(t, today)) continue;
    switch (t.kind) {
      case 'buy':
      case 'sell':
      case 'delivery_in':
      case 'delivery_out':
        out.orderCents += t.feeCents;
        break;
      case 'dividend':
      case 'interest':
        out.incomeCents += t.feeCents;
        break;
      case 'fee':
        out.bookingCents += t.feeCents + t.amountCents;
        break;
      case 'tax':
      case 'split':
        out.otherCents += t.feeCents;
        break;
    }
  }
  return {
    ...out,
    totalCents: out.orderCents + out.incomeCents + out.bookingCents + out.otherCents,
  };
}

export interface IncomeBySource {
  grossCents: number;
  taxCents: number;
  feeCents: number;
}

/** Dividends and interest of the 12 months, summed per kind. */
export function incomeByKindLast12Months(
  trades: ReadonlyArray<ProductTrade>,
  today: string,
): { dividend: IncomeBySource; interest: IncomeBySource } {
  const zero = (): IncomeBySource => ({ grossCents: 0, taxCents: 0, feeCents: 0 });
  const out = { dividend: zero(), interest: zero() };
  for (const t of trades) {
    if ((t.kind !== 'dividend' && t.kind !== 'interest') || !inLast12Months(t, today)) continue;
    const bucket = out[t.kind];
    bucket.grossCents += t.amountCents;
    bucket.taxCents += t.taxCents;
    bucket.feeCents += t.feeCents;
  }
  return out;
}
