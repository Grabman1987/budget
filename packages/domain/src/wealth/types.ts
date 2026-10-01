/** Security kinds of the `security` table (classified by kind and asset class, never by name). */
export type SecurityKind =
  'etf' | 'stock' | 'fund' | 'bond' | 'crypto' | 'p2p' | 'commodity' | 'other';

/** One position of the portfolio at a day, valued in cents. */
export interface WealthPosition {
  id: string;
  /** Same security on several platforms shares this id; defaults to the position id. */
  securityId?: string;
  kind: SecurityKind;
  /** Asset class key (id of `asset_class`), `null` when the security has none. */
  assetClass: string | null;
  valueCents: number;
  /** Institution (broker, crypto or P2P platform); `null` when unknown. */
  platform?: string | null;
}

/** Kinds that count as speculative in R15 (crypto, P2P and single stocks). */
export const SPECULATIVE_KINDS: ReadonlySet<SecurityKind> = new Set(['crypto', 'p2p', 'stock']);

/** Kinds that are a single title in R14 (funds and ETFs diversify, P2P is covered by the platform limit). */
export const SINGLE_TITLE_KINDS: ReadonlySet<SecurityKind> = new Set(['stock', 'bond', 'crypto']);

/** Kinds whose platform is limited separately in R14. */
export const PLATFORM_LIMITED_KINDS: ReadonlySet<SecurityKind> = new Set(['crypto', 'p2p']);
