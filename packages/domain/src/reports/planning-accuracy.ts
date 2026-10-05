import { addMonths } from '../date';

/** Forecast minus actual; zero/net-negative spending has no meaningful relative error. */
export function forecastAccuracy(projectedCents: number, actualCents: number) {
  const deviationCents = projectedCents - actualCents;
  return {
    deviationCents,
    deviationBp: actualCents > 0 ? Math.round((deviationCents * 10_000) / actualCents) : null,
    // Compare cents before display rounding, including the exact 5% boundary.
    hit: actualCents > 0 ? Math.abs(deviationCents) * 20 <= actualCents : null,
  };
}

export function forecastAccuracySummary(
  rows: ReadonlyArray<{ month: string; projectedCents: number; actualCents: number }>,
  currentMonth: string,
) {
  const comparable = rows
    .filter((r) => r.month >= addMonths(currentMonth, -6) && r.month < currentMonth)
    .map((r) => ({ ...r, ...forecastAccuracy(r.projectedCents, r.actualCents) }))
    .filter((r) => r.hit !== null);
  return {
    count: comparable.length,
    hits: comparable.filter((r) => r.hit).length,
    meanAbsoluteBp: comparable.length
      ? Math.round(
          comparable.reduce(
            (sum, r) => sum + Math.abs((r.deviationCents * 10_000) / r.actualCents),
            0,
          ) / comparable.length,
        )
      : null,
  };
}
