import { isReportPeriod, type Period } from '@budget/domain';
import { useNavigate, useSearch } from '@tanstack/react-router';

/** Zeitraum of the Vermögen pages (`?zeitraum=`), shared by Nettovermögen and Portfolio. */
export const ZEITRAUM_VALUES: ReadonlyArray<Period> = ['1M', '3M', 'YTD', '1J', '3J', 'Alles'];
export const DEFAULT_ZEITRAUM: Period = 'YTD';

export const isZeitraum = (value: unknown): value is Period => isReportPeriod(value);

/**
 * Selected Zeitraum (default YTD, or `fallback`) and its setter. The choice lives in the URL so it survives a
 * reload and a link; it replaces the history entry because it is a view setting, not a page visit.
 */
export function useZeitraum(
  fallback: Period = DEFAULT_ZEITRAUM,
): [zeitraum: Period, set: (value: Period) => void] {
  const { zeitraum } = useSearch({ strict: false }) as { zeitraum?: unknown };
  const navigate = useNavigate();
  const set = (value: Period) =>
    void navigate({
      to: '.',
      search: ((prev: Record<string, unknown>) => ({ ...prev, zeitraum: value })) as never,
      replace: true,
    });
  return [isZeitraum(zeitraum) ? zeitraum : fallback, set];
}
