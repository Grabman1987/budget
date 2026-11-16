import { listSalaryPayslips, wageComponentRules, type Db } from '@budget/db';
import {
  baseSalaryAnchor,
  baseSalarySteps,
  deductionRateByYear,
  lastRaiseNetEffect,
  salaryMonthlySeries,
  salaryYears,
  sameMonthPreviousYear,
  variablePayByYear,
  yearToDate,
} from '@budget/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { readQuery } from './http';

/** Read-only nominal development; the stored totals and wage mappings remain authoritative. */
export function readSalaryDevelopment(db: Db, throughMonth: string) {
  const payslips = listSalaryPayslips(db).filter((p) => p.month <= throughMonth);
  const rules = wageComponentRules(db);
  const months = salaryMonthlySeries({ payslips, rules, to: throughMonth });
  return {
    throughMonth,
    months,
    base: { anchorMonth: baseSalaryAnchor(months), steps: baseSalarySteps(months) },
    years: salaryYears(months),
    yearToDate: yearToDate(months, throughMonth.slice(0, 4)),
    monthComparisons: sameMonthPreviousYear(months),
    variablePay: variablePayByYear(months, payslips, rules),
    deductionRates: deductionRateByYear(payslips),
    lastRaise: lastRaiseNetEffect(months),
  };
}

export function salaryDevelopmentRoutes(db: Db, today: () => string) {
  const app = new Hono();
  app.get('/', (c) => {
    const { throughMonth } = readQuery(
      c,
      z.strictObject({
        throughMonth: z
          .string()
          .regex(/^20\d{2}-(0[1-9]|1[0-2])$/)
          .optional(),
      }),
    );
    return c.json(readSalaryDevelopment(db, throughMonth ?? today().slice(0, 7)));
  });
  return app;
}
