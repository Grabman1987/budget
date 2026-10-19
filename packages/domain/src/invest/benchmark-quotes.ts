import { addDays } from '../date';
import type { SecurityKind } from '../wealth/types';
import { ExchangeRateUnavailableError, fxOn, type DatedPrice, type RateTable } from './series';

export type BenchmarkGap = 'missing_price' | 'missing_fx' | 'not_selected';

/** A derived EUR price-index level, never stored cash or a held-security valuation fallback. */
export interface BenchmarkQuote {
  date: string;
  level: number | null;
  reason?: 'missing_fx' | null;
  /** Legacy EUR levels allow Friday/weekend carry; known manual/crypto sources disable it. */
  weekendCarry?: boolean;
}

export interface ReportQuote extends BenchmarkQuote {
  reason: 'missing_fx' | null;
}

/** Historical FX is EUR per foreign unit; derived index levels keep submicro precision. */
export function benchmarkQuotesInEur(
  prices: readonly DatedPrice[],
  rates: RateTable,
  kind: SecurityKind | undefined,
): ReportQuote[] {
  const weekendCarry = ['etf', 'fund', 'stock', 'bond'].includes(kind ?? '');
  return prices.map((price) => {
    try {
      const level =
        price.currency === 'EUR'
          ? price.priceMicro
          : (price.priceMicro * fxOn(rates, price.currency, price.date)) / 1_000_000;
      return { date: price.date, level, reason: null, weekendCarry };
    } catch (error) {
      if (!(error instanceof ExchangeRateUnavailableError)) throw error;
      return { date: price.date, level: null, reason: 'missing_fx', weekendCarry };
    }
  });
}

interface ResolvedBenchmarkQuote {
  /** Keep the last observed date for gap explanations, even when it cannot value this day. */
  quote: BenchmarkQuote | undefined;
  level: number | null;
  gap: Exclude<BenchmarkGap, 'not_selected'> | null;
}

/** Exact weekday closes; eligible weekends may use Friday, never an older trading day. */
export function benchmarkQuoteResolver(quotes: readonly BenchmarkQuote[]) {
  const ordered = [...quotes].sort((a, b) => a.date.localeCompare(b.date));
  return (day: string): ResolvedBenchmarkQuote => {
    const quote = ordered.findLast((candidate) => candidate.date <= day);
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const closeDay = addDays(
      day,
      quote?.weekendCarry !== false ? (weekday === 0 ? -2 : weekday === 6 ? -1 : 0) : 0,
    );
    const gap =
      quote?.reason === 'missing_fx'
        ? 'missing_fx'
        : quote === undefined || quote.date < closeDay || quote.level == null || quote.level < 0
          ? 'missing_price'
          : null;
    return { quote, level: gap === null ? quote!.level : null, gap };
  };
}
