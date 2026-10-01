import {
  addMonths,
  allocationStatus,
  clusterRisk,
  costOf,
  ExchangeRateUnavailableError,
  fxOn,
  fundCosts,
  gainOf,
  incomeLast12Months,
  lastDayOfMonth,
  monthOf,
  periodPerformance,
  rebalancingProposals,
  shareBps,
  speculativeShare,
  sumSeries,
  toEurCents,
  type RateTable,
  type AllocationStatus,
  type BenchmarkLevel,
  type ClusterRisk,
  type IncomeSummary,
  type Period,
  type ProductTrade,
  type RebalanceProposal,
  type SecurityKind,
  type SpeculativeShare,
  type Valuation,
  type WealthPosition,
  type WindowPerformance,
} from '@budget/domain';
import { and, asc, eq, isNull, lte } from 'drizzle-orm';
import {
  account,
  assetClass,
  fxRate,
  holding,
  institution,
  price,
  security,
  trade,
} from '../schema';
import { cashSeries, holdingValuesAsOf, portfolioFlows, valuationSeries } from './portfolio';
import { MissingFxRateError } from './errors';
import { targetsAsOf } from './securities';
import type { Executor } from './types';

/** How the portfolio is measured: PP's "securities only" or "depot incl. reference account". */
export type PortfolioView = 'securities' | 'depot';

export interface PortfolioOptions {
  /** The day the figures are for (Vienna "today"). */
  today: string;
  period?: Period;
  view?: PortfolioView;
  /** Security whose price series is the benchmark; default the largest position. */
  benchmarkSecurityId?: string;
  /** Depot view: accounts counted as reference (cash) accounts; default the investment accounts. */
  referenceAccounts?: ReadonlyArray<string>;
}

export interface PositionLine {
  securityId: string;
  name: string;
  kind: SecurityKind;
  assetClassId: string | null;
  institutionId: string | null;
  unitsE8: number;
  valueCents: number;
  /** Cost basis (FIFO) of the units held. */
  costCents: number;
  /** Unrealised gain: value minus cost. */
  gainCents: number;
  realizedGainCents: number;
  /** Share of the portfolio in bp (all positions add up to 10 000). */
  shareBp: number;
  /** One line per account holding the security. */
  accounts: { accountId: string; unitsE8: number; valueCents: number }[];
}

export interface ClassGroup {
  assetClassId: string | null;
  name: string;
  valueCents: number;
  shareBp: number;
  targetBp: number | null;
  bandBp: number | null;
  breach: boolean;
  positions: PositionLine[];
}

export interface PlatformShare {
  institutionId: string | null;
  name: string;
  valueCents: number;
  shareBp: number;
}

export interface PortfolioSummary {
  asOf: string;
  period: Period;
  view: PortfolioView;
  valueCents: number;
  costCents: number;
  /** Unrealised gain (value - cost). */
  gainCents: number;
  realizedGainCents: number;
  /** `null` while the portfolio has no history (no holding or trade yet). */
  performance: WindowPerformance | null;
  benchmark: { securityId: string; name: string } | null;
  /** TER on month ends plus the fees of 12 months, over the current value. */
  costs: { terCents: number; feesCents: number; totalCents: number; costRateBp: number };
  /** Dividends and interest of the 12 months up to `asOf`. */
  income: IncomeSummary;
  allocation: AllocationStatus;
  cluster: ClusterRisk;
  speculative: SpeculativeShare;
  proposals: RebalanceProposal[];
  classes: ClassGroup[];
  positions: PositionLine[];
  platforms: PlatformShare[];
  names: {
    assetClasses: Record<string, string>;
    securities: Record<string, string>;
    institutions: Record<string, string>;
  };
}

const NO_CLASS = '';

interface Loaded {
  securities: Map<string, typeof security.$inferSelect>;
  accountInstitution: Map<string, string | null>;
  accountCurrency: Map<string, string>;
  institutions: Map<string, string>;
  classNames: Map<string, string>;
}

function load(db: Executor): Loaded {
  const securities = new Map(
    db
      .select()
      .from(security)
      .where(isNull(security.deletedAt))
      .all()
      .map((s) => [s.id, s]),
  );
  const accounts = db
    .select({ id: account.id, institutionId: account.institutionId, currency: account.currency })
    .from(account)
    .all();
  const accountInstitution = new Map(accounts.map((a) => [a.id, a.institutionId]));
  const accountCurrency = new Map(accounts.map((a) => [a.id, a.currency]));
  const institutions = new Map(
    db
      .select({ id: institution.id, name: institution.name })
      .from(institution)
      .all()
      .map((i) => [i.id, i.name]),
  );
  const classNames = new Map(
    db
      .select({ id: assetClass.id, name: assetClass.name })
      .from(assetClass)
      .where(isNull(assetClass.deletedAt))
      .all()
      .map((c) => [c.id, c.name]),
  );
  return { securities, accountInstitution, accountCurrency, institutions, classNames };
}

