import { checkedReportPeriod, reportPeriodSchema } from './report-period';
import { cashflowReport, type Db } from '@budget/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { readQuery } from './http';

const query = z.object({ period: reportPeriodSchema.default('1J') });

/**
 * Report 3.2 Cashflow-Verlauf (`/api/cashflow?period=`): income, consumption and net cashflow per
 * full month of the budget accounts; Kapitalerträge as a separate series.
 */
export function cashflowRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const asOf = today();
    const period = checkedReportPeriod(readQuery(c, query).period, asOf);
    // January has no completed month this year: use the existing to-date calendar range.
    const month = asOf.slice(0, 7);
    const window =
      period === 'YTD' && month.endsWith('-01') ? (`${month}..${month}` as const) : period;
    return c.json({ ...cashflowReport(db, asOf, window), period });
  });
  return app;
}
