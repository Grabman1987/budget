import {
  account,
  booking,
  bookingSplit,
  cashSeries,
  holdingValuationExportAsOf,
  INCOME_TYPES,
  investmentPreferences,
  netWorthValuationAsOf,
  portfolioFlows,
  positionCostDetailsAsOf,
  security,
  trade,
  valuationSeries,
  type Executor,
} from '@budget/db';
import {
  addDays,
  costOf,
  periodWindow,
  PriceUnavailableError,
  sumSeries,
  windowPerformance,
  type CashFlow,
  type CostMethod,
  type Period,
  type ProductTrade,
  type Valuation,
  type WindowPerformance,
} from '@budget/domain';
import {
  ppCash,
  ppCashFlowByYear,
  ppDepotSeries,
  ppPositionsAsOf,
  type AccountTarget,
  type PpModel,
} from '@budget/import-pp';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { PpIdMap, Prepared } from './pp-commit';

/**
 * The Gate 3 report as data (SPEC §11: holdings and returns equal Portfolio Performance): per
 * depot and security units, cost and value on chosen days, PP against the app; the cash flows PP
 * and the app (YNAB transfers) saw; TTWROR and XIRR per period over identical windows, the app
 * against PP recomputed from the file with the same domain functions and, where the owner entered
 * them, against PP's own figures. Differences are listed, never hidden. Reference view: depot
 * including its reference account (cash). Nothing here is written.
 */

export const PERIODS: readonly Period[] = ['1M', '3M', 'YTD', '1J', '3J', 'Alles'];

/** PP's own figures for a depot and period, typed in by the owner (percent, e.g. 12.34). */
export interface ReferenceValues {
  [account: string]: { [period: string]: { ttwrorPct?: number; irrPct?: number } };
}
/** Tolerance of the returns comparison in percentage points (SPEC / prompt: 0,01 Pp). */
export const RETURN_TOLERANCE_PP = 0.01;

export interface AccountLine {
  account: string;
  day: string;
  appCashCents: number | null;
  ppCashCents: number;
  appHoldingsCents: number | null;
  ppHoldingsCents: number | null;
  appValueCents: number | null;
  ppValueCents: number | null;
  /** App minus PP; `null` when a side is unavailable (a held position without a quote). */
  diffCents: number | null;
  appMissingQuotes: number;
  ppMissingQuotes: number;
  /** The opening balance that would make the app's value equal PP's on this day. */
  suggestedOpeningCents: number | null;
}

export interface PositionLine {
  account: string;
  day: string;
  security: string;
  isin: string | null;
  appUnitsE8: number;
  ppUnitsE8: number;
  unitsDiffE8: number;
  appValueCents: number | null;
  ppValueCents: number | null;
  valueDiffCents: number | null;
  appCostCents: number | null;
  /** PP's cost basis with the method the app uses, and with FIFO (PP's default). */
  ppCostCents: number;
  ppCostFifoCents: number;
  costMethod: CostMethod;
}

export interface CashFlowLine {
  account: string;
  year: string;
  pp: {
    deposits: number;
    removals: number;
    transfersIn: number;
    transfersOut: number;
    interest: number;
    dividends: number;
    fees: number;
    taxes: number;
    /** Deposits - removals + transfers in - transfers out: money crossing the depot boundary. */
    netCents: number;
  };
  app: {
    transfersInCents: number;
    transfersOutCents: number;
    plainInCents: number;
    plainOutCents: number;
    /** Interest, fees, taxes written from PP (Kapitalerträge bookings). */
    capitalCents: number;
    tradeSettlementCents: number;
    netCents: number;
  };
  /** App minus PP net contribution of the year. */
  diffCents: number;
}

