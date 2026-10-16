import { exposureResolver, splitAssetExposure } from './asset-exposure';
import type { Executor } from './types';
import {
  performanceReportSeries,
  windowPerformance,
  type PerformanceInput,
  type Window,
  type ReportQuote,
  type CashFlow,
} from '@budget/domain';
import type { valuationSeries } from './portfolio';

type Weights = readonly { assetClassId: string; weightBp: number }[];

/** Build class histories from the valuation already read by the summary (including sold positions). */
export function portfolioPerformanceHistory(
  db: Executor,
  input: PerformanceInput,
  window: Window,
  series: ReturnType<typeof valuationSeries>,
  classes: { assetClassId: string | null; name: string; securityIds?: string[] }[],
  securityFlows: (
    ids: string[],
    taxBasis?: 'after-tax' | 'before-tax' | 'pp-irr',
  ) => PerformanceInput['flows'],
  quotes?: ReportQuote[],
) {
  const history = performanceReportSeries(input, window, quotes);
  const exposuresOn = exposureResolver(db);
  const NO_WEIGHTS: Weights = [];
  const weightsOn = (securityId: string, day: string): Weights =>
    exposuresOn(day).get(securityId)?.weights ?? NO_WEIGHTS;
  // The split of one value is asked for once per class; remember it per weights array and value.
  const splits = new WeakMap<Weights, Map<number, ReturnType<typeof splitAssetExposure>>>();
  const split = (value: number, weights: Weights) => {
    let byValue = splits.get(weights);
    if (!byValue) splits.set(weights, (byValue = new Map()));
    let parts = byValue.get(value);
    if (!parts) byValue.set(value, (parts = splitAssetExposure(value, weights)));
    return parts;
  };
  const flowsBySecurity = new Map(
    [...new Set(series.positions.map((p) => p.securityId))].map((id) => [id, securityFlows([id])]),
  );
  const irrFlowsBySecurity = new Map(
    [...flowsBySecurity.keys()].map((id) => [id, securityFlows([id], 'pp-irr')]),
  );
  const returnFlowsBySecurity = new Map(
    [...flowsBySecurity.keys()].map((id) => [id, securityFlows([id], 'before-tax')]),
  );
  // Every position-day is split once into all classes (the class sleeves are sums of those parts).
  const valuesByClass = new Map<string | null, number[]>(
    classes.map((cls) => [cls.assetClassId, new Array<number>(series.days.length).fill(0)]),
  );
  for (const p of series.positions)
    p.valueCents.forEach((value, i) => {
      if (value === 0) return;
      for (const part of splitAssetExposure(value, weightsOn(p.securityId, series.days[i]!))) {
        const sleeve = valuesByClass.get(part.assetClassId);
        if (sleeve) sleeve[i] = sleeve[i]! + part.valueCents;
      }
    });
  // Days on which a security's class weights differ from the day before: only these can transfer
  // value between sleeves (same weights means the same share), so they are found once, not per class.
  const reclassified: {
    date: string;
    previous: string;
    positions: { id: string; value: number }[];
  }[] = [];
  for (let i = 1; i < series.days.length; i++) {
    const date = series.days[i]!;
    const previous = series.days[i - 1]!;
    const work = {
      date,
      previous,
      positions: series.positions
        .filter((p) => weightsOn(p.securityId, date) !== weightsOn(p.securityId, previous))
        .map((p) => ({ id: p.securityId, value: p.valueCents[i - 1]! })),
    };
    if (work.positions.length > 0) reclassified.push(work);
  }
  return {
    ...history,
    classes: classes.map((cls) => {
      const values = valuesByClass.get(cls.assetClassId) ?? [];
      const splitFlows = (bySecurity: typeof flowsBySecurity): CashFlow[] =>
        [...bySecurity].flatMap(([id, rows]) =>
          rows.map((flow) => ({
            date: flow.date,
            cents:
              split(flow.cents, weightsOn(id, flow.date)).find(
                (part) => part.assetClassId === cls.assetClassId,
              )?.valueCents ?? 0,
          })),
        );
      const flows = splitFlows(flowsBySecurity);
      const returnFlows = splitFlows(returnFlowsBySecurity);
      const irrFlows = splitFlows(irrFlowsBySecurity);
      // Inclusive dated weights apply from the opening. Move the preceding close between
      // classes before today's trades/market return, with both directions at the opening.
      for (const work of reclassified) {
        let transfer = 0;
        for (const { id, value } of work.positions) {
          const share = (day: string) =>
            split(value, weightsOn(id, day)).find((part) => part.assetClassId === cls.assetClassId)
              ?.valueCents ?? 0;
          transfer += share(work.date) - share(work.previous);
        }
        if (transfer) {
          const flow = { date: work.date, cents: transfer, atStart: true as const };
          flows.push(flow);
          returnFlows.push(flow);
          irrFlows.push(flow);
        }
      }
      const classInput = {
        series: series.days.map((date, i) => ({ date, valueCents: values[i] ?? 0 })),
        flows,
        returnFlows,
        irrFlows,
      };
      const classHistory = performanceReportSeries(classInput, window);
      const hasReturn = classHistory.months.some((m) => m.rate !== null);
      const performance = windowPerformance(classInput, window);
      return {
        assetClassId: cls.assetClassId,
        name: cls.name,
        // Holdings at the report stand, also outside the allocation universe and at zero value.
        currentHolding: series.positions.some(
          (p) =>
            (p.unitsE8.at(-1) ?? 0) !== 0 &&
            splitAssetExposure(0, weightsOn(p.securityId, series.days.at(-1)!)).some(
              (part) => part.assetClassId === cls.assetClassId && part.weightBp > 0,
            ),
        ),
        valueCents: performance.endValueCents,
        performance: hasReturn ? performance : null,
        index: classHistory.index,
      };
    }),
  };
}

export type PortfolioPerformanceHistory = ReturnType<typeof portfolioPerformanceHistory>;
