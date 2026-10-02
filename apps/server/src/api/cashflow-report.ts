import { cashflowReport, type Db } from '@budget/db';
import type { Period } from '@budget/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { readQuery } from './http';

const PERIODS = ['1M', '3M', 'YTD', '1J', '3J', 'Alles'] as const satisfies readonly Period[];
const query = z.object({ period: z.enum(PERIODS).default('1J') });

/**
 * Report 3.2 Cashflow-Verlauf (`/api/cashflow?period=`): income, consumption and net cashflow per
 * full month of the budget accounts; Kapitalerträge as a separate series.
 */
export function cashflowRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json(cashflowReport(db, today(), readQuery(c, query).period)));
  return app;
}
