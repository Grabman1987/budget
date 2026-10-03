import { checkedReportPeriod, reportPeriodSchema } from './report-period';
import { netWorthHistory, type Db } from '@budget/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { readQuery } from './http';

const query = z.object({ period: reportPeriodSchema.default('YTD') });

/**
 * Report 3.3 Vermögensverläufe (`/api/networth-history?period=`): the net worth series and chain of
 * the Vermögen pages plus the structure by account type over the period.
 */
export function networthHistoryRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) =>
    c.json(netWorthHistory(db, today(), checkedReportPeriod(readQuery(c, query).period, today()))),
  );
  return app;
}
