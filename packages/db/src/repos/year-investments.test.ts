import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { portfolioSummary, realizedGainAsOf } from './portfolio-summary';
import { costsTaxesReport } from './portfolio-costs';
import { REPORT_TODAY, reportPortfolioFixture } from './portfolio-report-fixture';
import { seedBasics, testCtx } from './test-helpers';
import { createBooking } from './bookings';
import { yearReportRead } from './overview-reports';
import { yearInvestments } from './year-investments';

let opened: OpenedDatabase;

beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  reportPortfolioFixture(opened);
});
afterEach(() => opened.close());

const MONTHS = [
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
];

describe('yearInvestments (Jahresreport)', () => {
  it('equals the portfolio report for the same period, figure by figure', () => {
    const year = yearInvestments(opened.db, MONTHS)!;
    // The portfolio report is asked later (real today), with the same calendar range.
    const report = portfolioSummary(opened.db, {
      today: REPORT_TODAY,
      period: '2026-01..2026-08',
      view: 'securities',
    }).performance!;
    expect(year.performance).toEqual({
      from: report.from,
      to: report.to,
      startValueCents: report.startValueCents,
      endValueCents: report.endValueCents,
      contributionsCents: report.contributionsCents,
      gainCents: report.gainCents,
      ttwror: report.ttwror,
      moneyWeighted: report.moneyWeighted,
    });
    expect(year.performance!.gainCents).toBe(
      year.performance!.endValueCents -
        year.performance!.startValueCents -
        year.performance!.contributionsCents,
    );
    expect(year.performance!.ttwror).not.toBeNull();
  });

  it('takes income, fees and taxes of the months from the Vermögen helpers', () => {
    const year = yearInvestments(opened.db, MONTHS)!;
    // Fixture: dividend 1800 (tax 495, fee 25) and interest 1000 (tax 275) inside Jan-Aug.
    expect(year.income).toEqual({
      grossCents: 2_800,
      taxCents: 770,
      feeCents: 25,
      netCents: 2_005,
    });
    // The 12-month cost report of 17.09. covers the same trades, so its parts must agree.
    const costs = costsTaxesReport(opened.db, { today: REPORT_TODAY });
    expect(year.trading.feesCents).toBe(costs.costs.fees.totalCents);
    expect(year.trading.taxesCents).toBe(costs.taxes.totalCents);
  });

  it('counts buys, sells and savings-plan executions from the trades', () => {
    opened.sqlite.exec(`
      INSERT INTO savings_plan (id, security_id, account_id, amount_cents, day_of_month, valid_from)
        VALUES ('plan', 'etf', 'depot-a', 20000, 31, '2026-01-01');
      UPDATE trade SET savings_plan_id = 'plan', savings_month = substr(date, 1, 7) WHERE id LIKE 'buy-etf-%';`);
    const { trading } = yearInvestments(opened.db, MONTHS)!;
    expect(trading.buys).toBe(16);
    expect(trading.savingsPlanBuys).toBe(8);
    expect(trading.sells).toBe(1);
  });

  it('realised gain of the months is the difference of two stands of the one function', () => {
    const { trading } = yearInvestments(opened.db, MONTHS)!;
    const end = realizedGainAsOf(opened.db, '2026-08-31');
    const start = realizedGainAsOf(opened.db, '2025-12-31');
    expect(trading.realizedGainCents).toBe(end.realizedGainCents - start.realizedGainCents);
    expect(start.realizedGainCents).toBe(0);
    expect(trading.realizedGainCents).not.toBe(0);
    expect(end.realizedGainCents).toBe(
      portfolioSummary(opened.db, { today: '2026-08-31' }).realizedGainCents,
    );
  });

  it('counts only the included months (partial year)', () => {
    const q1 = yearInvestments(opened.db, MONTHS.slice(0, 3))!;
    expect(q1.trading.sells).toBe(0);
    expect(q1.trading.buys).toBe(6);
    expect(q1.income.grossCents).toBe(0);
    expect(yearInvestments(opened.db, [])).toBeNull();
  });
});

describe('yearReportRead (Jahresreport slice 1)', () => {
  it('split Sparquote adds up to the report Sparquote and shares the portfolio figures', () => {
    opened.sqlite.exec("INSERT INTO income_type (id, name) VALUES ('gehalt', 'Gehalt')");
    const book = (date: string, amountCents: number, split: object) =>
      createBooking(
        opened.db,
        { accountId: 'giro', date, amountCents, splits: [{ amountCents, ...split }] },
        testCtx,
      );
    for (const month of MONTHS) {
      book(`${month}-15`, 300_000, { incomeTypeId: 'gehalt' });
      book(`${month}-16`, -200_000, { categoryId: 'miete' });
    }
    const read = yearReportRead(opened.db, 2026, '2026-08-31');
    expect(read.report.months).toEqual(MONTHS);
    const split = read.savingsSplit!;
    expect(split.totalBp).toBe(read.report.totals.savingsRateBp);
    expect(split.investedBp + split.cashBp).toBe(read.report.totals.savingsRateBp);
    expect(split.savedCents).toBe(
      read.report.totals.incomeCents - read.report.totals.consumptionCents,
    );
    expect(split.investedCents).toBe(read.investments!.performance!.contributionsCents);
    expect(split.investedCents + split.cashCents).toBe(split.savedCents);
    expect(read.wealthColumns!.withMarket.deltaCents).toBe(
      read.report.netWorth!.endCents - read.report.netWorth!.startCents,
    );
  });
});