export interface PeriodFigures {
  period: string;
  from: string;
  to: string;
  startValueCents: number;
  endValueCents: number;
  contributionsCents: number;
  gainCents: number;
  /** Fractions (0,1 = 10 %); `null` when not computable. */
  ttwror: number | null;
  xirr: number | null;
}
export interface PeriodComparison {
  period: string;
  app: PeriodFigures | null;
  /** App with only boundary transfers as flows (the domain's depot view; deliveries are gains). */
  appBoundaryOnly: PeriodFigures | null;
  pp: PeriodFigures | null;
  /** Percentage points, app minus PP replay. */
  ttwrorDiffPp: number | null;
  xirrDiffPp: number | null;
  reference: { ttwrorPct?: number; irrPct?: number } | null;
  ttwrorVsReferencePp: number | null;
  irrVsReferencePp: number | null;
}
export interface DepotPerformance {
  account: string;
  from: string;
  to: string;
  /** Why the series is unavailable. */
  unavailable: string | null;
  /**
   * Securities held without any quote on some day: the app cannot value them (SPEC §10), so both
   * the app and the PP replay count them as 0 in these figures; they are listed, never hidden.
   */
  excludedUnpriced: { security: string; firstDay: string }[];
  periods: PeriodComparison[];
}

export interface Gate3Report {
  asOf: string;
  costMethod: CostMethod;
  days: string[];
  counts: {
    ppSecurities: number;
    ppPrices: number;
    ppTrades: number;
    appTrades: number;
    appSecurities: number;
  };
  accounts: AccountLine[];
  positions: PositionLine[];
  cashFlows: CashFlowLine[];
  performance: DepotPerformance[];
  differences: {
    accountValues: number;
    positionUnits: number;
    positionValues: number;
    positionCosts: number;
    missingQuotes: number;
    cashFlowYears: number;
    returnsOverTolerance: number;
  };
}

function openingOf(db: Executor, accountId: string): number {
  return (
    db
      .select({ cents: account.openingBalanceCents })
      .from(account)
      .where(eq(account.id, accountId))
      .get()?.cents ?? 0
  );
}

const num = (v: number | null): number | null => (v === null || !Number.isFinite(v) ? null : v);

function figures(period: string, w: WindowPerformance): PeriodFigures {
  return {
    period,
    from: w.from,
    to: w.to,
    startValueCents: w.startValueCents,
    endValueCents: w.endValueCents,
    contributionsCents: w.contributionsCents,
    gainCents: w.gainCents,
    ttwror: num(w.ttwror),
    xirr: num(w.xirr),
  };
}

function window(
  valuations: Valuation[],
  flows: CashFlow[],
  period: Period,
  to: string,
  from: string,
): PeriodFigures | null {
  try {
    const w = periodWindow(period, to, from);
    return figures(period, windowPerformance({ series: valuations, flows }, w));
  } catch {
    return null;
  }
}

/** Default checkpoint days: today, last month end, the last two year ends. */
export function defaultDays(today: string): string[] {
  const year = Number(today.slice(0, 4));
  const monthEnd = addDays(`${today.slice(0, 7)}-01`, -1);
  return [...new Set([today, monthEnd, `${year - 1}-12-31`, `${year - 2}-12-31`])].sort();
}

export interface Gate3Input {
  model: PpModel;
  prep: Prepared;
  ids: PpIdMap;
  today: string;
  days?: string[];
  reference?: ReferenceValues;
}

