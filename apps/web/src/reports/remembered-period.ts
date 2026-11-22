import { isReportPeriod, type Period } from '@budget/domain';
import { findReport } from '../nav/reports-catalog';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';

const KEY = 'budget.reports.period';

/** Only readers with a freely selectable report period share this device preference. */
export function supportsReportPeriod(id: string, search: Record<string, unknown>): boolean {
  if (!REDESIGN_ENABLED && id === 'einnahmen-ausgaben' && search['darstellung'] === 'income')
    return false;
  if (
    id === 'vermoegen-schulden' &&
    ['freiheit', 'verteilung'].includes(String(search['darstellung']))
  )
    return false;
  if (id === 'explorer') return !search['ansicht'] && search['vorlage'] !== 'year';
  return findReport(id)?.controls.includes('period') === true;
}

export function rememberReportPeriod(period: unknown): void {
  if (!isReportPeriod(period)) return;
  try {
    localStorage.setItem(KEY, period);
  } catch {
    // A blocked browser preference must not prevent reading a report.
  }
}

export function forgetReportPeriod(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // The report remains usable when device storage is unavailable.
  }
}

/** Explicit, validated URL periods always win. Materialize the fallback before readers mount. */
export function rememberedReportPeriod(
  id: string,
  search: Record<string, unknown>,
): Period | undefined {
  if (isReportPeriod(search['zeitraum']) || !supportsReportPeriod(id, search)) return undefined;
  try {
    const period = localStorage.getItem(KEY);
    return isReportPeriod(period) ? period : undefined;
  } catch {
    return undefined;
  }
}
