import { resolvePortfolioRiskPolicy } from './portfolio-risk-policy';
import { allocationInputsAsOf, allocationUniverse } from './allocation-inputs';
import {
  allocationTimeline,
  allocationChartPositions,
  compositionGroups,
  allocationStatus,
  monthBoundaries,
  NO_REGION,
  parseRegionWeights,
  periodWindow,
  shareBps,
  splitByRegion,
  sumSeries,
  windowPerformance,
  type SpeculativeShare,
  type ClusterRisk,
  type Valuation,
  PriceUnavailableError,
  ExchangeRateUnavailableError,
  type AllocationQuality,
} from '@budget/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { account, security } from '../schema';
import { portfolioFlows, valuationSeries } from './portfolio';
import { firstDay, riskOf } from './portfolio-summary';
import { listAssetClasses } from './securities';
import type { Executor } from './types';

export interface AllocationProduct {
  securityId: string;
  name: string;
  valueCents: number;
  shareBp: number;
  /** Names of the depots (accounts) that hold the product. */
  depots: string[];
  /** Time-weighted return of the last 12 months; `null` without a valued start in the window. */
  ttwror12: number | null;
}

export interface AllocationClass {
  /** Share of the whole, signed investment universe; composition shareBp uses classified value. */
  portfolioShareBp: number;
  confidence: AllocationQuality['confidence'];
  /** `null` for positions without an asset class. */
  assetClassId: string | null;
  name: string;
  valueCents: number;
  shareBp: number;
  targetBp: number | null;
  bandBp: number | null;
  deviationBp: number | null;
  /** Outside the R13 band. */
  breach: boolean;
  products: AllocationProduct[];
}

export interface AllocationRegion {
  /** Region name; `null` for the part of the portfolio without region data. */
  region: string | null;
  valueCents: number;
  shareBp: number;
  products: Array<{ securityId: string; name: string; valueCents: number }>;
}

export interface AllocationHistory {
  dates: string[];
  quality: AllocationQuality[];
  classifiedCents: number[];
  totalCents: number[];
  classes: Array<{
    assetClassId: string | null;
    name: string;
    istBp: number[];
    chartBp: number[];
    targetBp: Array<number | null>;
    bandBp: Array<number | null>;
    breach: boolean[];
  }>;
}

export interface AllocationReport {
  compositionGroups: AllocationGroup[];
  regionsAvailable: boolean;
  regionEditSecurityId: string | null;
  quality: AllocationQuality;
  classifiedCents: number;
  compositionClasses: AllocationClass[];
  compositionRegions: AllocationRegion[];
  separatePositions: { name: string; valueCents: number; reason: string }[];
  asOf: string;
  totalCents: number;
  classes: AllocationClass[];
  regions: AllocationRegion[];
  /** False when part of the portfolio has no (valid) region weights. */
  regionsComplete: boolean;
  speculative: SpeculativeShare;
  cluster: ClusterRisk;
  /** Month ends from the first day to today; `null` without history. */
  history: AllocationHistory | null;
}

export type AllocationGroup = ReturnType<typeof compositionGroups<AllocationClass>>[number];

const NO_CLASS = '';

/**
 * Allocation report (4.2): the current portfolio by class and product and by region and product,
 * the R13 Soll/Ist table, and the Soll/Ist of every class at each month end. Values, shares and
 * band breaches come from `positionLines`, `riskOf` and `allocationStatus`, the same functions
 * that feed Vermögen, so the report cannot disagree with it.
 */