export function gate3Report(db: Executor, input: Gate3Input): Gate3Report {
  const { model, prep, ids, today } = input;
  const days = (input.days ?? defaultDays(today)).filter((d) => d <= today);
  const { costMethod } = investmentPreferences(db);
  const skipped = new Set(prep.securities.filter((s) => s.action === 'skip').map((s) => s.ppUuid));
  const planOf = new Map(prep.securities.map((s) => [s.ppUuid, s]));
  const ppOfApp = new Map<string, string>();
  for (const [pp, appId] of Object.entries(ids.securities)) ppOfApp.set(appId, pp);
  const appSecurities = new Map(
    db
      .select({ id: security.id, name: security.name, isin: security.isin })
      .from(security)
      .all()
      .map((s) => [s.id, s]),
  );
  const targets = prep.resolved.targets;
  const targetIds = new Set(targets.map((t) => t.accountId));
  const nameOf = new Map(targets.map((t) => [t.accountId, t.name]));

  const accountLines: AccountLine[] = [];
  const positionLines: PositionLine[] = [];
  const differences = {
    accountValues: 0,
    positionUnits: 0,
    positionValues: 0,
    positionCosts: 0,
    missingQuotes: 0,
    cashFlowYears: 0,
    returnsOverTolerance: 0,
  };

  for (const day of days) {
    const nw = netWorthValuationAsOf(db, day);
    const app = holdingValuationExportAsOf(db, day);
    const costs = new Map(
      positionCostDetailsAsOf(db, day, app).map((c) => [`${c.accountId}\0${c.securityId}`, c]),
    );
    const pp = ppPositionsAsOf(prep.plan, day, skipped);

    for (const t of targets) {
      const appValue = nw.byAccount[t.accountId] ?? null;
      const appHoldings = nw.holdingsByAccount[t.accountId] ?? 0;
      const ppPos = pp.filter((p) => p.accountId === t.accountId);
      const ppMissing = ppPos.filter((p) => p.valueCents === null).length;
      const ppHoldings = ppMissing > 0 ? null : ppPos.reduce((a, p) => a + (p.valueCents ?? 0), 0);
      const ppCashCents = ppCash(model, t.ppAccountUuids, day);
      const appMissing = app.missingPricePositions.filter((m) => m.accountId === t.accountId).length;
      const holdingsKnown = nw.holdingsByAccount[t.accountId] !== null;
      const line: AccountLine = {
        account: t.name,
        day,
        appCashCents:
          appValue !== null && holdingsKnown ? appValue - (appHoldings as number) : null,
        ppCashCents,
        appHoldingsCents: holdingsKnown ? (appHoldings as number) : null,
        ppHoldingsCents: ppHoldings,
        appValueCents: appValue,
        ppValueCents: ppHoldings === null ? null : ppHoldings + ppCashCents,
        diffCents: null,
        appMissingQuotes: appMissing,
        ppMissingQuotes: ppMissing,
        suggestedOpeningCents: null,
      };
      if (line.appValueCents !== null && line.ppValueCents !== null) {
        line.diffCents = line.appValueCents - line.ppValueCents;
        line.suggestedOpeningCents = openingOf(db, t.accountId) - line.diffCents;
        if (line.diffCents !== 0) differences.accountValues += 1;
      }
      if (appMissing > 0 || ppMissing > 0) differences.missingQuotes += appMissing + ppMissing;
      accountLines.push(line);
    }

    // Positions: every (account, security) either side holds.
    const keys = new Map<string, { accountId: string; appSecurityId: string }>();
    for (const v of app.values)
      if (targetIds.has(v.accountId))
        keys.set(`${v.accountId}\0${v.securityId}`, {
          accountId: v.accountId,
          appSecurityId: v.securityId,
        });
    for (const m of app.missingPricePositions)
      if (targetIds.has(m.accountId))
        keys.set(`${m.accountId}\0${m.securityId}`, {
          accountId: m.accountId,
          appSecurityId: m.securityId,
        });
    for (const p of pp) {
      const appId = ids.securities[p.securityPpUuid];
      if (appId !== undefined)
        keys.set(`${p.accountId}\0${appId}`, { accountId: p.accountId, appSecurityId: appId });
    }
    for (const { accountId, appSecurityId } of keys.values()) {
      const ppUuid = ppOfApp.get(appSecurityId);
      const appValue = app.values.find(
        (v) => v.accountId === accountId && v.securityId === appSecurityId,
      );
      const appMissing = app.missingPricePositions.find(
        (m) => m.accountId === accountId && m.securityId === appSecurityId,
      );
      const ppPos = pp.find((p) => p.accountId === accountId && p.securityPpUuid === ppUuid);
      const appUnits = appValue?.unitsE8 ?? appMissing?.unitsE8 ?? 0;
      const ppUnits = ppPos?.unitsE8 ?? 0;
      const trades = prep.trades
        .filter((t) => t.accountId === accountId && t.securityPpUuid === ppUuid && t.date <= day)
        .map(
          (t): ProductTrade => ({
            date: t.date,
            kind: t.kind,
            unitsE8: t.unitsE8,
            amountCents: t.amountCents,
            feeCents: t.feeCents,
            taxCents: t.taxCents,
          }),
        );
      const cost = costs.get(`${accountId}\0${appSecurityId}`);
      const line: PositionLine = {
        account: nameOf.get(accountId) ?? accountId,
        day,
        security: appSecurities.get(appSecurityId)?.name ?? appSecurityId,
        isin: appSecurities.get(appSecurityId)?.isin ?? null,
        appUnitsE8: appUnits,
        ppUnitsE8: ppUnits,
        unitsDiffE8: appUnits - ppUnits,
        appValueCents: appValue?.valueCents ?? null,
        ppValueCents: ppPos?.valueCents ?? null,
        valueDiffCents: null,
        appCostCents: cost?.costCents ?? null,
        ppCostCents: costOf(trades, undefined, costMethod).costBasisCents,
        ppCostFifoCents: costOf(trades, undefined, 'fifo').costBasisCents,
        costMethod,
      };
      if (line.appValueCents !== null && line.ppValueCents !== null)
        line.valueDiffCents = line.appValueCents - line.ppValueCents;
      if (line.unitsDiffE8 !== 0) differences.positionUnits += 1;
      if (line.valueDiffCents !== null && line.valueDiffCents !== 0) differences.positionValues += 1;
      if (line.appCostCents !== null && line.appCostCents !== line.ppCostCents)
        differences.positionCosts += 1;
      positionLines.push(line);
    }
  }

  const cashFlows = cashFlowLines(db, model, targets, differences);
  const performance = targets.map((t) =>
    depotPerformance(db, model, prep, t, today, skipped, ids, input.reference, differences),
  );

  const appTrades = db
    .select({ id: trade.id })
    .from(trade)
    .where(isNull(trade.deletedAt))
    .all().length;
  return {
    asOf: today,
    costMethod,
    days,
    counts: {
      ppSecurities: prep.securities.filter((s) => s.action !== 'skip').length,
      ppPrices: prep.plan.prices.filter((p) => !skipped.has(p.securityPpUuid)).length,
      ppTrades: prep.trades.length,
      appTrades,
      appSecurities: appSecurities.size,
    },
    accounts: accountLines,
    positions: positionLines,
    cashFlows,
    performance,
    differences,
  };
}

