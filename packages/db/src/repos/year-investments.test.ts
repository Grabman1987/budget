import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { portfolioSummary, realizedGainAsOf } from './portfolio-summary';
import { costsTaxesReport } from './portfolio-costs';
import { REPORT_TODAY, reportPortfolioFixture } from './portfolio-report-fixture';
import { seedBasics, testCtx } from './test-helpers';
import { MissingFxRateError } from './errors';
import { createBooking, createTransfer } from './bookings';
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
      xirr: report.xirr,
    });
    expect(year.performance!.gainCents).toBe(
      year.performance!.endValueCents -
        year.performance!.startValueCents -
        year.performance!.contributionsCents,
    );
    expect(year.performance!.ttwror).not.toBeNull();
    expect(year.performance!.xirr).not.toBeNull();
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

describe('yearInvestments edge cases', () => {
  const addBuy = (id: string, date: string, account = 'depot-a') =>
    opened.sqlite.exec(
      `INSERT INTO trade (id, security_id, account_id, date, kind, units_e8, amount_cents, fee_cents, tax_cents, import_key)
       VALUES ('${id}', 'etf', '${account}', '${date}', 'buy', 100000000, 10000, 0, 0, 'k-${id}')`,
    );

  it('net-booked dividend: 1800 gross, 495 tax, 25 fee, 1280 net', () => {
    expect(yearInvestments(opened.db, ['2026-06'])!.income).toEqual({
      grossCents: 1_800,
      taxCents: 495,
      feeCents: 25,
      netCents: 1_280,
    });
  });

  it('literal realised gain of the August sale', () => {
    // 5 of 20 units at 900,00 EUR basis (45,00 each): 26000 - 100 fee - 400 tax - 22500 = 3000.
    expect(yearInvestments(opened.db, ['2026-08'])!.trading.realizedGainCents).toBe(3_000);
  });

  it('counts a trade on the last day before the window to the year before, 1 January to the year', () => {
    addBuy('dec31', '2025-12-31');
    addBuy('jan01', '2026-01-01');
    const january = yearInvestments(opened.db, ['2026-01'])!.trading;
    // Fixture buys: January month end (2 buys) + the new 1 January buy; 31 December is outside.
    expect(january.buys).toBe(3);
    expect(yearInvestments(opened.db, ['2025-12'])!.trading.buys).toBe(1);
  });

  it('a year before the first trade has no investments instead of invented figures', () => {
    const early = yearInvestments(opened.db, ['2024-06']);
    expect(early?.trading.buys ?? 0).toBe(0);
    expect(early?.performance ?? null).toBeNull();
  });

  it('a missing exchange rate is raised, not estimated', () => {
    addBuy('usd-buy', '2026-03-05', 'usd');
    expect(() => yearInvestments(opened.db, MONTHS)).toThrow(MissingFxRateError);
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-03-10',
        amountCents: -500,
        splits: [{ categoryId: 'miete', amountCents: -500 }],
      },
      testCtx,
    );
    const read = yearReportRead(opened.db, 2026, '2026-08-31');
    expect(read.investments).toBeNull();
    expect(read.investmentsUnavailable).not.toBeNull();
  });

  it('rethrows errors that are not about missing rates or prices', () => {
    opened.sqlite.exec('DROP TABLE holding');
    expect(() => yearInvestments(opened.db, MONTHS)).toThrow();
  });
});

