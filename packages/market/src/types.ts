/** Where a stored price came from (`price.source` for the two network sources). */
export type QuoteSourceId = 'yfinance' | 'ariva';

/** What a quote source needs to know about a security. All identifiers are data, never code. */
export interface SecurityRef {
  id: string;
  /** Primary quote id (Yahoo symbol). */
  symbol: string | null;
  /** Fallback quote id (Ariva security id). */
  fallbackQuoteId: string | null;
  /** Exchange of the fallback quote (Ariva `boerse_id`). */
  quoteExchange: string | null;
  /** Currency the security is quoted in; a source answering in another currency is refused. */
  currency: string;
  /** Adjusted close instead of the plain close (Yahoo only). Default: unadjusted. */
  adjusted: boolean;
}

/** Close of one day, micro-units of the security currency. */
export interface DailyQuote {
  date: string;
  priceMicro: number;
}

/** ECB reference rate of one day: EUR per one unit of the currency, micro-units. */
export interface DailyRate {
  date: string;
  rateMicro: number;
}

export interface QuoteSource {
  readonly id: QuoteSourceId;
  /** Daily closes for `from`..`to` (both included), ascending. Throws a `MarketError`. */
  history(ref: SecurityRef, from: string, to: string): Promise<DailyQuote[]>;
}

export interface FxSource {
  /** EUR per unit of `currency` for `from`..`to` (both included), ascending. */
  history(currency: string, from: string, to: string): Promise<DailyRate[]>;
}

/** Everything the refresh jobs need; the DB is not part of it. */
export interface MarketSources {
  quotes: QuoteSource;
  /** Used when the primary answers with an error or nothing. */
  fallbackQuotes?: QuoteSource | undefined;
  fx: FxSource;
}