function ratesAsOf(db: Executor, asOf: string): RateTable {
  const table = new Map<string, { date: string; rateMicro: number }[]>();
  const rows = db.select().from(fxRate).where(lte(fxRate.date, asOf)).all();
  for (const row of rows.sort((a, b) => a.date.localeCompare(b.date))) {
    const list = table.get(row.currency) ?? [];
    list.push({ date: row.date, rateMicro: row.rateMicro });
    table.set(row.currency, list);
  }
  return table;
}

function centsInEur(cents: number, currency: string, day: string, rates: RateTable): number {
  if (cents === 0 || currency === 'EUR') return cents;
  try {
    return toEurCents(cents, fxOn(rates, currency, day));
  } catch (error) {
    if (error instanceof ExchangeRateUnavailableError)
      throw new MissingFxRateError(error.currency, error.asOf);
    throw error;
  }
}

function tradesInEur<T extends ProductTrade & { currency: string }>(
  trades: readonly T[],
  rates: RateTable,
): T[] {
  return trades.map((t) => ({
    ...t,
    amountCents: centsInEur(t.amountCents, t.currency, t.date, rates),
    feeCents: centsInEur(t.feeCents, t.currency, t.date, rates),
    taxCents: centsInEur(t.taxCents, t.currency, t.date, rates),
    currency: 'EUR',
  }));
}

/**
 * Cost basis and realised gain of one position (account x security): the latest holding snapshot
 * on or before `asOf` as opening, then the trades after its day (the rule that gives the units).
 */
function positionCost(
  snapshots: {
    accountId: string;
    securityId: string;
    asOf: string;
    unitsE8: number;
    costBasisCents: number | null;
  }[],
  trades: (ProductTrade & { accountId: string; securityId: string; currency: string })[],
  accountId: string,
  securityId: string,
  currency: string,
  rates: RateTable,
) {
  const snap = snapshots
    .filter((s) => s.accountId === accountId && s.securityId === securityId)
    .sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
  const mine = trades.filter(
    (t) =>
      t.accountId === accountId && t.securityId === securityId && (!snap || t.date > snap.asOf),
  );
  const eurTrades = tradesInEur(mine, rates);
  return costOf(
    eurTrades,
    snap
      ? {
          unitsE8: snap.unitsE8,
          costBasisCents: centsInEur(snap.costBasisCents ?? 0, currency, snap.asOf, rates),
        }
      : undefined,
  );
}

/** Live trades up to `to` as series trades (with account and security). */
function tradesUpTo(db: Executor, to: string) {
  return db
    .select({
      accountId: trade.accountId,
      securityId: trade.securityId,
      date: trade.date,
      kind: trade.kind,
      unitsE8: trade.unitsE8,
      amountCents: trade.amountCents,
      feeCents: trade.feeCents,
      taxCents: trade.taxCents,
      currency: account.currency,
    })
    .from(trade)
    .innerJoin(account, eq(account.id, trade.accountId))
    .where(and(isNull(trade.deletedAt), lte(trade.date, to)))
    .orderBy(asc(trade.date), asc(trade.id))
    .all();
}

/**
 * Positions of the portfolio on `asOf`, one per security (units of several accounts add up), with
 * value, cost basis, gain and share. The one place that turns holdings into the figures every
 * Vermögen page shows.
 */
