import { checkedReportPeriod, reportPeriodSchema } from './report-period';
import { assetsDebtsHistory, type Db } from '@budget/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { readQuery } from './http';

const query = z.object({ period: reportPeriodSchema.default('Alles') });

/**
 * Report "Vermögen & Schulden" (`/api/assets-debts-history?period=`): assets and debts at every
 * month end with the accounts behind them, from the same valuation as Vermögen › Nettovermögen.
 */
export function assetsDebtsHistoryRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) =>
    c.json(
      assetsDebtsHistory(db, today(), checkedReportPeriod(readQuery(c, query).period, today())),
    ),
  );
  return app;
}
