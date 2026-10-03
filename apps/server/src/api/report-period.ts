import { isCalendarRange, isReportPeriod, type Period } from '@budget/domain';
import { z } from 'zod';
import { ApiError } from './http';

export const reportPeriodSchema = z.custom<Period>(isReportPeriod, 'Ungültiger Zeitraum');

/** Historical reports cannot request future months; use the server's injected clock. */
export function checkedReportPeriod(period: Period, today: string): Period {
  if (isCalendarRange(period) && period.split('..')[1]! > today.slice(0, 7))
    throw new ApiError(
      400,
      'invalid_query',
      'Der Zeitraum darf keine zukünftigen Monate enthalten.',
    );
  return period;
}
