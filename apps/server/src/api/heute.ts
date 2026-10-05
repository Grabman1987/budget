import { heute, planningAccuracyReport, type Db } from '@budget/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { readQuery } from './http';
import { month } from './schemas';

const heuteQuery = z.object({
  period: z.enum(['month', 'payday']).default('month'),
  month: month.optional(),
});

/**
 * Heute (concept §7.1): the whole home screen in one request. `period=month` charts the whole
 * month, `period=payday` runs from today to the next salary; `month` shows another month's
 * balance, pace and envelopes (lead, net worth and next steps always refer to today).
 */
export function heuteRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const { period, month: shown } = readQuery(c, heuteQuery);
    const day = today();
    const data = heute(db, { today: day, period, ...(shown && { month: shown }) });
    return c.json({
      ...data,
      planningAccuracy: planningAccuracyReport(db, data.pace.month, day).summary,
    });
  });
  return app;
}
