export const MARKET_ERROR_KINDS = [
  'network',
  'timeout',
  'rate_limited',
  'not_found',
  'http',
  'parse',
  'empty',
  'currency_mismatch',
  'not_configured',
] as const;
export type MarketErrorKind = (typeof MARKET_ERROR_KINDS)[number];

/**
 * A failed lookup. The message is fixed text per kind: it never carries the request URL (which
 * can hold identifiers), headers or any part of the response body, so it is safe to log and to
 * store. `kind` is the "error class" of the inbox item.
 */
export class MarketError extends Error {
  /** Allowlisted currency evidence only; never derive it from the free-form message. */
  readonly currencyEvidence: { currency: string; origin: 'response' | 'mapping' } | null;
  constructor(
    readonly kind: MarketErrorKind,
    detail?: string,
    currencyEvidence?: { currency: unknown; origin: 'response' | 'mapping' },
    /** HTTP status of the answer, when there was one (attempt history only). */
    readonly httpStatus?: number,
  ) {
    super(detail ? `${kind}: ${detail}` : kind);
    this.name = 'MarketError';
    this.currencyEvidence =
      kind === 'currency_mismatch' &&
      typeof currencyEvidence?.currency === 'string' &&
      /^[A-Za-z]{3}$/.test(currencyEvidence.currency)
        ? { currency: currencyEvidence.currency, origin: currencyEvidence.origin }
        : null;
  }
}

export const errorKind = (error: unknown): MarketErrorKind =>
  error instanceof MarketError ? error.kind : 'network';
