import {
  addMonths,
  allocationStatus,
  clusterRisk,
  documentedCostOf,
  documentedRealizedGain,
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
  type CostMethod,
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
import {
  cashSeries,
  holdingValuationExportAsOf,
  holdingValuesAsOf,
  portfolioFlows,
  valuationSeries,
} from './portfolio';
import { MissingFxRateError } from './errors';
import { targetsAsOf } from './securities';
import { investmentPreferences } from './investment-preferences';
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
  /** Cost basis of the units held, using the persisted average/FIFO preference. */
  costCents: number | null;
  /** Unrealised gain: value minus cost. */
  gainCents: number | null;
  /** False if this is only the subtotal of sales with a documented basis. */
  realizedGainComplete: boolean;
  realizedGainCents: number;
  /** Share of the portfolio in bp (all positions add up to 10 000). */
  shareBp: number;
  /** One line per account holding the security. */
  accounts: {
    accountId: string;
    institutionId: string | null;
    unitsE8: number;
    valueCents: number;
  }[];
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
  costMethod: CostMethod;
  period: Period;
  view: PortfolioView;
  valueCents: number;
  costCents: number | null;
  /** Unrealised gain (value - cost). */
  gainCents: number | null;
  realizedGainComplete: boolean;
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

type PositionSnapshot = {
  accountId: string;
  securityId: string;
  asOf: string;
  unitsE8: number;
  costBasisCents: number | null;
};

/**
 * A checkpoint that matches the source trade quantity and either supported documented basis is
 * redundant. Keep replaying the original lots so a snapshot that records average basis does not
 * erase FIFO lot composition. A missing basis is not a correction when both histories are known.
 * If replay cannot be established (including optional historical FX), keep the snapshot as anchor.
 */
function effectiveSnapshots(
  snapshots: PositionSnapshot[],
  trades: (ProductTrade & { accountId: string; securityId: string; currency: string })[],
  currency: string,
  rates: RateTable,
): PositionSnapshot[] {
  const ordered = [...snapshots].sort((a, b) => a.asOf.localeCompare(b.asOf));
  const effective: PositionSnapshot[] = [];
  let anchor: PositionSnapshot | undefined;
  for (const snapshot of ordered) {
    try {
      const intervalTrades = trades.filter(
        (t) => (!anchor || t.date > anchor.asOf) && t.date <= snapshot.asOf,
      );
      const eurTrades = tradesInEur(intervalTrades, rates);
      const opening = anchor
        ? {
            unitsE8: anchor.unitsE8,
            costBasisCents:
              anchor.costBasisCents === null
                ? null
                : centsInEur(anchor.costBasisCents, currency, anchor.asOf, rates),
          }
        : undefined;
      const average = documentedCostOf(eurTrades, opening, 'average');
      const fifo = documentedCostOf(eurTrades, opening, 'fifo');
      const knownAndAligned =
        average !== null &&
        fifo !== null &&
        average.unitsE8 === snapshot.unitsE8 &&
        fifo.unitsE8 === snapshot.unitsE8;
      let redundant = false;
      if (knownAndAligned) {
        if (snapshot.costBasisCents === null) redundant = true;
        else {
          const basis = centsInEur(snapshot.costBasisCents, currency, snapshot.asOf, rates);
          redundant = basis === average.costBasisCents || basis === fifo.costBasisCents;
        }
      }
      if (!redundant) {
        effective.push(snapshot);
        anchor = snapshot;
      }
    } catch (error) {
      if (!(error instanceof MissingFxRateError)) throw error;
      // FX is optional for deciding whether a snapshot is redundant. Its own basis will still be
      // converted if a later calculation actually needs this snapshot as its opening anchor.
      effective.push(snapshot);
      anchor = snapshot;
    }
  }
  return effective;
}

/** Cost basis of one position after ignoring only checkpoints proved redundant from source rows. */
function positionCost(
  snapshots: PositionSnapshot[],
  trades: (ProductTrade & { accountId: string; securityId: string; currency: string })[],
  accountId: string,
  securityId: string,
  currency: string,
  rates: RateTable,
  method: CostMethod,
) {
  const mine = trades.filter((t) => t.accountId === accountId && t.securityId === securityId);
  const snap = effectiveSnapshots(
    snapshots.filter((s) => s.accountId === accountId && s.securityId === securityId),
    mine,
    currency,
    rates,
  ).sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
  const intervalTrades = mine.filter((t) => !snap || t.date > snap.asOf);
  const eurTrades = tradesInEur(intervalTrades, rates);
  return documentedCostOf(
    eurTrades,
    snap
      ? {
          unitsE8: snap.unitsE8,
          costBasisCents:
            snap.costBasisCents === null
              ? null
              : centsInEur(snap.costBasisCents, currency, snap.asOf, rates),
        }
      : undefined,
    method,
  );
}

/**
 * Realised gains across snapshot intervals. Each snapshot replaces the remaining inventory and
 * its basis, while gains already recorded before it remain part of the lifetime total.
 */
function realizedByPosition(
  snapshots: PositionSnapshot[],
  trades: (ProductTrade & { accountId: string; securityId: string; currency: string })[],
  accountCurrency: ReadonlyMap<string, string>,
  liveSecurityIds: ReadonlySet<string>,
  rates: RateTable,
  method: CostMethod,
) {
  const pairs = new Map<string, { accountId: string; securityId: string }>();
  for (const row of [...snapshots, ...trades])
    if (liveSecurityIds.has(row.securityId))
      pairs.set(`${row.accountId}\0${row.securityId}`, {
        accountId: row.accountId,
        securityId: row.securityId,
      });
  const gains = new Map<string, { cents: number; complete: boolean }>();
  for (const { accountId, securityId } of pairs.values()) {
    const key = `${accountId}\0${securityId}`;
    const mine = trades
      .filter((t) => t.accountId === accountId && t.securityId === securityId)
      .sort((a, b) => a.date.localeCompare(b.date));
    const held = effectiveSnapshots(
      snapshots.filter((s) => s.accountId === accountId && s.securityId === securityId),
      mine,
      accountCurrency.get(accountId) ?? 'EUR',
      rates,
    );
    let total = 0;
    let complete = true;
    let opening:
      | { unitsE8: number; costBasisCents: number | null; currency: string; asOf: string }
      | undefined;
    let after: string | undefined;
    const intervals = [...held, null];
    for (const snapshot of intervals) {
      const until = snapshot?.asOf;
      const intervalTrades = mine.filter(
        (t) => (after === undefined || t.date > after) && (until === undefined || t.date <= until),
      );
      const hasSale = intervalTrades.some((t) => t.kind === 'sell');
      if (hasSale) {
        const costTrades = intervalTrades.filter((t) =>
          ['buy', 'sell', 'delivery_in', 'delivery_out', 'split'].includes(t.kind),
        );
        const eurTrades = tradesInEur(costTrades, rates);
        const eurOpening = opening
          ? {
              unitsE8: opening.unitsE8,
              costBasisCents:
                opening.costBasisCents === null
                  ? null
                  : centsInEur(opening.costBasisCents, opening.currency, opening.asOf, rates),
            }
          : undefined;
        const result = documentedRealizedGain(eurTrades, eurOpening, method);
        total += result.cents;
        complete &&= result.complete;
      }
      if (snapshot) {
        after = snapshot.asOf;
        opening = {
          unitsE8: snapshot.unitsE8,
          costBasisCents: snapshot.costBasisCents,
          currency: accountCurrency.get(accountId) ?? 'EUR',
          asOf: snapshot.asOf,
        };
      }
    }
    gains.set(key, { cents: total, complete });
  }
  return gains;
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
  const { costMethod } = investmentPreferences(db);
  const { securities, accountInstitution, accountCurrency } = load(db);
  const rates = ratesAsOf(db, asOf);
  const values = holdingValuesAsOf(db, asOf);
  const snapshots = db
    .select()
    .from(holding)
    .where(and(isNull(holding.deletedAt), lte(holding.asOf, asOf)))
    .all();
  const trades = tradesUpTo(db, asOf);
  const realized = realizedByPosition(
    snapshots,
    trades,
    accountCurrency,
    new Set(securities.keys()),
    rates,
    costMethod,
  );
  const bySecurity = new Map<string, PositionLine>();
  for (const h of values) {
    const sec = securities.get(h.securityId);
    if (!sec) continue;
    const currency = accountCurrency.get(h.accountId);
    if (currency === undefined) throw new Error(`Missing account currency for ${h.accountId}`);
    const cost = positionCost(
      snapshots,
      trades,
      h.accountId,
      h.securityId,
      currency,
      rates,
      costMethod,
    );
    const gain = cost ? gainOf(h.valueCents, cost) : null;
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
        realizedGainComplete: true,
        shareBp: 0,
        accounts: [],
      };
      bySecurity.set(h.securityId, line);
    }
    line.unitsE8 += h.unitsE8;
    line.valueCents += h.valueCents;
    line.costCents =
      line.costCents === null || cost === null ? null : line.costCents + cost.costBasisCents;
    line.gainCents =
      line.gainCents === null || gain === null ? null : line.gainCents + gain.unrealizedCents;
    const realizedResult = realized.get(`${h.accountId}\0${h.securityId}`);
    line.realizedGainCents += realizedResult?.cents ?? 0;
    line.realizedGainComplete &&= realizedResult?.complete ?? true;
    line.accounts.push({
      accountId: h.accountId,
      institutionId: accountInstitution.get(h.accountId) ?? null,
      unitsE8: h.unitsE8,
      valueCents: h.valueCents,
    });
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

/** Existing per-account cost model used by the CSV export; no cost or FX formula is duplicated. */
export function positionCostDetailsAsOf(
  db: Executor,
  asOf: string,
  valuation = holdingValuationExportAsOf(db, asOf),
): Array<{
  accountId: string;
  securityId: string;
  costCents: number | null;
  gainCents: number | null;
  basisStatus: 'known' | 'undocumented' | 'missing_fx';
  missingFxCurrency?: string;
}> {
  const { costMethod } = investmentPreferences(db);
  const { accountCurrency } = load(db);
  const rates = ratesAsOf(db, asOf);
  const snapshots = db
    .select()
    .from(holding)
    .where(and(isNull(holding.deletedAt), lte(holding.asOf, asOf)))
    .all();
  const trades = tradesUpTo(db, asOf);
  const valuedByKey = new Map(valuation.values.map((v) => [`${v.accountId}\0${v.securityId}`, v]));
  const pricedSecurities = new Set(
    db
      .select({ securityId: price.securityId })
      .from(price)
      .where(lte(price.date, asOf))
      .all()
      .map((p) => p.securityId),
  );
  const keys = [
    ...valuation.values.map((v) => ({ accountId: v.accountId, securityId: v.securityId })),
    ...valuation.missingFxPositions.map((v) => ({
      accountId: v.accountId,
      securityId: v.securityId,
    })),
  ];
  return keys.map(({ accountId, securityId }) => {
    try {
      const currency = accountCurrency.get(accountId);
      if (!currency) throw new Error(`Missing account currency for ${accountId}`);
      const cost = positionCost(
        snapshots,
        trades,
        accountId,
        securityId,
        currency,
        rates,
        costMethod,
      );
      if (!cost) {
        return {
          accountId,
          securityId,
          costCents: null,
          gainCents: null,
          basisStatus: 'undocumented',
        };
      }
      const value = valuedByKey.get(`${accountId}\0${securityId}`);
      const gain =
        value && pricedSecurities.has(securityId) ? gainOf(value.valueCents, cost) : null;
      return {
        accountId,
        securityId,
        costCents: cost.costBasisCents,
        gainCents: gain?.unrealizedCents ?? null,
        basisStatus: 'known',
      };
    } catch (error) {
      if (!(error instanceof MissingFxRateError)) throw error;
      return {
        accountId,
        securityId,
        costCents: null,
        gainCents: null,
        basisStatus: 'missing_fx',
        missingFxCurrency: error.currency,
      };
    }
  });
}

/** The positions as the wealth domain sees them (kind and class, never the name). */
export const toWealthPositions = (lines: ReadonlyArray<PositionLine>): WealthPosition[] =>
  lines.flatMap((line) =>
    line.accounts.map((position) => ({
      id: `${line.securityId}:${position.accountId}`,
      securityId: line.securityId,
      kind: line.kind,
      assetClass: line.assetClassId,
      valueCents: position.valueCents,
      platform: position.institutionId,
    })),
  );

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
  const { costMethod } = investmentPreferences(db);
  const { today } = options;
  const period = options.period ?? '1J';
  const view = options.view ?? 'securities';
  const loaded = load(db);
  const lines = positionLines(db, today);
  const risk = riskOf(db, today, lines);
  const valueCents = lines.reduce((a, l) => a + l.valueCents, 0);
  const costCents = lines.some((l) => l.costCents === null)
    ? null
    : lines.reduce((sum, line) => sum + (line.costCents ?? 0), 0);
  const rates = ratesAsOf(db, today);
  const realizedSnapshots = db
    .select()
    .from(holding)
    .where(and(isNull(holding.deletedAt), lte(holding.asOf, today)))
    .all();
  const realizedTrades = tradesUpTo(db, today);
  const realizedResults = [
    ...realizedByPosition(
      realizedSnapshots,
      realizedTrades,
      loaded.accountCurrency,
      new Set(loaded.securities.keys()),
      rates,
      costMethod,
    ).values(),
  ];
  const realizedGainCents = realizedResults.reduce((sum, result) => sum + result.cents, 0);
  const realizedGainComplete = realizedResults.every((result) => result.complete);

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
  const platformValuesByInstitution = new Map<string | null, number>();
  for (const line of lines) {
    for (const position of line.accounts) {
      platformValuesByInstitution.set(
        position.institutionId,
        (platformValuesByInstitution.get(position.institutionId) ?? 0) + position.valueCents,
      );
    }
  }
  const platformEntries = [...platformValuesByInstitution];
  const platformIds = platformEntries.map(([id]) => id);
  const platformValues = platformEntries.map(([, value]) => value);
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
    costMethod,
    period,
    view,
    valueCents,
    costCents,
    gainCents: costCents === null ? null : valueCents - costCents,
    realizedGainCents,
    realizedGainComplete,
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