export function positionLines(db: Executor, asOf: string): PositionLine[] {
  const { securities, accountInstitution, accountCurrency } = load(db);
  const rates = ratesAsOf(db, asOf);
  const values = holdingValuesAsOf(db, asOf);
  const snapshots = db
    .select()
    .from(holding)
    .where(and(isNull(holding.deletedAt), lte(holding.asOf, asOf)))
    .all();
  const trades = tradesUpTo(db, asOf);
  const bySecurity = new Map<string, PositionLine>();
  for (const h of values) {
    const sec = securities.get(h.securityId);
    if (!sec) continue;
    const currency = accountCurrency.get(h.accountId);
    if (currency === undefined) throw new Error(`Missing account currency for ${h.accountId}`);
    const cost = positionCost(snapshots, trades, h.accountId, h.securityId, currency, rates);
    const gain = gainOf(h.valueCents, cost);
    let line = bySecurity.get(h.securityId);
    if (!line) {
      line = {
        securityId: sec.id,
        name: sec.name,
        kind: sec.kind,
        assetClassId: sec.assetClassId,
        institutionId: sec.institutionId ?? accountInstitution.get(h.accountId) ?? null,
        unitsE8: 0,
        valueCents: 0,
        costCents: 0,
        gainCents: 0,
        realizedGainCents: 0,
        shareBp: 0,
        accounts: [],
      };
      bySecurity.set(h.securityId, line);
    }
    line.unitsE8 += h.unitsE8;
    line.valueCents += h.valueCents;
    line.costCents += cost.costBasisCents;
    line.gainCents += gain.unrealizedCents;
    line.realizedGainCents += cost.realizedGainCents;
    line.accounts.push({ accountId: h.accountId, unitsE8: h.unitsE8, valueCents: h.valueCents });
  }
  const lines = [...bySecurity.values()].sort(
    (a, b) => b.valueCents - a.valueCents || a.securityId.localeCompare(b.securityId),
  );
  const total = lines.reduce((a, l) => a + l.valueCents, 0);
  shareBps(
    lines.map((l) => l.valueCents),
    total,
  ).forEach((bp, i) => ((lines[i] as PositionLine).shareBp = bp));
  return lines;
}

/** The positions as the wealth domain sees them (kind and class, never the name). */
export const toWealthPositions = (lines: ReadonlyArray<PositionLine>): WealthPosition[] =>
  lines.map((l) => ({
    id: l.securityId,
    securityId: l.securityId,
    kind: l.kind,
    assetClass: l.assetClassId,
    valueCents: l.valueCents,
    platform: l.institutionId,
  }));

/** R13 inputs: the Soll-Allocation valid on `asOf`. */
export function classTargets(db: Executor, asOf: string) {
  return targetsAsOf(db, asOf).map((t) => ({
    assetClass: t.assetClassId,
    targetBp: t.targetShareBp,
    bandBp: t.bandBp,
  }));
}

/** Allocation, cluster risk, R15 and the rebalancing rows of the positions on `asOf`. */
export function riskOf(db: Executor, asOf: string, lines: ReadonlyArray<PositionLine>) {
  const positions = toWealthPositions(lines);
  const allocation = allocationStatus(positions, classTargets(db, asOf));
  const cluster = clusterRisk(positions);
  const speculative = speculativeShare(positions);
  return {
    allocation,
    cluster,
    speculative,
    proposals: rebalancingProposals({ allocation, cluster, speculative }),
  };
}

function firstDay(db: Executor, today: string): string | null {
  const dates = [
    db
      .select({ d: holding.asOf })
      .from(holding)
      .where(isNull(holding.deletedAt))
      .orderBy(asc(holding.asOf))
      .limit(1)
      .get()?.d,
    db
      .select({ d: trade.date })
      .from(trade)
      .where(isNull(trade.deletedAt))
      .orderBy(asc(trade.date))
      .limit(1)
      .get()?.d,
  ].filter((d): d is string => d !== undefined && d <= today);
  return dates.sort()[0] ?? null;
}

/** Month-end days of the 12 months up to `today` (the last one is `today` itself). */
function lastTwelveMonthEnds(today: string): string[] {
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const end = lastDayOfMonth(addMonths(monthOf(today), -i));
    out.push(end < today ? end : today);
  }
  return out;
}

/**
 * The portfolio read model (`GET /api/portfolio`): value, cost, gain, returns of a period,
 * benchmark, costs and income of 12 months, allocation status with rebalancing rows, positions
 * grouped by asset class and platform shares. Every figure comes from the invest and wealth
 * domain (P5.2, P5.3); nothing is computed twice.
 */
