import { netWorthHistory, type Db } from '@budget/db';
import type { Period } from '@budget/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { readQuery } from './http';

const PERIODS = ['1M', '3M', 'YTD', '1J', '3J', 'Alles'] as const satisfies readonly Period[];
const query = z.object({ period: z.enum(PERIODS).default('YTD') });

/**
 * Report 3.3 Vermögensverläufe (`/api/networth-history?period=`): the net worth series and chain of
 * the Vermögen pages plus the structure by account type over the period.
 */
export function networthHistoryRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json(netWorthHistory(db, today(), readQuery(c, query).period)));
  return app;
}
