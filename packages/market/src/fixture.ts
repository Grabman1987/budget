import { synthHistory, type Anchor } from './synth';
import type {
  DailyQuote,
  DailyRate,
  FxSource,
  QuoteSource,
  QuoteSourceId,
  SecurityRef,
} from './types';

/** Day of the fallback anchor for a series that has no known points at all. */
const BASE_DAY = '2023-09-30';

function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * The series behind `fixtureQuoteSource`, synchronous so the seed can use it: daily closes of a
 * security through its known points. Seeded by symbol, else id.
 */
export function fixtureQuotes(
  ref: Pick<SecurityRef, 'id' | 'symbol'>,
  anchors: readonly Anchor[],
  from: string,
  to: string,
  volBp = 90,
): DailyQuote[] {
  const seed = ref.symbol ?? ref.id;
  const known =
    anchors.length > 0
      ? anchors
      : [{ date: BASE_DAY, value: (10 + (seedOf(seed) % 190)) * 1_000_000 }];
  return synthHistory(known, from, to, { seed: `quote|${seed}`, volBp }).map((a) => ({
    date: a.date,
    priceMicro: a.value,
  }));
}

/** The series behind `fixtureFxSource` (EUR per unit, micro), synchronous for the seed. */
export function fixtureRates(
  currency: string,
  anchors: readonly Anchor[],
  from: string,
  to: string,
  volBp = 35,
): DailyRate[] {
  const known =
    anchors.length > 0
      ? anchors
      : [{ date: BASE_DAY, value: 500_000 + (seedOf(currency) % 1_000_000) }];
  return synthHistory(known, from, to, { seed: `fx|${currency}`, volBp }).map((a) => ({
    date: a.date,
    rateMicro: a.value,
  }));
}

export interface FixtureQuoteOptions {
  /** Known points of a security (month-end prices, stored prices). None: a synthetic base. */
  anchorsFor?: (ref: SecurityRef) => readonly Anchor[];
  /** Daily volatility in basis points. */
  volBp?: number;
  /** Which source this stands in for (what `price.source` says). */
  id?: QuoteSourceId;
}

/**
 * Deterministic, synthetic daily closes: a seeded bridge through the anchors (hitting them
 * exactly), a seeded walk outside. Never touches the network. Seeded by symbol, else id.
 */
export function fixtureQuoteSource(options: FixtureQuoteOptions = {}): QuoteSource {
  const { anchorsFor = () => [], volBp = 90, id = 'yfinance' } = options;
  return {
    id,
    async history(ref, from, to): Promise<DailyQuote[]> {
      return fixtureQuotes(ref, anchorsFor(ref), from, to, volBp);
    },
  };
}

export interface FixtureFxOptions {
  /** Known EUR-per-unit rates (micro) of a currency. None: a synthetic base near parity. */
  anchorsFor?: (currency: string) => readonly Anchor[];
  volBp?: number;
}

/** Deterministic, synthetic ECB-style rates on weekdays (EUR per unit, micro). No network. */
export function fixtureFxSource(options: FixtureFxOptions = {}): FxSource {
  const { anchorsFor = () => [], volBp = 35 } = options;
  return {
    async history(currency, from, to): Promise<DailyRate[]> {
      return fixtureRates(currency, anchorsFor(currency), from, to, volBp);
    },
  };
}