/** What crossed each depot's boundary per year, PP against the app (YNAB transfers, PP items). */
function cashFlowLines(
  db: Executor,
  model: PpModel,
  targets: readonly AccountTarget[],
  differences: Gate3Report['differences'],
): CashFlowLine[] {
  const out: CashFlowLine[] = [];
  for (const t of targets) {
    const ppYears = ppCashFlowByYear(model, t.ppAccountUuids);
    const bookings = db
      .select({
        id: booking.id,
        date: booking.date,
        amountCents: booking.amountCents,
        transferId: booking.transferId,
      })
      .from(booking)
      .where(and(eq(booking.accountId, t.accountId), isNull(booking.deletedAt)))
      .all()
      .filter((b) => b.date >= t.openingDate);
    const ids = bookings.map((b) => b.id);
    const splits = ids.length
      ? chunked(ids, (part) =>
          db
            .select({
              bookingId: bookingSplit.bookingId,
              transferId: bookingSplit.transferId,
              incomeTypeId: bookingSplit.incomeTypeId,
              amountCents: bookingSplit.amountCents,
            })
            .from(bookingSplit)
            .where(inArray(bookingSplit.bookingId, part))
            .all(),
        )
      : [];
    const settlements = new Set(
      db
        .select({ id: trade.bookingId })
        .from(trade)
        .where(and(isNull(trade.deletedAt), eq(trade.accountId, t.accountId)))
        .all()
        .flatMap((r) => (r.id ? [r.id] : [])),
    );
    const years = new Set<string>([...ppYears.keys(), ...bookings.map((b) => b.date.slice(0, 4))]);
    for (const year of [...years].sort()) {
      const pp = ppYears.get(year) ?? {
        deposits: 0,
        removals: 0,
        transfersIn: 0,
        transfersOut: 0,
        interest: 0,
        dividends: 0,
        fees: 0,
        taxes: 0,
      };
      const app = {
        transfersInCents: 0,
        transfersOutCents: 0,
        plainInCents: 0,
        plainOutCents: 0,
        capitalCents: 0,
        tradeSettlementCents: 0,
        netCents: 0,
      };
      for (const b of bookings) {
        if (!b.date.startsWith(year)) continue;
        if (settlements.has(b.id)) {
          app.tradeSettlementCents += b.amountCents;
          continue;
        }
        const parts = splits.filter((s) => s.bookingId === b.id);
        if (b.transferId !== null || parts.some((s) => s.transferId !== null)) {
          if (b.amountCents > 0) app.transfersInCents += b.amountCents;
          else app.transfersOutCents += b.amountCents;
        } else if (parts.some((s) => s.incomeTypeId === INCOME_TYPES.capital.id)) {
          app.capitalCents += b.amountCents;
        } else if (b.amountCents > 0) app.plainInCents += b.amountCents;
        else app.plainOutCents += b.amountCents;
      }
      app.netCents =
        app.transfersInCents + app.transfersOutCents + app.plainInCents + app.plainOutCents;
      const ppNet = pp.deposits - pp.removals + pp.transfersIn - pp.transfersOut;
      const line: CashFlowLine = {
        account: t.name,
        year,
        pp: { ...pp, netCents: ppNet },
        app,
        diffCents: app.netCents - ppNet,
      };
      if (line.diffCents !== 0) differences.cashFlowYears += 1;
      out.push(line);
    }
  }
  return out;
}

