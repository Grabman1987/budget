import {
  monthFlowReport,
  monthIncomeReport,
  monthOnePager,
  MonthInFutureError,
  type Db,
} from '@budget/db';
import { monthOf } from '@budget/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { ApiError, readQuery } from './http';

const query = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  span: z.enum(['month', 'year']).optional(),
});

/**
 * Reports of the group "Monat und Einkommen": `/onepager` (1.1), `/income` (1.3) and `/flow`
 * (1.4). All read the same ledger facts as Heute and Plan; `?month=YYYY-MM` defaults to the month
 * of today and a later month is refused.
 */
export function monthReportRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  const run = <T>(month: string | undefined, read: (day: string, month: string) => T): T => {
    const day = today();
    try {
      return read(day, month ?? monthOf(day));
    } catch (error) {
      if (error instanceof MonthInFutureError)
        throw new ApiError(422, 'month_in_future', 'A report exists only up to the current month');
      throw error;
    }
  };
  app.get('/onepager', (c) => {
    const { month } = readQuery(c, query);
    return c.json(run(month, (day, m) => monthOnePager(db, day, m)));
  });
  app.get('/income', (c) => {
    const { month } = readQuery(c, query);
    return c.json(run(month, (day, m) => monthIncomeReport(db, day, m)));
  });
  app.get('/flow', (c) => {
    const { month, span } = readQuery(c, query);
    return c.json(run(month, (day, m) => monthFlowReport(db, day, m, span ?? 'month')));
  });
  return app;
}