export function portfolioSummary(db: Executor, options: PortfolioOptions): PortfolioSummary {
  const { today } = options;
  const period = options.period ?? '1J';
  const view = options.view ?? 'securities';
  const loaded = load(db);
  const lines = positionLines(db, today);
  const risk = riskOf(db, today, lines);
  const valueCents = lines.reduce((a, l) => a + l.valueCents, 0);
  const costCents = lines.reduce((a, l) => a + l.costCents, 0);
  const realizedGainCents = lines.reduce((a, l) => a + l.realizedGainCents, 0);

  const investmentAccounts = db
    .select({ id: account.id })
    .from(account)
    .where(and(isNull(account.deletedAt), eq(account.role, 'investment')))
    .all()
    .map((a) => a.id);

  // ---- performance of the period ----
  const start = firstDay(db, today);
  let performance: WindowPerformance | null = null;
  let benchmark: PortfolioSummary['benchmark'] = null;
  const monthEndValues = new Map<string, number[]>();
  if (start !== null) {
    const series = valuationSeries(db, { from: start, to: today });
    const days = series.days;
    let total = series.totalCents;
    if (view === 'depot') {
      const reference = options.referenceAccounts ?? investmentAccounts;
      const cash = cashSeries(db, days, reference);
      total = sumSeries(series.totalCents, ...cash.values());
    }
    const valuations: Valuation[] = days.map((date, i) => ({
      date,
      valueCents: total[i] as number,
    }));
    const flows = portfolioFlows(db, {
      from: start,
      to: today,
      view,
      referenceAccounts: options.referenceAccounts ?? investmentAccounts,
      accounts: investmentAccounts,
    });

    const benchmarkId = options.benchmarkSecurityId ?? lines[0]?.securityId;
    let levels: BenchmarkLevel[] | undefined;
    const benchmarkSecurity = benchmarkId ? loaded.securities.get(benchmarkId) : undefined;
    if (benchmarkSecurity) {
      levels = db
        .select({ date: price.date, level: price.priceMicro })
        .from(price)
        .where(and(eq(price.securityId, benchmarkSecurity.id), lte(price.date, today)))
        .orderBy(asc(price.date))
        .all();
      if (levels.length > 0)
        benchmark = { securityId: benchmarkSecurity.id, name: benchmarkSecurity.name };
      else levels = undefined;
    }
    performance = periodPerformance(
      { series: valuations, flows, ...(levels ? { benchmark: levels } : {}) },
      period,
      today,
    );

    // Month-end values per security for the TER (from the same series).
    const ends = lastTwelveMonthEnds(today);
    const index = new Map(days.map((d, i) => [d, i]));
    for (const p of series.positions) {
      const list = monthEndValues.get(p.securityId) ?? ends.map(() => 0);
      ends.forEach((day, k) => {
        const i = index.get(day);
        if (i !== undefined) list[k] = (list[k] as number) + (p.valueCents[i] as number);
      });
      monthEndValues.set(p.securityId, list);
    }
  }

  // ---- costs and income of 12 months ----
  const allTrades = tradesInEur(tradesUpTo(db, today), ratesAsOf(db, today));
  let terCents = 0;
  let feesCents = 0;
  for (const sec of loaded.securities.values()) {
    const mine = allTrades.filter((t) => t.securityId === sec.id);
    const line = lines.find((l) => l.securityId === sec.id);
    const costs = fundCosts({
      monthEndValuesCents: monthEndValues.get(sec.id) ?? [],
      terBp: sec.terBp,
      trades: mine,
      today,
      valueCents: line?.valueCents ?? 0,
    });
    terCents += costs.terCents;
    feesCents += costs.feesCents;
  }
  const totalCostCents = terCents + feesCents;
  const costs = {
    terCents,
    feesCents,
    totalCents: totalCostCents,
    costRateBp: valueCents > 0 ? Math.round((totalCostCents * 10_000) / valueCents) : 0,
  };
  const income = incomeLast12Months(allTrades, today);

  // ---- grouped by asset class and by platform ----
  const classOf = (l: PositionLine) => l.assetClassId ?? NO_CLASS;
  const classes: ClassGroup[] = risk.allocation.rows.map((row) => ({
    assetClassId: row.assetClass === NO_CLASS ? null : row.assetClass,
    name: loaded.classNames.get(row.assetClass) ?? 'Ohne Anlageklasse',
    valueCents: row.valueCents,
    shareBp: row.shareBp,
    targetBp: row.targetBp,
    bandBp: row.bandBp,
    breach: row.breach,
    positions: lines.filter((l) => classOf(l) === row.assetClass),
  }));
  const platformIds = [...new Set(lines.map((l) => l.institutionId))];
  const platformValues = platformIds.map((id) =>
    lines.filter((l) => l.institutionId === id).reduce((a, l) => a + l.valueCents, 0),
  );
  const platformShares = shareBps(platformValues, valueCents);
  const platforms: PlatformShare[] = platformIds
    .map((id, i) => ({
      institutionId: id,
      name: id ? (loaded.institutions.get(id) ?? id) : 'Ohne Plattform',
      valueCents: platformValues[i] as number,
      shareBp: platformShares[i] as number,
    }))
    .sort((a, b) => b.valueCents - a.valueCents);

  return {
    asOf: today,
    period,
    view,
    valueCents,
    costCents,
    gainCents: valueCents - costCents,
    realizedGainCents,
    performance,
    benchmark,
    costs,
    income,
    ...risk,
    classes,
    positions: lines,
    platforms,
    names: {
      assetClasses: Object.fromEntries(loaded.classNames),
      securities: Object.fromEntries([...loaded.securities].map(([id, s]) => [id, s.name])),
      institutions: Object.fromEntries(loaded.institutions),
    },
  };
}
