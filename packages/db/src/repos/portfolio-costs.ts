import {
  addDays,
  combinedCosts,
  ExchangeRateUnavailableError,
  PriceUnavailableError,
  taxBreakdownInRange,
  terOf,
  COST_RATE_TARGET_BP,
  KEST_RATE_BP,
  feeBreakdownLast12Months,
  incomeByKindLast12Months,
  latentTaxCents,
  sameDayMonthsBack,
  taxBreakdownLast12Months,
  type FeeBreakdown,
  type IncomeBySource,
  type SecurityKind,
  type TaxBreakdown,
  mulDivRound,
} from '@budget/domain';
import { and, asc, isNull, lte } from 'drizzle-orm';
import { account, security } from '../schema';
import {
  lastTwelveMonthEnds,
  monthEndValuesForCosts,
  portfolioSummary,
  ratesAsOf,
  tradesInEur,
  tradesUpTo,
} from './portfolio-summary';
import { MissingFxRateError } from './errors';
import { namedNotes, runWithValuationNotes, withValuationRange } from './valuation-notes';
import { bankCostsReport } from './bank-costs-report';
import { holdingValuesAsOf, valuationSeries } from './portfolio';
import type { Executor } from './types';

export interface CostsTaxesProduct {
  securityId: string;
  name: string;
  kind: SecurityKind;
  /** Value today; 0 for a product that was sold but still had income or costs in the window. */
  valueCents: number;
  /** Einstand of the units held; `null` when the basis is not documented. */
  costBasisCents: number | null;
  unrealizedGainCents: number | null;
  /** Illustrative KESt on the unrealised gain; `null` without a documented basis. */
  latentTaxCents: number | null;
  terBp: number;
  terCents: number;
  feesCents: number;
  incomeGrossCents: number;
  /** Tax withheld by the broker on the product's income. */
  incomeTaxCents: number;
}

export interface CostsTaxesReport {
  asOf: string;
  /** The 12 months `(from, to]`. */
  from: string;
  to: string;
  valueCents: number;
  income: {
    dividend: IncomeBySource;
    interest: IncomeBySource;
    grossCents: number;
  };
  /** Taxes exactly as the broker booked them; nothing is computed here. */
  taxes: TaxBreakdown;
  costs: {
    terCents: number;
    fees: FeeBreakdown;
    totalCents: number;
    costRateBp: number;
    targetBp: number;
  };
  /** Erträge brutto − Steuern auf Erträge − Gebühren und TER. */
  net: { grossCents: number; taxOnIncomeCents: number; costsCents: number; netCents: number };
  latent: {
    rateBp: number;
    /** Sum over products with a documented basis (an upper bound: no loss netting). */
    totalCents: number;
    /** False when at least one held product has no documented basis. */
    complete: boolean;
  };
  products: CostsTaxesProduct[];
}

/**
 * Costs, taxes and income of the last 12 months (report 4.5). Costs and income reuse the portfolio
 * summary (`fundCosts`, `incomeLast12Months`) so the figures equal Vermögen; the broker's taxes are
 * read from the trades as booked, never derived from a rate. Only the latent tax on unrealised
 * gains is calculated (27,5 %), and it is labelled as an example, not as a tax advice.
 */
export function costsTaxesReport(db: Executor, options: { today: string }): CostsTaxesReport {
  const { today } = options;
  const summary = portfolioSummary(db, { today, period: '1J' });
  const trades = tradesInEur(tradesUpTo(db, today), ratesAsOf(db, today));
  const byKind = incomeByKindLast12Months(trades, today);
  const taxes = taxBreakdownLast12Months(trades, today);
  const fees = feeBreakdownLast12Months(trades, today);
  const grossCents = byKind.dividend.grossCents + byKind.interest.grossCents;

  const from = sameDayMonthsBack(today, 12);
  const inWindow = (t: { date: string }) => t.date > from && t.date <= today;
  const income = new Map<string, { gross: number; tax: number }>();
  for (const t of trades) {
    if ((t.kind !== 'dividend' && t.kind !== 'interest') || !inWindow(t)) continue;
    const row = income.get(t.securityId) ?? { gross: 0, tax: 0 };
    row.gross += t.amountCents;
    row.tax += t.taxCents;
    income.set(t.securityId, row);
  }
  const securities = new Map(
    db
      .select()
      .from(security)
      .where(isNull(security.deletedAt))
      .all()
      .map((s) => [s.id, s]),
  );
  const costsOf = new Map(summary.costs.bySecurity.map((c) => [c.securityId, c]));
  const held = new Map(summary.positions.map((p) => [p.securityId, p]));

  const ids = new Set<string>([...held.keys()]);
  for (const [id, c] of costsOf) if (c.terCents > 0 || c.feesCents > 0) ids.add(id);
  for (const id of income.keys()) ids.add(id);

  const products = [...ids]
    .flatMap((id): CostsTaxesProduct[] => {
      const sec = securities.get(id);
      if (!sec) return [];
      const position = held.get(id);
      const cost = costsOf.get(id);
      const gain = position?.gainCents ?? null;
      const earned = income.get(id);
      return [
        {
          securityId: id,
          name: sec.name,
          kind: sec.kind,
          valueCents: position?.valueCents ?? 0,
          costBasisCents: position ? position.costCents : 0,
          unrealizedGainCents: position ? gain : 0,
          latentTaxCents: position ? (gain === null ? null : latentTaxCents(gain)) : 0,
          terBp: sec.terBp,
          terCents: cost?.terCents ?? 0,
          feesCents: cost?.feesCents ?? 0,
          incomeGrossCents: earned?.gross ?? 0,
          incomeTaxCents: earned?.tax ?? 0,
        },
      ];
    })
    .sort((a, b) => b.valueCents - a.valueCents || a.securityId.localeCompare(b.securityId));

  const costsCents = summary.costs.terCents + fees.totalCents;
  return {
    asOf: today,
    from,
    to: today,
    valueCents: summary.valueCents,
    income: { dividend: byKind.dividend, interest: byKind.interest, grossCents },
    taxes,
    costs: {
      terCents: summary.costs.terCents,
      fees,
      totalCents: costsCents,
      costRateBp: summary.valueCents > 0 ? mulDivRound(costsCents, 10_000, summary.valueCents) : 0,
      targetBp: COST_RATE_TARGET_BP,
    },
    net: {
      grossCents,
      taxOnIncomeCents: taxes.onIncomeCents,
      costsCents,
      netCents: grossCents - taxes.onIncomeCents - costsCents,
    },
    latent: {
      rateBp: KEST_RATE_BP,
      totalCents: products.reduce((sum, p) => sum + (p.latentTaxCents ?? 0), 0),
      complete: products.every((p) => p.latentTaxCents !== null),
    },
    products,
  };
}

