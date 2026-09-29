import { INCOME_TYPES } from '@budget/db/schema';
import { marketValueCents } from '@budget/domain';
import type { Draft } from './cashflow';
import type { InvestmentResult } from './investments';
import { ACC, payeeId, securityId } from './master-data';

/**
 * Cases the prototype has no example for (C13), added so that every figure of the prototype stays
 * exact: net worth at every month end, the account split on 17.09.2026, category activity and
 * income per month. Each case therefore nets to zero at month end or replaces an existing flow.
 *
 * - Umschichtung: 1 unit of the emerging-markets ETF is sold in the depot and bought again in a
 *   second depot on the same day at the same price (a sale, the same security in two accounts),
 *   the money travelling depot → current account → second depot (tracking → budget → tracking).
 * - A distribution of the world ETF with fee and withholding tax, paid out net to the savings
 *   account; that month's interest booking shrinks by the same amount.
 * - A deleted duplicate booking; a US-dollar account that is empty at every month end.
 * - The credit card is partly paid from the savings account in September 2026 so that its balance
 *   on 17.09.2026 is the prototype's −450 €.
 */
export function coverageCases(
  drafts: Draft[],
  invest: InvestmentResult,
  firstSeq: number,
): { drafts: Draft[]; trades: InvestmentResult['trades'] } {
  let seq = firstSeq;
  const out: Draft[] = [];
  const trades: InvestmentResult['trades'] = [];
  const priceOn = (id: string, date: string) =>
    invest.prices.find((p) => p.securityId === securityId(id) && p.date === date)
      ?.priceMicro as number;
  const draft = (d: Omit<Draft, 'seq'>) => out.push({ seq: seq++, ...d });
  const transfer = (
    key: string,
    date: string,
    from: string,
    to: string,
    cents: number,
    memo: string,
  ) => {
    draft({
      date,
      accountId: from,
      amountCents: -cents,
      memo,
      splits: [{ categoryId: null, amountCents: -cents }],
      transferKey: key,
    });
    draft({
      date,
      accountId: to,
      amountCents: cents,
      memo,
      splits: [{ categoryId: null, amountCents: cents }],
      transferKey: key,
    });
  };

  // ---------- Umschichtung on 30.06.2025 ----------
  const day = '2025-06-30';
  const units = 100_000_000;
  const value = marketValueCents(units, priceOn('etfem', day));
  const trade = (key: string, accountId: string, kind: 'sell' | 'buy', signedUnits: number) =>
    trades.push({
      id: `trade-${key}`,
      securityId: securityId('etfem'),
      accountId,
      date: day,
      kind,
      unitsE8: signedUnits,
      amountCents: value,
      feeCents: 0,
      importKey: `sample-trade-${key}`,
    });
  trade('cov-sell', ACC.depot, 'sell', -units);
  draft({
    date: day,
    accountId: ACC.depot,
    amountCents: value,
    payeeId: payeeId('Broker C'),
    memo: 'Verkauf ETF Schwellenländer',
    splits: [{ categoryId: null, amountCents: value }],
    tradeKey: 'cov-sell',
  });
  transfer('cov-t1', day, ACC.depot, ACC.giro, value, 'Umschichtung');
  transfer('cov-t2', day, ACC.giro, ACC.depot2, value, 'Umschichtung');
  trade('cov-buy', ACC.depot2, 'buy', units);
  draft({
    date: day,
    accountId: ACC.depot2,
    amountCents: -value,
    payeeId: payeeId('Broker C'),
    memo: 'Kauf ETF Schwellenländer',
    splits: [{ categoryId: null, amountCents: -value }],
    tradeKey: 'cov-buy',
  });

  // ---------- Distribution with fee and tax, paid net instead of part of the interest ----------
  const interest = drafts.find(
    (d) =>
      d.memo === 'Zinsen und Ausschüttungen' &&
      d.date.startsWith('2025-12') &&
      d.amountCents > 2_000,
  );
  if (!interest)
    throw new Error('No interest booking in December 2025 to take the distribution from');
  const gross = 1_800;
  const fee = 150;
  const tax = 350;
  const net = gross - fee - tax;
  interest.amountCents -= net;
  (interest.splits[0] as Draft['splits'][number]).amountCents -= net;
  trades.push({
    id: 'trade-cov-div',
    securityId: securityId('etfw'),
    accountId: ACC.depot,
    date: interest.date,
    kind: 'dividend',
    unitsE8: 0,
    amountCents: gross,
    feeCents: fee,
    taxCents: tax,
    importKey: 'sample-trade-cov-div',
  });
  draft({
    date: interest.date,
    accountId: ACC.tagesgeld,
    amountCents: net,
    payeeId: payeeId('Broker C'),
    memo: 'Ausschüttung ETF Welt (netto)',
    splits: [{ categoryId: null, amountCents: net, incomeTypeId: INCOME_TYPES.capital.id }],
    tradeKey: 'cov-div',
  });

  // ---------- A deleted duplicate and a dollar account ----------
  const copy = drafts.find(
    (d) =>
      d.date.startsWith('2026-01') &&
      d.accountId === ACC.giro &&
      d.splits.length === 1 &&
      d.splits[0]?.categoryId &&
      !d.transferKey,
  );
  if (!copy) throw new Error('No booking to duplicate in January 2026');
  draft({
    ...copy,
    memo: `${copy.memo ?? ''} (doppelt)`,
    deletedAt: '2026-01-31T09:00:00.000Z',
    splits: copy.splits.map((s) => ({ ...s })),
  });
  draft({
    date: '2024-06-10',
    accountId: ACC.usd,
    amountCents: 50_000,
    currency: 'USD',
    memo: 'Reisekasse',
    splits: [{ categoryId: null, amountCents: 50_000 }],
  });
  draft({
    date: '2024-06-20',
    accountId: ACC.usd,
    amountCents: -50_000,
    currency: 'USD',
    memo: 'Ausgaben USA',
    splits: [{ categoryId: null, amountCents: -50_000 }],
  });

  // ---------- Card balance on 17.09.2026 ----------
  const card = [...drafts, ...out]
    .filter((d) => d.accountId === ACC.karte && d.date <= '2026-09-17')
    .reduce((a, d) => a + d.amountCents, 0);
  const missing = -45_000 - card;
  if (missing > 0)
    transfer(
      'cov-card',
      '2026-09-16',
      ACC.tagesgeld,
      ACC.karte,
      missing,
      'Kartenzahlung vom Tagesgeld',
    );
  return { drafts: out, trades };
}
