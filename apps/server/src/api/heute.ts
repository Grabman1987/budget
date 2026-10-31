import {
  currentValuationSources,
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
 * Heute and R07 share a period-bound balance forecast with fourteen days of actual history.
 * Pace/envelopes follow `month`; lead, net worth and next steps always refer to today.
 */
export function heuteRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const { period, month: shown } = readQuery(c, heuteQuery);
    const day = today();
    const data = heute(db, { today: day, period, ...(shown && { month: shown }) });
    const provenance = currentValuationSources(db, day);
    return c.json({
      ...data,
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