/** The same holding values, TER samples and booked tax calculation as the rolling report. */
function portfolioCostsInRange(db: Executor, from: string, to: string) {
  const valuation = valuationSeries(db, { from, to });
  const ends = lastTwelveMonthEnds(to).filter((day) => day >= from);
  const samples = monthEndValuesForCosts(valuation, ends);
  const securities = db
    .select({ id: security.id, terBp: security.terBp })
    .from(security)
    .where(isNull(security.deletedAt))
    .all();
  const traded = tradesUpTo(db, to).filter(
    (t) => t.date >= from && (t.taxCents !== 0 || t.kind === 'tax'),
  );
  const trades = tradesInEur(
    traded.map((t) => ({
      ...t,
      amountCents: t.kind === 'tax' ? t.amountCents : 0,
      feeCents: 0,
    })),
    ratesAsOf(db, to),
  );
  return {
    terCents: securities.reduce((sum, sec) => sum + terOf(samples.get(sec.id) ?? [], sec.terBp), 0),
    taxes: taxBreakdownInRange(trades, { from: addDays(from, -1), to }),
    valueCents: holdingValuesAsOf(db, to).reduce((sum, position) => sum + position.valueCents, 0),
  };
}

/** Calendar years measured against security values at each year's reporting cut-off. */
export function annualCostsReport(db: Executor, today: string) {
  const first =
    db
      .select({ date: account.openingDate })
      .from(account)
      .where(and(isNull(account.deletedAt), lte(account.openingDate, today)))
      .orderBy(asc(account.openingDate))
      .limit(1)
      .get()?.date ?? today;
  const years = [];
  for (let year = Number(today.slice(0, 4)); year >= Number(first.slice(0, 4)); year--) {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const from = first > yearStart ? first : yearStart;
    const to = today < yearEnd ? today : yearEnd;
    const bank = bankCostsReport(db, to, { from, to });
    const valuation = runWithValuationNotes((notes) => {
      try {
        const portfolio = withValuationRange(from, to, () => portfolioCostsInRange(db, from, to));
        return { portfolio, notes: namedNotes(db, notes()), unavailable: null };
      } catch (error) {
        if (error instanceof MissingFxRateError || error instanceof ExchangeRateUnavailableError)
          return { portfolio: null, notes: [], unavailable: 'Wechselkurs fehlt' };
        if (error instanceof PriceUnavailableError)
          return { portfolio: null, notes: [], unavailable: 'Wertpapierkurs fehlt' };
        throw error;
      }
    });
    const { portfolio } = valuation;
    const tradingFeeCents = bank.rows.find((row) => row.key === 'orders')?.cents ?? 0;
    const total =
      portfolio &&
      combinedCosts({
        bankCents: bank.totalCents,
        portfolioFeeCents: tradingFeeCents + bank.portfolioAccountFeeCents,
        terCents: portfolio.terCents,
        taxCents: portfolio.taxes.totalCents,
        valueCents: portfolio.valueCents,
      });
    years.push({
      year,
      from,
      to,
      partial: from !== yearStart || to !== yearEnd,
      total,
      valuationNotes: valuation.notes,
      portfolioUnavailable: valuation.unavailable,
      bankParts: bank.rows.map(({ key, name, cents }) => ({ key, name, cents })),
      incomplete: {
        modeledInterestMissingFxPeriods: bank.modeledInterestMissingFxPeriods,
        skippedForeignTrades: bank.skippedForeignTrades,
        skippedForeignBookings: bank.skippedForeignBookings,
      },
    });
  }
  return years;
}

export type AnnualCostYear = ReturnType<typeof annualCostsReport>[number];
