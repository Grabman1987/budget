import { fixtureQuotes, fixtureRates, type Anchor } from '@budget/market';
import type { SampleLedger } from './ledger/types';

type PriceRow = SampleLedger['prices'][number];
type FxRow = SampleLedger['fxRates'][number];

/** Daily volatility of the synthetic series in basis points, by kind of security. */
const VOL_BP: Record<string, number> = { crypto: 300, stock: 110, etf: 80, fund: 70 };

/**
 * Daily prices and ECB rates of the sample ledger, produced by the fixture market sources from
 * the month-end prices and the two rates a month the ledger already has: a seeded Brownian bridge
 * that hits each of those points exactly (so every figure of the prototype stays as it is) and
 * adds the weekdays in between. Nothing before the first or after the last known point.
 * Rows that exist already (the known points themselves) are left out.
 */
export function dailyMarketRows(ledger: SampleLedger): { prices: PriceRow[]; fxRates: FxRow[] } {
  const prices: PriceRow[] = [];
  const known = new Set(ledger.prices.map((p) => `${p.securityId}|${p.date}`));
  for (const sec of ledger.securities) {
    if (!sec.symbol) continue;
    const own = ledger.prices
      .filter((p) => p.securityId === sec.id)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = own[0];
    const last = own[own.length - 1];
    if (!first || !last) continue;
    const anchors: Anchor[] = own.map((p) => ({ date: p.date, value: p.priceMicro }));
    const ref = { id: sec.id, symbol: sec.symbol };
    for (const q of fixtureQuotes(ref, anchors, first.date, last.date, VOL_BP[sec.kind] ?? 90)) {
      if (known.has(`${sec.id}|${q.date}`)) continue;
      prices.push({
        securityId: sec.id,
        date: q.date,
        priceMicro: q.priceMicro,
        currency: sec.currency ?? 'EUR',
        source: first.source,
      });
    }
  }

  const fxRates: FxRow[] = [];
  const knownFx = new Set(ledger.fxRates.map((r) => `${r.currency}|${r.date}`));
  for (const currency of new Set(ledger.fxRates.map((r) => r.currency))) {
    const own = ledger.fxRates
      .filter((r) => r.currency === currency)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = own[0];
    const last = own[own.length - 1];
    if (!first || !last) continue;
    const anchors: Anchor[] = own.map((r) => ({ date: r.date, value: r.rateMicro }));
    for (const r of fixtureRates(currency, anchors, first.date, last.date)) {
      if (knownFx.has(`${currency}|${r.date}`)) continue;
      fxRates.push({ date: r.date, currency, rateMicro: r.rateMicro, source: 'ecb' });
    }
  }
  return { prices, fxRates };
}
