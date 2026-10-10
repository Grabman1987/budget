import { exposureResolver, splitAssetExposure } from './asset-exposure';
import type { Executor } from './types';
import {
  performanceReportSeries,
  windowPerformance,
  type PerformanceInput,
  type Window,
  type ReportQuote,
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
  securityFlows: (ids: string[]) => PerformanceInput['flows'],
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
  const flowsByDay = new Map(
    [...flowsBySecurity].map(([id, rows]) => {
      const byDay = new Map<string, typeof rows>();
      for (const flow of rows) byDay.set(flow.date, [...(byDay.get(flow.date) ?? []), flow]);
      return [id, byDay] as const;
    }),
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
    flows: { id: string; cents: number }[];
  }[] = [];
  for (let i = 1; i < series.days.length; i++) {
    const date = series.days[i]!;
    const previous = series.days[i - 1]!;
    const work = {
      date,
      previous,
      positions: series.positions
        .filter((p) => weightsOn(p.securityId, date) !== weightsOn(p.securityId, previous))
        .map((p) => ({ id: p.securityId, value: p.valueCents[i]! })),
      flows: [...flowsByDay].flatMap(([id, byDay]) =>
        weightsOn(id, date) === weightsOn(id, previous)
          ? []
          : (byDay.get(date) ?? []).map((flow) => ({ id, cents: flow.cents })),
      ),
    };
    if (work.positions.length > 0 || work.flows.length > 0) reclassified.push(work);
  }
  return {
    ...history,
    classes: classes.map((cls) => {
      const values = valuesByClass.get(cls.assetClassId) ?? [];
      const flows = [...flowsBySecurity].flatMap(([id, rows]) =>
        rows.map((flow) => ({
          date: flow.date,
          cents:
            split(flow.cents, weightsOn(id, flow.date)).find(
              (part) => part.assetClassId === cls.assetClassId,
            )?.valueCents ?? 0,
        })),
      );
      // A classification change transfers value between class sleeves, not investment return.
      for (const work of reclassified) {
        let transfer = 0;
        for (const { id, value } of work.positions) {
          const share = (day: string) =>
            split(value, weightsOn(id, day)).find((part) => part.assetClassId === cls.assetClassId)
              ?.valueCents ?? 0;
          transfer += share(work.date) - share(work.previous);
        }
        // Same-day contributions/withdrawals already enter the dated security cash flows.
        // Transfer only the value excluding them, so a buy plus reclassification is not a gain.
        for (const { id, cents } of work.flows) {
          const share = (day: string) =>
            split(cents, weightsOn(id, day)).find((part) => part.assetClassId === cls.assetClassId)
              ?.valueCents ?? 0;
          transfer -= share(work.date) - share(work.previous);
        }
        if (transfer) flows.push({ date: work.date, cents: transfer });
      }
      const classInput = {
        series: series.days.map((date, i) => ({ date, valueCents: values[i] ?? 0 })),
        flows,
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