function chunked<T, R>(ids: readonly T[], read: (part: T[]) => R[]): R[] {
  const out: R[] = [];
  for (let i = 0; i < ids.length; i += 500) out.push(...read(ids.slice(i, i + 500)));
  return out;
}

/**
 * TTWROR and XIRR of one depot per period: the app (valuation series plus cash, flows as PP counts
 * them) against PP recomputed from the file over the same windows, which start on the depot's
 * opening day in both. The app's own depot view (boundary transfers only) is shown as well.
 */
function depotPerformance(
  db: Executor,
  model: PpModel,
  prep: Prepared,
  t: AccountTarget,
  today: string,
  skipped: ReadonlySet<string>,
  ids: PpIdMap,
  reference: ReferenceValues | undefined,
  differences: Gate3Report['differences'],
): DepotPerformance {
  const from = t.openingDate;
  const result: DepotPerformance = {
    account: t.name,
    from,
    to: today,
    unavailable: null,
    excludedUnpriced: [],
    periods: [],
  };
  let appSeries: Valuation[];
  let appFlowsPp: CashFlow[];
  let appFlowsBoundary: CashFlow[];
  const excluded = new Set<string>();
  const heldIds = [
    ...new Set(
      db
        .select({ securityId: trade.securityId })
        .from(trade)
        .where(and(isNull(trade.deletedAt), eq(trade.accountId, t.accountId)))
        .all()
        .map((r) => r.securityId),
    ),
  ];
  const names = new Map(
    db
      .select({ id: security.id, name: security.name })
      .from(security)
      .all()
      .map((r) => [r.id, r.name]),
  );
  try {
    let series: ReturnType<typeof valuationSeries> | undefined;
    for (let attempt = 0; series === undefined && attempt <= heldIds.length; attempt++) {
      try {
        series = valuationSeries(db, {
          accounts: [t.accountId],
          securities: heldIds.filter((id) => !excluded.has(id)),
          from,
          to: today,
        });
      } catch (error) {
        if (!(error instanceof PriceUnavailableError)) throw error;
        excluded.add(error.securityId);
        result.excludedUnpriced.push({
          security: names.get(error.securityId) ?? error.securityId,
          firstDay: error.asOf,
        });
      }
    }
    if (series === undefined) throw new Error('valuation_unavailable');
    const cash = cashSeries(db, series.days, [t.accountId]).get(t.accountId) ?? [];
    const total = sumSeries(series.totalCents, cash);
    appSeries = series.days.map((date, i) => ({ date, valueCents: total[i] as number }));
    appFlowsBoundary = portfolioFlows(db, {
      from,
      to: today,
      view: 'depot',
      accounts: [t.accountId],
      referenceAccounts: [t.accountId],
    });
    const deliveries = db
      .select({
        date: trade.date,
        kind: trade.kind,
        amountCents: trade.amountCents,
        securityId: trade.securityId,
      })
      .from(trade)
      .where(and(isNull(trade.deletedAt), eq(trade.accountId, t.accountId)))
      .all()
      .filter(
        (r) =>
          (r.kind === 'delivery_in' || r.kind === 'delivery_out') &&
          r.date > from &&
          !excluded.has(r.securityId),
      );
    const merged = new Map<string, number>();
    for (const f of appFlowsBoundary) merged.set(f.date, (merged.get(f.date) ?? 0) + f.cents);
    for (const d of deliveries)
      merged.set(
        d.date,
        (merged.get(d.date) ?? 0) + (d.kind === 'delivery_in' ? 1 : -1) * d.amountCents,
      );
    appFlowsPp = [...merged]
      .map(([date, cents]) => ({ date, cents }))
      .filter((f) => f.cents !== 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    result.unavailable = error instanceof Error ? error.name : 'unavailable';
    return result;
  }
  const ppExcluded = new Set(skipped);
  for (const [ppUuid, appId] of Object.entries(ids.securities))
    if (excluded.has(appId)) ppExcluded.add(ppUuid);
  let pp: ReturnType<typeof ppDepotSeries>;
  try {
    pp = ppDepotSeries(model, prep.plan, t, from, today, ppExcluded);
  } catch (error) {
    result.unavailable = `pp replay: ${error instanceof Error ? error.name : 'unavailable'}`;
    return result;
  }
  const periods: Period[] = [...PERIODS];
  for (const period of periods) {
    const app = window(appSeries, appFlowsPp, period, today, from);
    const boundary = window(appSeries, appFlowsBoundary, period, today, from);
    const ppFigures = window(pp.valuations, pp.flows, period, today, from);
    const ref = reference?.[t.name]?.[period] ?? null;
    const pct = (v: number | null) => (v === null ? null : v * 100);
    const diff = (a: number | null, b: number | null) =>
      a === null || b === null ? null : a - b;
    const cmp: PeriodComparison = {
      period,
      app,
      appBoundaryOnly: boundary,
      pp: ppFigures,
      ttwrorDiffPp: diff(pct(app?.ttwror ?? null), pct(ppFigures?.ttwror ?? null)),
      xirrDiffPp: diff(pct(app?.xirr ?? null), pct(ppFigures?.xirr ?? null)),
      reference: ref,
      ttwrorVsReferencePp:
        ref?.ttwrorPct === undefined ? null : diff(pct(app?.ttwror ?? null), ref.ttwrorPct),
      irrVsReferencePp:
        ref?.irrPct === undefined ? null : diff(pct(app?.xirr ?? null), ref.irrPct),
    };
    for (const d of [cmp.ttwrorVsReferencePp, cmp.irrVsReferencePp])
      if (d !== null && Math.abs(d) > RETURN_TOLERANCE_PP) differences.returnsOverTolerance += 1;
    result.periods.push(cmp);
  }
  return result;
}
