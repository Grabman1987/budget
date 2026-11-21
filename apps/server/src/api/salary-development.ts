import {
  cpiIndexPoints,
  currentCpiSeries,
  inflationReport,
  listSalaryPayslips,
  wageComponentRules,
  type Db,
} from '@budget/db';
import {
  baseSalaryAnchor,
  baseSalarySteps,
  baseSalaryValues,
  deductionRateByYear,
  developmentValues,
  lastRaiseNetEffect,
  personalIndexMicro,
  realDevelopment,
  salaryMonthlySeries,
  salaryYears,
  sameMonthPreviousYear,
  variablePayByYear,
  yearToDate,
  type MonthValue,
  type PriceIndexPoint,
} from '@budget/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { readQuery } from './http';

/** Read-only development on the stored wage amounts and the existing price series. */
export function readSalaryDevelopment(db: Db, throughMonth: string, today: string) {
  const payslips = listSalaryPayslips(db).filter((p) => p.month <= throughMonth);
  const rules = wageComponentRules(db);
  const months = salaryMonthlySeries({ payslips, rules, to: throughMonth });
  const baseLevels = baseSalaryValues(months);
  const totalLevels = developmentValues(months);
  const needsPrices = baseLevels.some((p) => p.cents > 0) || totalLevels.some((p) => p.cents > 0);
  const officialSeries = currentCpiSeries(db);
  const personal = needsPrices ? inflationReport(db, today) : null;

  const compareTo = (index: PriceIndexPoint[]) => {
    const priceMonths = new Set(
      index
        .filter(({ indexMicro }) =>
          typeof indexMicro === 'bigint'
            ? indexMicro > 0n
            : Number.isSafeInteger(indexMicro) && indexMicro > 0,
        )
        .map(({ month }) => month),
    );
    const againstPrices = (values: MonthValue[]) => {
      const startMonth = values.find((p) => p.cents > 0 && priceMonths.has(p.month))?.month;
      return startMonth
        ? realDevelopment({ values, index, startMonth, endMonth: throughMonth })
        : null;
    };
    return { base: againstPrices(baseLevels), total: againstPrices(totalLevels) };
  };
  return {
    throughMonth,
    months,
    base: {
      anchorMonth: baseSalaryAnchor(months),
      steps: baseSalarySteps(months),
      levels: baseLevels,
    },
    years: salaryYears(months),
    yearToDate: yearToDate(months, throughMonth.slice(0, 4)),
    monthComparisons: sameMonthPreviousYear(months),
    variablePay: variablePayByYear(months, payslips, rules),
    deductionRates: deductionRateByYear(payslips),
    lastRaise: lastRaiseNetEffect(months),
    real: {
      official: {
        ...compareTo(needsPrices && officialSeries ? cpiIndexPoints(db, officialSeries) : []),
        available: officialSeries !== null,
      },
      personal: {
        ...compareTo(personalIndexMicro(personal?.points ?? [])),
        reason: personal?.insufficientReason ?? null,
      },
    },
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
    const day = today();
    return c.json(readSalaryDevelopment(db, throughMonth ?? day.slice(0, 7), day));
  });
  return app;
}
