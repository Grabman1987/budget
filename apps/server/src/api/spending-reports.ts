import { spendingReport, type Db } from '@budget/db';
import { SPENDING_PERIODS } from '@budget/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { ApiError, readQuery } from './http';

/**
 * Reports of group 2, "Ausgaben und Plan" (2.1, 2.2, 2.3, 2.4, 2.6). Read-only: every figure
 * comes from the same ledger read models as Heute and Plan, and nothing is written or refreshed.
 */

const periodQuery = z.object({
  period: z.enum(SPENDING_PERIODS as [string, ...string[]]).default('1J'),
});

/** The one place that turns "the sum left the safe integer range" into a clear answer. */
function guarded<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof RangeError && /safe integer cents|safe integer/i.test(error.message))
      throw new ApiError(
        422,
        'calculation_limit',
        'Die Summe überschreitet den sicheren Centbereich.',
      );
    throw error;
  }
}

export function spendingReportRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();

  // 2.1 Ausgabenanalyse
  app.get('/analysis', (c) => {
    const { period } = readQuery(c, periodQuery);
    return c.json(
      guarded(() => spendingReport(db, today(), period as (typeof SPENDING_PERIODS)[number])),
    );
  });

  return app;
}
