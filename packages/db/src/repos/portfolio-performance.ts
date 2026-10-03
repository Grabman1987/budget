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
  input: PerformanceInput,
  window: Window,
  series: ReturnType<typeof valuationSeries>,
  classes: { assetClassId: string | null; name: string; securityIds: string[] }[],
  classFlows: (ids: string[]) => PerformanceInput['flows'],
  quotes?: ReportQuote[],
) {
  const history = performanceReportSeries(input, window, quotes);
  return {
    ...history,
    classes: classes.map((cls) => {
      const values = sumSeries(
        ...series.positions
          .filter((p) => cls.securityIds.includes(p.securityId))
          .map((p) => p.valueCents),
      );
      const classInput = {
        series: series.days.map((date, i) => ({ date, valueCents: values[i] ?? 0 })),
        flows: classFlows(cls.securityIds),
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