export function allocationReport(db: Executor, options: { today: string }): AllocationReport {
  const { today } = options;
  const current = allocationInputsAsOf(db, today);
  const risk = riskOf(db, today);
  const totalCents = current.valueCents;
  if (totalCents === null) throwAllocationUnavailable(current, today);
  const universe = allocationUniverse(db);
  const names = new Map([
    ...universe.securities.map((s) => [s.id, s.name] as const),
    ...universe.accounts.map((a) => [`cash:${a.id}`, a.name] as const),
  ]);
  const lines = [...new Set(current.positions.map((p) => p.securityId!))].map((securityId) => ({
    securityId,
    name: names.get(securityId) ?? 'Anlage-Cash',
    valueCents: current.positions
      .filter((p) => p.securityId === securityId)
      .reduce((sum, p) => sum + p.valueCents, 0),
  }));

  const securities = new Map(
    db
      .select()
      .from(security)
      .where(isNull(security.deletedAt))
      .all()
      .map((s) => [s.id, s]),
  );
  const classDefinitions = listAssetClasses(db, { includeDeleted: true });
  const classNames = new Map(classDefinitions.map((c) => [c.id, c.name]));
  const className = (key: string) => classNames.get(key) ?? 'Ohne Anlageklasse';
  const accountNames = new Map(
    db
      .select({ id: account.id, name: account.name })
      .from(account)
      .all()
      .map((a) => [a.id, a.name]),
  );

  // Series for the 12-month returns of the products and for the history.
  const portfolioStart =
    [firstDay(db, today), ...universe.accounts.map((a) => a.openingDate)]
      .filter((d): d is string => d !== null && d <= today)
      .sort()[0] ?? null;
  const budgetStart = db
    .select({ date: account.openingDate })
    .from(account)
    .where(and(isNull(account.deletedAt), eq(account.onBudget, true)))
    .all()
    .map((a) => a.date.slice(0, 7) + '-01')
    .sort()[0];
  const start =
    portfolioStart === null
      ? null
      : budgetStart && budgetStart > portfolioStart
        ? budgetStart
        : portfolioStart;
  const series =
    start === null
      ? null
      : valuationSeries(db, {
          from: start,
          to: today,
          accounts: universe.accounts.map((a) => a.id),
          securities: universe.securities.map((s) => s.id),
        });
  const ttwror12 = new Map<string, number | null>();
  if (series && series.days.length > 0) {
    const window = periodWindow('1J', today, series.days[0]);
    for (const line of lines) {
      const mine = series.positions.filter((p) => p.securityId === line.securityId);
      const values = sumSeries(...mine.map((p) => p.valueCents));
      const valuations: Valuation[] = series.days.map((date, i) => ({
        date,
        valueCents: values[i] as number,
      }));
      const flows = portfolioFlows(db, {
        from: start as string,
        to: today,
        view: 'securities',
        securities: [line.securityId],
        accounts: universe.accounts.map((a) => a.id),
      });
      const hasValue = valuations.some((v) => v.valueCents > 0);
      ttwror12.set(
        line.securityId,
        hasValue ? windowPerformance({ series: valuations, flows }, window).ttwror : null,
      );
    }
  }

  const positionShares = shareBps(
    current.positions.map((p) => p.valueCents),
    totalCents,
  );
  const sharesByPosition = new Map(current.positions.map((p, i) => [p.id, positionShares[i]!]));
  const classes: AllocationClass[] = risk.allocation.rows.map((row) => {
    const mine = current.positions.filter((p) => (p.assetClass ?? NO_CLASS) === row.assetClass);
    const products = [...new Set(mine.map((p) => p.securityId!))].map((securityId) => {
      const parts = mine.filter((p) => p.securityId === securityId);
      return {
        securityId,
        name: names.get(securityId) ?? 'Anlage-Cash',
        valueCents: parts.reduce((sum, p) => sum + p.valueCents, 0),
        shareBp: parts.reduce((sum, p) => sum + sharesByPosition.get(p.id)!, 0),
        depots: [
          ...new Set(
            parts.map((p) => {
              return accountNames.get(p.accountId ?? '') ?? 'Anlagekonto';
            }),
          ),
        ],
        ttwror12: ttwror12.get(securityId) ?? null,
      };
    });
    return {
      assetClassId: row.assetClass === NO_CLASS ? null : row.assetClass,
      name: className(row.assetClass),
      valueCents: row.valueCents,
      shareBp: row.shareBp,
      portfolioShareBp: row.shareBp,
      targetBp: row.targetBp,
      bandBp: row.bandBp,
      deviationBp: row.deviationBp,
      breach: row.breach,
      confidence: current.quality.confidence,
      products,
    };
  });

  const chartPositions = allocationChartPositions(current.positions);
  const classifiedCents = chartPositions.reduce((sum, p) => sum + p.valueCents, 0);
  const chartShares = shareBps(
    chartPositions.map((p) => p.valueCents),
    classifiedCents,
  );
  const chartRows = allocationStatus(chartPositions, []).rows;
  const compositionClasses = chartRows.map((row): AllocationClass => {
    const source = classes.find((c) => c.assetClassId === row.assetClass)!;
    const parts = chartPositions
      .map((p, i) => ({ ...p, shareBp: chartShares[i]! }))
      .filter((p) => p.assetClass === row.assetClass);
    return {
      ...source,
      valueCents: row.valueCents,
      shareBp: row.shareBp,
      products: source.products.flatMap((p) => {
        const mine = parts.filter((part) => part.securityId === p.securityId);
        return mine.length
          ? [
              {
                ...p,
                valueCents: mine.reduce((sum, p) => sum + p.valueCents, 0),
                shareBp: mine.reduce((sum, p) => sum + p.shareBp, 0),
              },
            ]
          : [];
      }),
    };
  });
  const separatePositions = current.positions
    .filter((p) => !chartPositions.includes(p))
    .map((p) => ({
      name: names.get(p.securityId!) ?? 'Anlageposition',
      valueCents: p.valueCents,
      reason:
        p.valueCents < 0
          ? 'Negative Position'
          : p.securityId?.startsWith('cash:') && p.kind !== 'p2p'
            ? 'Anlage-Cash'
            : 'Ohne Anlageklasse',
    }));

  const grouped = compositionGroups(
    [
      ...compositionClasses,
      ...classes
        .filter(
          (c) =>
            c.assetClassId !== null &&
            c.targetBp !== null &&
            !compositionClasses.some((r) => r.assetClassId === c.assetClassId),
        )
        .map((c) => ({ ...c, valueCents: 0, shareBp: 0, products: [] })),
    ],
    classDefinitions,
  );
  const heldSecurities = lines.filter((p) => !p.securityId.startsWith('cash:') && p.valueCents > 0);
  const heldValue = heldSecurities.reduce((sum, p) => sum + p.valueCents, 0);
  const regionValue = heldSecurities.reduce(
    (sum, p) =>
      sum +
      splitByRegion(p.valueCents, parseRegionWeights(securities.get(p.securityId)?.regionsJson))
        .filter((r) => r.region !== NO_REGION)
        .reduce((s, r) => s + r.valueCents, 0),
    0,
  );
  const regionsAvailable = heldValue > 0 && regionValue * 2 >= heldValue;
  const regionEditSecurityId =
    heldSecurities.find((p) => !parseRegionWeights(securities.get(p.securityId)?.regionsJson))
      ?.securityId ??
    heldSecurities[0]?.securityId ??
    null;

  // Regions: every product's value split by its stored weights, conserved to the cent.
  const byRegion = new Map<string, AllocationRegion['products']>();
  for (const line of lines) {
    const weights = parseRegionWeights(securities.get(line.securityId)?.regionsJson);
    for (const part of splitByRegion(line.valueCents, weights)) {
      const list = byRegion.get(part.region) ?? [];
      list.push({ securityId: line.securityId, name: line.name, valueCents: part.valueCents });
      byRegion.set(part.region, list);
    }
  }
  const regionRows = [...byRegion.entries()]
    .map(([region, products]) => ({
      region,
      valueCents: products.reduce((a, p) => a + p.valueCents, 0),
      products,
    }))
    .sort(
      (a, b) =>
        Number(a.region === NO_REGION) - Number(b.region === NO_REGION) ||
        b.valueCents - a.valueCents ||
        a.region.localeCompare(b.region),
    );
  const regionShares = shareBps(
    regionRows.map((r) => r.valueCents),
    totalCents,
  );
  const regions: AllocationRegion[] = regionRows.map((r, i) => ({
    region: r.region === NO_REGION ? null : r.region,
    valueCents: r.valueCents,
    shareBp: regionShares[i] as number,
    products: r.products,
  }));

  const compositionRegionParts = new Map<string, AllocationRegion['products']>();
  for (const c of compositionClasses)
    for (const p of c.products) {
      for (const part of splitByRegion(
        p.valueCents,
        parseRegionWeights(securities.get(p.securityId)?.regionsJson),
      )) {
        const list = compositionRegionParts.get(part.region) ?? [];
        list.push({ securityId: p.securityId, name: p.name, valueCents: part.valueCents });
        compositionRegionParts.set(part.region, list);
      }
    }
  const compositionRegionRows = [...compositionRegionParts].map(([region, products]) => ({
    region: region === NO_REGION ? null : region,
    products,
    valueCents: products.reduce((sum, p) => sum + p.valueCents, 0),
  }));
  const compositionRegionShares = shareBps(
    compositionRegionRows.map((r) => r.valueCents),
    classifiedCents,
  );
  const compositionRegions = compositionRegionRows.map((r, i) => ({
    ...r,
    shareBp: compositionRegionShares[i]!,
  }));

  // Soll/Ist at the month ends, from the same daily series.
  let history: AllocationHistory | null = null;
  if (series && start !== null && series.days.length > 0) {
    const dates = monthBoundaries(start, today);
    const quality: AllocationQuality[] = [];
    const snapshots = dates.map((date) => {
      const input = allocationInputsAsOf(db, date);
      if (input.valueCents === null) throwAllocationUnavailable(input, date);
      quality.push(input.quality);
      const policy = resolvePortfolioRiskPolicy(db, date, input.valueCents);
      return { date, positions: input.positions, targets: policy.targets, bandPolicy: policy.R13 };
    });
    const timeline = allocationTimeline(snapshots);
    const composition = allocationTimeline(
      snapshots.map((s) => ({ ...s, positions: allocationChartPositions(s.positions) })),
    );
    history = {
      dates: timeline.dates,
      quality,
      classifiedCents: composition.totalCents,
      totalCents: timeline.totalCents,
      classes: timeline.classes.map((c) => ({
        assetClassId: c.assetClass === NO_CLASS ? null : c.assetClass,
        name: className(c.assetClass),
        istBp: c.istBp,
        chartBp:
          composition.classes.find((r) => r.assetClass === c.assetClass)?.istBp ??
          dates.map(() => 0),
        targetBp: c.targetBp,
        bandBp: c.bandBp,
        breach: c.breach,
      })),
    };
  }

  return {
    asOf: today,
    quality: current.quality,
    classifiedCents,
    compositionClasses,
    compositionGroups: grouped,
    regionsAvailable,
    regionEditSecurityId,
    compositionRegions,
    separatePositions,
    totalCents,
    classes,
    regions,
    regionsComplete: !regions.some((r) => r.region === null),
    speculative: risk.speculative,
    cluster: risk.cluster,
    history,
  };
}

function throwAllocationUnavailable(
  input: ReturnType<typeof allocationInputsAsOf>,
  day: string,
): never {
  const missing = input.unavailable[0]!;
  if (missing.reason === 'missing_fx')
    throw new ExchangeRateUnavailableError(missing.currency!, day);
  throw new PriceUnavailableError(missing.accountId, missing.securityId!, day);
}
