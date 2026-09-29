import { unitsFor } from '@budget/domain';
import { PRODUCTS, referenceModel, type RefProduct } from '../reference/model';
import type { Contribution, Draft } from './cashflow';
import { monthEnd } from './cashflow';
import { ACCOUNT_OF_PRODUCT, payeeId, securityId } from './master-data';
import type { SampleLedger } from './types';

/** Price of one unit at the start (2023-09-30), EUR. Synthetic, only the returns matter. */
const START_PRICE: Record<string, number> = {
  etfw: 85,
  etfem: 32,
  akta: 48,
  btc: 27000,
  eth: 1650,
  p2p: 100,
};
const PRICE_SOURCE = {
  etfw: 'yfinance',
  etfem: 'yfinance',
  akta: 'yfinance',
  btc: 'yfinance',
  eth: 'yfinance',
  p2p: 'manual',
} as const;
export const START_DATE = '2023-09-30';

export interface InvestmentResult {
  prices: SampleLedger['prices'];
  holdings: SampleLedger['holdings'];
  trades: SampleLedger['trades'];
  buyDrafts: Draft[];
  /** Market value at the end of the sample per product id, cents. */
  finalValueCents: Record<string, number>;
}

/**
 * Prices, opening holdings and buys for all products. Every contribution buys at the month-end
 * price of its month, so the value path of the prototype (`PV`) is reproduced:
 * value(k) = units(k) x price(k) with v(k) = v(k-1) * (1 + r(k)) + c(k).
 * The opening units are solved so that today's value equals the prototype's value to the cent.
 */
export function buildInvestments(
  contributions: Contribution[],
  firstSeq: number,
): InvestmentResult {
  const ref = referenceModel();
  const prices: InvestmentResult['prices'] = [];
  const trades: InvestmentResult['trades'] = [];
  const holdings: InvestmentResult['holdings'] = [];
  const buyDrafts: Draft[] = [];
  const finalValueCents: Record<string, number> = {};
  let seq = firstSeq;

  PRODUCTS.forEach((p: RefProduct, index) => {
    const series = ref.pv[p.id];
    if (!series) throw new Error(`No series for ${p.id}`);
    // Price path: p(-1) = start, p(k) = p(k-1) * (1 + r(k)), stored as micro-units.
    const priceMicro: number[] = [];
    let price = START_PRICE[p.id] as number;
    const startMicro = Math.round(price * 1e6);
    for (let k = 0; k < 36; k++) {
      price *= 1 + (series.r[k] as number);
      priceMicro[k] = Math.round(price * 1e6);
    }
    const source = PRICE_SOURCE[p.id as keyof typeof PRICE_SOURCE];
    prices.push({
      securityId: securityId(p.id),
      date: START_DATE,
      priceMicro: startMicro,
      currency: 'EUR',
      source,
    });
    ref.months.forEach((m) =>
      prices.push({
        securityId: securityId(p.id),
        date: monthEnd(m),
        priceMicro: priceMicro[m.k] as number,
        currency: 'EUR',
        source,
      }),
    );

    // Buys
    let boughtUnits = 0;
    for (const c of contributions) {
      const amount = c.perProduct[index] ?? 0;
      if (amount <= 0) continue;
      // Savings plans execute at the month-end price: value(k) = (value(k-1) + c) * ... in the prototype
      // is value(k-1) * (1 + r) + c, i.e. the contribution buys at price(k) after the month's return.
      const unitsE8 = unitsFor(amount, priceMicro[c.k] as number);
      const executed = monthEnd(ref.months[c.k] as (typeof ref.months)[number]);
      boughtUnits += unitsE8;
      const tradeKey = `${c.k}-${p.id}-${c.component}`;
      trades.push({
        id: `trade-${tradeKey}`,
        securityId: securityId(p.id),
        accountId: ACCOUNT_OF_PRODUCT[p.id] as string,
        date: executed,
        kind: 'buy',
        unitsE8,
        amountCents: amount,
        feeCents: 0,
        importKey: `sample-trade-${tradeKey}`,
      });
      buyDrafts.push({
        seq: seq++,
        date: executed,
        accountId: ACCOUNT_OF_PRODUCT[p.id] as string,
        amountCents: -amount,
        payeeId: payeeId(p.plat),
        memo: `Kauf ${p.name}`,
        splits: [{ categoryId: null, amountCents: -amount }],
        tradeKey,
      });
    }

    // Opening units so that value(35) equals today's value exactly.
    const targetCents = Math.round(p.now * 100);
    finalValueCents[p.id] = targetCents;
    const finalUnits = unitsFor(targetCents, priceMicro[35] as number);
    const openingUnits = finalUnits - boughtUnits;
    if (openingUnits < 0) throw new Error(`Negative opening units for ${p.id}`);
    holdings.push({
      id: `hold-${p.id}-open`,
      securityId: securityId(p.id),
      accountId: ACCOUNT_OF_PRODUCT[p.id] as string,
      asOf: START_DATE,
      unitsE8: openingUnits,
      costBasisCents: Math.round(series.start * 0.92 * 100),
    });
  });

  return { prices, holdings, trades, buyDrafts, finalValueCents };
}
