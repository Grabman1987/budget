import { checkedReportPeriod, reportPeriodSchema } from './report-period';
import {
  bankCostsReport,
  budgetAdherence,
  contractsReport,
  fundCostsReport,
  inflationReport,
  spendingReport,
  type Db,
} from '@budget/db';
import type { SPENDING_PERIODS } from '@budget/domain';
import { monthOf } from '@budget/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { ApiError, readQuery } from './http';

/**
 * Reports of group 2, "Ausgaben und Plan" (2.1, 2.2, 2.3, 2.4, 2.6). Read-only: every figure
 * comes from the same ledger read models as Heute and Plan, and nothing is written or refreshed.
 */

const periodQuery = z.object({
  period: reportPeriodSchema.default('1J'),
});

const monthQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
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
    const { period: rawPeriod } = readQuery(c, periodQuery);
    const period = checkedReportPeriod(rawPeriod, today());
    return c.json(
      guarded(() => spendingReport(db, today(), period as (typeof SPENDING_PERIODS)[number])),
    );
  });

  // 2.2 Budgettreue inkl. 50/30/20
  app.get('/adherence', (c) => {
    const { month } = readQuery(c, monthQuery);
    return c.json(guarded(() => budgetAdherence(db, today(), month ?? monthOf(today()))));
  });

  // 2.3 Verträge und Abos
  app.get('/contracts', (c) => c.json(guarded(() => contractsReport(db, today()))));

  // 2.4 Persönliche Inflation
  app.get('/inflation', (c) => c.json(guarded(() => inflationReport(db, today()))));

  // 2.6 Bank- und Zinskosten
  app.get('/costs', (c) => c.json(guarded(() => bankCostsReport(db, today()))));

  app.get('/costs/fund', (c) => c.json(guarded(() => fundCostsReport(db, today()))));

  return app;
}
