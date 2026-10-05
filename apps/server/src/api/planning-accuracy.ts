import { planningAccuracyReport, type Db } from '@budget/db';
import { monthOf } from '@budget/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { readQuery } from './http';
import { month } from './schemas';

export function planningAccuracyRoutes(db: Db, today: () => string) {
  const app = new Hono();
  app.get('/', (c) => {
    const day = today();
    const query = readQuery(c, z.object({ month: month.optional() }));
    return c.json(planningAccuracyReport(db, query.month ?? monthOf(day), day));
  });
  return app;
}
