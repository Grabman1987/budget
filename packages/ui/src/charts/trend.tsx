import { linearTrend } from '@budget/domain';
import { createContext, useContext } from 'react';
import type { Point } from './types';

/** Opt-in per report. Actual values only; the fit is descriptive, never a forecast. */
export const ReportTrendContext = createContext(false);
export function TrendLine({ points }: { points: ReadonlyArray<Point> }) {
  const enabled = useContext(ReportTrendContext);
  const fit = enabled ? linearTrend(points) : [];
  if (fit.length !== 2) return null;
  return (
    <path
      data-testid="report-trend-line"
      className="report-trend-line"
      d={`M${fit[0]![0]},${fit[0]![1]}L${fit[1]![0]},${fit[1]![1]}`}
    >
      <title>
        Trendlinie · lineare Ausgleichsgerade der dargestellten Ist-Werte, keine Prognose
      </title>
    </path>
  );
}