describe('yearReportRead (Jahresreport slice 1)', () => {
  it('attributes depot savings to the budget booking date and preserves the total savings rate', () => {
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
    opened.sqlite.exec(`
      INSERT INTO account (id, name, type, role, on_budget, opening_date)
      VALUES ('settlement', 'Verrechnung', 'checking', 'reserve', 0, '2025-01-01');
      UPDATE account SET reference_account_id = 'settlement' WHERE id = 'depot-a';
    `);
    createTransfer(
      opened.db,
      { fromAccountId: 'giro', toAccountId: 'settlement', date: '2025-12-31', amountCents: 20_100 },
      testCtx,
      {
        bankLegs: {
          from: { date: '2025-12-31', status: 'confirmed' },
          to: { date: '2026-01-02', status: 'confirmed' },
        },
      },
    );
    book('2025-12-15', 100_000, { incomeTypeId: 'gehalt' });
    const transfer = (
      fromAccountId: string,
      toAccountId: string,
      date: string,
      amountCents: number,
    ) => createTransfer(opened.db, { fromAccountId, toAccountId, date, amountCents }, testCtx);
    transfer('giro', 'depot-b', '2026-01-01', 60_003);
    transfer('settlement', 'giro', '2026-08-31', 1_001);
    transfer('giro', 'spar', '2026-01-05', 10_000);
    transfer('settlement', 'depot-a', '2026-01-31', 20_100);
    transfer('giro', 'depot-b', '2026-09-01', 1_000);
    const before = opened.sqlite.serialize();
    const read = yearReportRead(opened.db, 2026, '2026-08-31');
    const prior = yearReportRead(opened.db, 2025, '2026-08-31');
    expect(opened.sqlite.serialize()).toEqual(before);
    expect(prior.savingsSplit?.investedCents).toBe(20_100);
    expect(read.report.months).toEqual(MONTHS);
    const split = read.savingsSplit!;
    expect(split.totalBp).toBe(read.report.totals.savingsRateBp);
    expect(split.investedBp! + split.cashBp!).toBe(read.report.totals.savingsRateBp);
    expect(split.savedCents).toBe(
      read.report.totals.incomeCents - read.report.totals.consumptionCents,
    );
    expect(split.investedCents).toBe(59_002);
    expect(split.cashCents).toBe(740_998);
    expect(split.investedBp).toBe(246);
    expect(split.cashBp).toBe(3087);
    expect(read.investments!.performance!.contributionsCents).toBe(
      portfolioSummary(opened.db, {
        today: REPORT_TODAY,
        period: '2026-01..2026-08',
        view: 'securities',
      }).performance!.contributionsCents,
    );
    expect(split.investedCents! + split.cashCents!).toBe(split.savedCents);
    expect(read.wealthColumns!.withMarket.deltaCents).toBe(
      read.report.netWorth!.endCents - read.report.netWorth!.startCents,
    );
  });
});

describe('yearReportRead slice 2', () => {
  it('lists income by source and debt, and leaves the benchmark null when none is set', () => {
    opened.sqlite.exec("INSERT INTO income_type (id, name) VALUES ('gehalt', 'Gehalt')");
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-03-15',
        amountCents: 300_000,
        splits: [{ amountCents: 300_000, incomeTypeId: 'gehalt' }],
      },
      testCtx,
    );
    const read = yearReportRead(opened.db, 2026, '2026-08-31');
    expect(read.report.incomeBySource).toEqual([
      expect.objectContaining({ name: 'Gehalt', cents: 300_000 }),
    ]);
    expect(read.debt).toEqual({ startCents: 0, endCents: 0 });
  });
});

it('splits signed sale results and compares complete position closures for aligned months', () => {
  opened.sqlite.exec(`
    UPDATE account SET opening_date = '2025-01-01' WHERE id = 'depot-a';
    INSERT INTO security (id, name, kind, currency) VALUES ('prior', 'Synthetic prior', 'stock', 'EUR');
    INSERT INTO trade (id, security_id, account_id, date, kind, units_e8, amount_cents, fee_cents, tax_cents) VALUES
      ('prior-buy', 'prior', 'depot-a', '2025-07-01', 'buy', 100000000, 1000, 0, 0),
      ('prior-sell', 'prior', 'depot-a', '2025-08-31', 'sell', -100000000, 1750, 0, 0),
      ('prior-outside-buy', 'prior', 'depot-a', '2025-09-01', 'buy', 100000000, 1500, 0, 0),
      ('prior-outside-loss', 'prior', 'depot-a', '2025-09-02', 'sell', -100000000, 1000, 0, 0),
      ('close-div', 'div', 'depot-a', '2026-08-31', 'sell', -1500000000, 60000, 0, 0),
      ('close-coin', 'coin', 'depot-b', '2026-08-31', 'sell', -1008000000, 80000, 0, 0);
  `);
  const before = opened.sqlite.serialize();
  const { trading } = yearInvestments(opened.db, MONTHS)!;
  expect(opened.sqlite.serialize()).toEqual(before);
  expect(trading.results).toEqual({
    gainsCents: 23000,
    lossesCents: -7500,
    salesComplete: true,
    closedCount: 2,
    profitableCount: 1,
    closuresComplete: true,
    hitRateBp: 5000,
  });
  expect(trading.previousResults).toEqual({
    gainsCents: 750,
    lossesCents: 0,
    salesComplete: true,
    closedCount: 1,
    profitableCount: 1,
    closuresComplete: true,
    hitRateBp: 10000,
  });
  expect(trading.realizedGainCents).toBe(15500);
});

it('keeps an unknown basis out of a closed-position hit rate', () => {
  opened.sqlite.exec(`
    UPDATE holding SET cost_basis_cents = NULL WHERE id = 'h-div';
    UPDATE trade SET units_e8 = -2000000000 WHERE id = 'sell-1';
  `);
  expect(yearInvestments(opened.db, MONTHS)?.trading.results).toMatchObject({
    salesComplete: false,
    closedCount: 1,
    profitableCount: 0,
    closuresComplete: false,
    hitRateBp: null,
  });
});
