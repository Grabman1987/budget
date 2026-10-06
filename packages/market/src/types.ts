/** Where a stored price came from (`price.source` for the network sources). */
export type QuoteSourceId = 'yfinance' | 'ariva' | 'cryptocalc' | 'coingecko';

/** What a quote source needs to know about a security. All identifiers are data, never code. */
export interface SecurityRef {
  id: string;
  /** `security.kind`; crypto is priced by CoinGecko only. */
  kind: string;
  /** Yahoo symbol. */
  symbol: string | null;
  /** Legacy Ariva security id; no source reads it (Ariva's CSV needs a login). */
  fallbackQuoteId: string | null;
  /** Exchange of the Ariva quote (`boerse_id`); wins over one inside `quoteUrl`. */
  quoteExchange: string | null;
  /** The quote page from Portfolio Performance (Ariva, or cryptocalc for crypto), by host. */
  quoteUrl: string | null;
  /** CoinGecko coin id. */
  coingeckoId: string | null;
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
  /**
   * Whether the security carries the identifier this source needs. A source that does not is
   * skipped by the refresh without counting as a failure. Absent: always tried.
   */
  supports?(ref: SecurityRef): boolean;
  /** Daily closes for `from`..`to` (both included), ascending. Throws a `MarketError`. */
  history(ref: SecurityRef, from: string, to: string): Promise<DailyQuote[]>;
}

export interface FxSource {
  /** EUR per unit of `currency` for `from`..`to` (both included), ascending. */
  history(currency: string, from: string, to: string): Promise<DailyRate[]>;
}

/** Index number of one month (consumer prices), micro-units: 129,8 = 129 800 000. */
export interface MonthlyIndex {
  month: string;
  indexMicro: number;
}

export interface CpiSource {
  /** Series key stored with the rows (`price index base`). */
  readonly series: string;
  /** The whole monthly series, ascending. Throws a `MarketError`. */
  monthly(): Promise<MonthlyIndex[]>;
  /** Total and sub-indices from the same monthly read; absent on legacy/test sources. */
  monthlySeries?(): Promise<Record<string, MonthlyIndex[]>>;
}

/** Everything the refresh jobs need; the DB is not part of it. */
export interface MarketSources {
  /** First source tried. */
  quotes: QuoteSource;
  /** Tried after `quotes` (and before `fallbackQuotes`), e.g. the crypto feeds. */
  moreQuotes?: QuoteSource[] | undefined;
  /** Last resort when the sources before it answer with an error or nothing. */
  fallbackQuotes?: QuoteSource | undefined;
  fx: FxSource;
  /** Consumer price index for the comparison in report 2.4; absent in tests that do not need it. */
  cpi?: CpiSource | undefined;
}
