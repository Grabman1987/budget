import { reportTables, type Db } from '@budget/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { readQuery } from './http';

const monthsQuery = z.object({
  /** `1` adds the month-end net worth (Gesamttabelle); it is the one expensive part. */
  netWorth: z.enum(['0', '1']).default('0'),
});

/**
 * Facts of the monthly table reports (1.5 Jahresansicht, 1.6 Kategorieübersicht, 1.7 Sparquote und
 * Geldalter, 1.8 Gesamttabelle): every month from the budget start to today in one read. The
 * figures themselves are derived in `@budget/domain` (`report-tables`).
 */
export function reportTableRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/months', (c) => {
    const { netWorth } = readQuery(c, monthsQuery);
    return c.json(reportTables(db, { today: today(), withNetWorth: netWorth === '1' }));
  });
  return app;
}
