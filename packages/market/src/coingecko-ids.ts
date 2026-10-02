/**
 * Coin ids for the CoinGecko source. A crypto security needs `security.coingecko_id`; Portfolio
 * Performance (PP) often only has a ticker or a cryptocalc link (`...?currency=BTC&fiat=EUR`).
 * `deriveCoingeckoId` turns the ticker (and the name as a cross-check) into a candidate through a
 * small curated table. It never guesses: an unknown ticker, a leveraged token or a ticker that
 * disagrees with the name comes back `unresolved` with a reason, for the operator to fill in.
 */

/**
 * Ticker to CoinGecko id, curated (every id checked against CoinGecko's coin list). Deliberately
 * absent: `BEST` (CoinGecko's `best` is Best Wallet Token, not the Bitpanda Ecosystem Token) and the
 * leveraged Bitpanda indices (`BTC2L`, `ETH2L`); they stay unresolved and fall back to cryptocalc.
 */
export const COINGECKO_IDS: Readonly<Record<string, string>> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai',
  BNB: 'binancecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  SOL: 'solana',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  LTC: 'litecoin',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  ATOM: 'cosmos',
  XLM: 'stellar',
  UNI: 'uniswap',
  BCH: 'bitcoin-cash',
  ETC: 'ethereum-classic',
  XMR: 'monero',
  TRX: 'tron',
  NEAR: 'near',
  ALGO: 'algorand',
  FIL: 'filecoin',
  AAVE: 'aave',
  MKR: 'maker',
  SHIB: 'shiba-inu',
  TON: 'the-open-network',
  ICP: 'internet-computer',
  APT: 'aptos',
  ARB: 'arbitrum',
  OP: 'optimism',
  SUI: 'sui',
  VET: 'vechain',
  HBAR: 'hedera-hashgraph',
  XTZ: 'tezos',
  EOS: 'eos',
  SAND: 'the-sandbox',
  MANA: 'decentraland',
  GRT: 'the-graph',
  CRO: 'crypto-com-chain',
  PEPE: 'pepe',
  VSN: 'vision-3',
  CC: 'canton-network',
  POL: 'polygon-ecosystem-token',
  MATIC: 'matic-network',
};

/** Words of a security name that identify a coin (lower case, whole words). */
const NAME_WORDS: Readonly<Record<string, string>> = {
  bitcoin: 'bitcoin',
  ethereum: 'ethereum',
  ether: 'ethereum',
  tether: 'tether',
  cardano: 'cardano',
  solana: 'solana',
  ripple: 'ripple',
  xrp: 'ripple',
  dogecoin: 'dogecoin',
  polkadot: 'polkadot',
  litecoin: 'litecoin',
  chainlink: 'chainlink',
  avalanche: 'avalanche-2',
  cosmos: 'cosmos',
  stellar: 'stellar',
  uniswap: 'uniswap',
  monero: 'monero',
  tron: 'tron',
  algorand: 'algorand',
  filecoin: 'filecoin',
  aave: 'aave',
  tezos: 'tezos',
  polygon: 'polygon-ecosystem-token',
};

export interface CoinIdInput {
  /** PP ticker (`BTC`, also `BTC-EUR`). */
  symbol?: string | null | undefined;
  /** Security name. */
  name?: string | null | undefined;
  /** A stored `quote_url`; a cryptocalc one names the coin in `currency=`. */
  quoteUrl?: string | null | undefined;
}

export type CoinIdResult =
  | { status: 'resolved'; id: string; symbol: string | undefined; via: 'symbol' | 'name' }
  | {
      status: 'unresolved';
      reason: 'no_symbol' | 'unknown_symbol' | 'name_conflict';
      symbol: string | undefined;
    };

/** The coin ticker a cryptocalc link names (`currency=BTC`), else undefined. */
export function cryptocalcSymbol(quoteUrl: string | null | undefined): string | undefined {
  if (!quoteUrl) return undefined;
  try {
    const url = new URL(quoteUrl);
    if (url.hostname !== 'cryptocalc.cc') return undefined;
    const symbol = url.searchParams.get('currency') ?? '';
    return /^[A-Za-z0-9]{2,12}$/.test(symbol) ? symbol.toUpperCase() : undefined;
  } catch {
    return undefined;
  }
}

const normalise = (symbol: string | null | undefined): string | undefined => {
  const base = (symbol ?? '')
    .trim()
    .toUpperCase()
    .replace(/[-/](EUR|USD)$/, '');
  return /^[A-Z0-9]{2,12}$/.test(base) ? base : undefined;
};

/** Multi-word names, taken out of the name before single words are looked at. */
const NAME_PHRASES: ReadonlyArray<readonly [string, string]> = [
  ['bitcoin cash', 'bitcoin-cash'],
  ['ethereum classic', 'ethereum-classic'],
];

const idFromName = (name: string | null | undefined): string | undefined => {
  let rest = (name ?? '').toLowerCase();
  const ids = new Set<string>();
  for (const [phrase, id] of NAME_PHRASES)
    if (rest.includes(phrase)) {
      ids.add(id);
      rest = rest.replace(phrase, ' ');
    }
  for (const word of rest.split(/[^a-z0-9]+/)) {
    const id = NAME_WORDS[word];
    if (id !== undefined) ids.add(id);
  }
  return ids.size === 1 ? [...ids][0] : undefined;
};

/**
 * Candidate CoinGecko id for a crypto security: ticker from `symbol`, else from a cryptocalc
 * `quoteUrl`, looked up in `COINGECKO_IDS`. The name is a cross-check: a name that clearly names
 * another coin makes the result `name_conflict`. Without any ticker a name that names exactly one
 * coin resolves `via: 'name'`. Everything else is reported `unresolved`, never guessed.
 */
export function deriveCoingeckoId(input: CoinIdInput): CoinIdResult {
  const symbol = normalise(input.symbol) ?? cryptocalcSymbol(input.quoteUrl);
  const named = idFromName(input.name);
  if (symbol === undefined) {
    return named === undefined
      ? { status: 'unresolved', reason: 'no_symbol', symbol }
      : { status: 'resolved', id: named, symbol, via: 'name' };
  }
  const id = COINGECKO_IDS[symbol];
  if (id === undefined) return { status: 'unresolved', reason: 'unknown_symbol', symbol };
  if (named !== undefined && named !== id)
    return { status: 'unresolved', reason: 'name_conflict', symbol };
  return { status: 'resolved', id, symbol, via: 'symbol' };
}

/**
 * `(symbol, name) => coin id | undefined`: the resolver shape the PP migration takes
 * (`preparePp(db, model, doc, resolveCoin)`). Resolved ids only, `undefined` for everything
 * `deriveCoingeckoId` reports as unresolved.
 */
export function resolveCoingeckoId(
  symbol: string | null | undefined,
  name?: string | null,
): string | undefined {
  const result = deriveCoingeckoId({ symbol, name });
  return result.status === 'resolved' ? result.id : undefined;
}
