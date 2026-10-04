import { exposuresAsOf, splitAssetExposure } from './asset-exposure';
import type { Executor } from './types';
import {
  performanceReportSeries,
  sumSeries,
  windowPerformance,
  type PerformanceInput,
  type Window,
  type ReportQuote,
} from '@budget/domain';
import type { valuationSeries } from './portfolio';

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
  const resolved = new Map(series.days.map((day) => [day, exposuresAsOf(db, day)]));
  const weightsOn = (securityId: string, day: string) => {
    if (!resolved.has(day)) resolved.set(day, exposuresAsOf(db, day));
    return resolved.get(day)!.get(securityId)?.weights ?? [];
  };
  const flowsBySecurity = new Map(
    [...new Set(series.positions.map((p) => p.securityId))].map((id) => [id, securityFlows([id])]),
  );
  return {
    ...history,
    classes: classes.map((cls) => {
      const values = sumSeries(
        ...series.positions.map((p) =>
          p.valueCents.map(
            (value, i) =>
              splitAssetExposure(value, weightsOn(p.securityId, series.days[i]!)).find(
                (part) => part.assetClassId === cls.assetClassId,
              )?.valueCents ?? 0,
          ),
        ),
      );
      const flows = [...flowsBySecurity].flatMap(([id, rows]) =>
        rows.map((flow) => ({
          date: flow.date,
          cents:
            splitAssetExposure(flow.cents, weightsOn(id, flow.date)).find(
              (part) => part.assetClassId === cls.assetClassId,
            )?.valueCents ?? 0,
        })),
      );
      // A classification change transfers value between class sleeves, not investment return.
      for (let i = 1; i < series.days.length; i++) {
        const date = series.days[i]!;
        let transfer = 0;
        for (const p of series.positions) {
          const value = p.valueCents[i]!;
          const share = (day: string) =>
            splitAssetExposure(value, weightsOn(p.securityId, day)).find(
              (part) => part.assetClassId === cls.assetClassId,
            )?.valueCents ?? 0;
          transfer += share(date) - share(series.days[i - 1]!);
        }
        // Same-day contributions/withdrawals already enter the dated security cash flows.
        // Transfer only the value excluding them, so a buy plus reclassification is not a gain.
        for (const [id, rows] of flowsBySecurity)
          for (const flow of rows.filter((f) => f.date === date)) {
            const share = (day: string) =>
              splitAssetExposure(flow.cents, weightsOn(id, day)).find(
                (part) => part.assetClassId === cls.assetClassId,
              )?.valueCents ?? 0;
            transfer -= share(date) - share(series.days[i - 1]!);
          }
        if (transfer) flows.push({ date, cents: transfer });
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
        valueCents: performance.endValueCents,
        performance: hasReturn ? performance : null,
        index: classHistory.index,
      };
    }),
  };
}

export type PortfolioPerformanceHistory = ReturnType<typeof portfolioPerformanceHistory>;
