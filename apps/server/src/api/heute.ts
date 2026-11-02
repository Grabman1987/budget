import {
  availableSection,
  currentValuationSources,
  liquidityReportView,
  heute,
  planningAccuracyReport,
  readOverdueContactReminders,
  readMonthCloseReminders,
  type Db,
} from '@budget/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { readQuery } from './http';
import { month } from './schemas';

const heuteQuery = z.object({
  period: z.enum(['month', 'payday']).default('month'),
  month: month.optional(),
});

/**
 * The legacy balance follows its budget window; the compact forecast copies the canonical 35d read.
 * Pace/envelopes follow `month`; lead, net worth and next steps always refer to today.
 */
export function heuteRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const { period, month: shown } = readQuery(c, heuteQuery);
    const day = today();
    // Preserve the plain-handle read path so existing per-request memo entries can be populated.
    const data = heute(db, { today: day, period, ...(shown && { month: shown }) });
    const provenance = currentValuationSources(db, day);
    const forecast35d = {
      asOf: day,
      horizon: '35d' as const,
      levers: [],
      ...availableSection(() => {
        const view = liquidityReportView(db, day, { horizon: '35d', levers: [] });
        const report = view.report;
        return {
          available: view.available,
          report: report && {
            startDay: report.startDay,
            startCents: report.startCents,
            horizon: report.horizon,
            horizonDays: report.horizonDays,
            points: report.points,
            eventMarks: report.eventMarks,
            low: report.low,
            scheduledInflows: report.scheduledInflows,
          },
        };
      }),
    };
    return c.json({
      ...data,
      forecast35d,
      valuationSources: provenance.sources,
      attention: {
        ...data.attention,
        quoteReview: provenance.quoteReview,
        monthCloseTasks: readMonthCloseReminders(db, day),
        contactReminders: readOverdueContactReminders(db, day),
      },
      planningAccuracy: planningAccuracyReport(db, data.pace.month, day).summary,
    });
  });
  return app;
}
