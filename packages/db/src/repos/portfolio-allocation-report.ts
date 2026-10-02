import {
  allocationTimeline,
  monthBoundaries,
  NO_REGION,
  parseRegionWeights,
  periodWindow,
  shareBps,
  splitByRegion,
  sumSeries,
  windowPerformance,
  type SpeculativeShare,
  type Valuation,
  type WealthPosition,
} from '@budget/domain';
import { isNull } from 'drizzle-orm';
import { account, security } from '../schema';
import { portfolioFlows, valuationSeries } from './portfolio';
import { classTargets, firstDay, positionLines, riskOf } from './portfolio-summary';
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
  totalCents: number[];
  classes: Array<{
    assetClassId: string | null;
    name: string;
    istBp: number[];
    targetBp: Array<number | null>;
    bandBp: Array<number | null>;
    breach: boolean[];
  }>;
}

export interface AllocationReport {
  asOf: string;
  totalCents: number;
  classes: AllocationClass[];
  regions: AllocationRegion[];
  /** False when part of the portfolio has no (valid) region weights. */
  regionsComplete: boolean;
  speculative: SpeculativeShare;
  /** Month ends from the first day to today; `null` without history. */
  history: AllocationHistory | null;
}

const NO_CLASS = '';

/**
 * Allocation report (4.2): the current portfolio by class and product and by region and product,
 * the R13 Soll/Ist table, and the Soll/Ist of every class at each month end. Values, shares and
 * band breaches come from `positionLines`, `riskOf` and `allocationStatus`, the same functions
 * that feed Vermögen, so the report cannot disagree with it.
 */
export function allocationReport(db: Executor, options: { today: string }): AllocationReport {
  const { today } = options;
  const lines = positionLines(db, today);
  const risk = riskOf(db, today, lines);
  const totalCents = lines.reduce((a, l) => a + l.valueCents, 0);

  const securities = new Map(
    db
      .select()
      .from(security)
      .where(isNull(security.deletedAt))
      .all()
      .map((s) => [s.id, s]),
  );
  const classNames = new Map(listAssetClasses(db).map((c) => [c.id, c.name]));
  const className = (key: string) => classNames.get(key) ?? 'Ohne Anlageklasse';
  const accountNames = new Map(
    db
      .select({ id: account.id, name: account.name })
      .from(account)
      .all()
      .map((a) => [a.id, a.name]),
  );

  // Series for the 12-month returns of the products and for the history.
  const start = firstDay(db, today);
  const series = start === null ? null : valuationSeries(db, { from: start, to: today });
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
      });
      const hasValue = valuations.some((v) => v.valueCents > 0);
      ttwror12.set(
        line.securityId,
        hasValue ? windowPerformance({ series: valuations, flows }, window).ttwror : null,
      );
    }
  }

  const classes: AllocationClass[] = risk.allocation.rows.map((row) => ({
    assetClassId: row.assetClass === NO_CLASS ? null : row.assetClass,
    name: className(row.assetClass),
    valueCents: row.valueCents,
    shareBp: row.shareBp,
    targetBp: row.targetBp,
    bandBp: row.bandBp,
    deviationBp: row.deviationBp,
    breach: row.breach,
    products: lines
      .filter((l) => (l.assetClassId ?? NO_CLASS) === row.assetClass)
      .map((l) => ({
        securityId: l.securityId,
        name: l.name,
        valueCents: l.valueCents,
        shareBp: l.shareBp,
        depots: [...new Set(l.accounts.map((a) => accountNames.get(a.accountId) ?? a.accountId))],
        ttwror12: ttwror12.get(l.securityId) ?? null,
      })),
  }));

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

  // Soll/Ist at the month ends, from the same daily series.
  let history: AllocationHistory | null = null;
  if (series && start !== null && series.days.length > 0) {
    const dates = monthBoundaries(start, today);
    const dayIndex = new Map(series.days.map((d, i) => [d, i]));
    const snapshots = dates.map((date) => {
      const i = dayIndex.get(date) as number;
      const positions: WealthPosition[] = series.positions.flatMap((p) => {
        const valueCents = p.valueCents[i] as number;
        const sec = securities.get(p.securityId);
        if (valueCents <= 0 || !sec) return [];
        return [
          {
            id: `${p.securityId}:${p.accountId}`,
            securityId: p.securityId,
            kind: sec.kind,
            assetClass: sec.assetClassId,
            valueCents,
          },
        ];
      });
      return { date, positions, targets: classTargets(db, date) };
    });
    const timeline = allocationTimeline(snapshots);
    history = {
      dates: timeline.dates,
      totalCents: timeline.totalCents,
      classes: timeline.classes.map((c) => ({
        assetClassId: c.assetClass === NO_CLASS ? null : c.assetClass,
        name: className(c.assetClass),
        istBp: c.istBp,
        targetBp: c.targetBp,
        bandBp: c.bandBp,
        breach: c.breach,
      })),
    };
  }

  return {
    asOf: today,
    totalCents,
    classes,
    regions,
    regionsComplete: !regions.some((r) => r.region === null),
    speculative: risk.speculative,
    history,
  };
}
