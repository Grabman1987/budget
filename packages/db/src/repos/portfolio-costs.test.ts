import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { ratioBp } from '@budget/domain';
import { categoryGroup } from '../schema';
import { createBooking } from './bookings';
import { categories, createEntity } from './entities';
import { bankCostsReport } from './bank-costs-report';
import { annualCostsReport, costsTaxesReport } from './portfolio-costs';
import { portfolioSummary } from './portfolio-summary';
import { REPORT_TODAY, reportPortfolioFixture } from './portfolio-report-fixture';
import { seedBasics, testCtx as ctx } from './test-helpers';

let opened: OpenedDatabase;

beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  reportPortfolioFixture(opened);
});
afterEach(() => opened.close());

describe('costsTaxesReport (report 4.5)', () => {
  it('uses the costs and income of the portfolio summary, figure by figure', () => {
    const report = costsTaxesReport(opened.db, { today: REPORT_TODAY });
    const summary = portfolioSummary(opened.db, { today: REPORT_TODAY });
    expect(report.valueCents).toBe(summary.valueCents);
    expect(report.costs.terCents).toBe(summary.costs.terCents);
    expect(report.costs.fees.totalCents).toBe(summary.costs.feesCents);
    expect(report.costs.totalCents).toBe(summary.costs.totalCents);
    expect(report.costs.costRateBp).toBe(summary.costs.costRateBp);
    expect(report.net.grossCents).toBe(summary.income.grossCents);
    expect(report.taxes.onIncomeCents).toBe(summary.income.taxCents);
    expect(report.income.dividend.feeCents + report.income.interest.feeCents).toBe(
      summary.income.feeCents,
    );
  });

  it('shows the taxes the broker booked and never a computed withholding', () => {
    const report = costsTaxesReport(opened.db, { today: REPORT_TODAY });
    // Fixture: dividend tax 495, interest tax 275, sale tax 400, tax booking 80.
    expect(report.taxes).toMatchObject({
      dividendCents: 495,
      interestCents: 275,
      saleCents: 400,
      bookingCents: 80,
      onIncomeCents: 770,
      totalCents: 770 + 400 + 80,
    });
    // 27,5 % of the gross income would be 770; the report takes the booked figure, so changing
    // the booked tax changes the report while the gross stays.
    opened.sqlite.exec("UPDATE trade SET tax_cents = 111 WHERE id = 'div-1'");
    const changed = costsTaxesReport(opened.db, { today: REPORT_TODAY });
    expect(changed.taxes.dividendCents).toBe(111);
    expect(changed.income.dividend.grossCents).toBe(report.income.dividend.grossCents);
  });

  it('chains gross income, tax on income and costs to the net', () => {
    const report = costsTaxesReport(opened.db, { today: REPORT_TODAY });
    expect(report.net.grossCents).toBe(1_800 + 1_000);
    expect(report.net.taxOnIncomeCents).toBe(770);
    expect(report.net.costsCents).toBe(report.costs.terCents + report.costs.fees.totalCents);
    expect(report.net.netCents).toBe(
      report.net.grossCents - report.net.taxOnIncomeCents - report.net.costsCents,
    );
    // Order fees: 8 ETF buys x 100 and the sale 100; income fee 25; fee booking 120.
    expect(report.costs.fees).toMatchObject({
      orderCents: 8 * 100 + 100,
      incomeCents: 25,
      bookingCents: 120,
    });
  });

  it('computes the latent tax per product from the unrealised gain only', () => {
    const report = costsTaxesReport(opened.db, { today: REPORT_TODAY });
    const summary = portfolioSummary(opened.db, { today: REPORT_TODAY });
    for (const p of report.products) {
      const line = summary.positions.find((l) => l.securityId === p.securityId);
      expect(p.unrealizedGainCents).toBe(line?.gainCents ?? 0);
      const gain = p.unrealizedGainCents ?? 0;
      expect(p.latentTaxCents).toBe(gain > 0 ? Math.round(gain * 0.275) : 0);
    }
    expect(report.latent.totalCents).toBe(
      report.products.reduce((sum, p) => sum + (p.latentTaxCents ?? 0), 0),
    );
    expect(report.latent.rateBp).toBe(2_750);
    expect(report.latent.complete).toBe(true);
  });

  it('marks the latent tax incomplete when a basis is undocumented', () => {
    // A position without opening basis and a buy with unknown units basis stays unknown.
    opened.sqlite.exec(
      "UPDATE holding SET cost_basis_cents = NULL WHERE id = 'h-coin'; DELETE FROM trade WHERE security_id = 'coin' AND kind = 'buy';",
    );
    const report = costsTaxesReport(opened.db, { today: REPORT_TODAY });
    const coin = report.products.find((p) => p.securityId === 'coin')!;
    expect(coin.latentTaxCents).toBeNull();
    expect(report.latent.complete).toBe(false);
  });

  it('carries product costs and income, including a product that was sold out', () => {
    const report = costsTaxesReport(opened.db, { today: REPORT_TODAY });
    const etf = report.products.find((p) => p.securityId === 'etf')!;
    expect(etf).toMatchObject({ terBp: 20, incomeGrossCents: 0 });
    expect(etf.terCents).toBeGreaterThan(0);
    const dividendStock = report.products.find((p) => p.securityId === 'div')!;
    expect(dividendStock).toMatchObject({ incomeGrossCents: 1_800, incomeTaxCents: 495 });
    expect(report.products.reduce((sum, p) => sum + p.terCents, 0)).toBe(report.costs.terCents);
  });

  it('is empty and honest without any history', () => {
    const empty = createTestDatabase();
    try {
      const report = costsTaxesReport(empty.db, { today: REPORT_TODAY });
      expect(report).toMatchObject({
        valueCents: 0,
        products: [],
        net: { grossCents: 0, netCents: 0 },
        latent: { totalCents: 0, complete: true },
      });
    } finally {
      empty.close();
    }
  });
});

it('uses the same calendar dates for booked costs, TER, taxes and the closing valuation', () => {
  const { db } = opened;
  createEntity(db, categoryGroup, { id: 'bank-costs', name: 'Bank und Gebühren' }, ctx);
  for (const [id, name] of [
    ['account-fees', 'Kontoführung'],
    ['overdraft', 'Sollzinsen'],
    ['interest', 'Zinsen'],
  ]) {
    categories.create(db, { id: id!, name: name!, groupId: 'bank-costs', class: 'need' }, ctx);
  }
  for (const [date, categoryId, amountCents] of [
    ['2025-12-31', 'account-fees', -101],
    ['2026-01-01', 'account-fees', -203],
    ['2026-01-01', 'overdraft', -305],
    ['2026-09-17', 'interest', -407],
    ['2026-09-18', 'account-fees', -509],
  ] as const) {
    createBooking(
      db,
      {
        accountId: 'giro',
        date,
        amountCents,
        splits: [{ categoryId, amountCents }],
      },
      ctx,
    );
  }
  createBooking(
    db,
    {
      accountId: 'giro',
      date: '2026-09-17',
      amountCents: -1000,
      originalCurrency: 'USD',
      originalAmountCents: -983,
      fxRateMicro: 1_000_000,
      fxFeeCents: -17,
      splits: [{ amountCents: -1000 }],
    },
    ctx,
  );
  const before = opened.sqlite.serialize();
  const years = annualCostsReport(db, REPORT_TODAY);
  expect(opened.sqlite.serialize()).toEqual(before);
  expect(
    years.slice(0, 2).map(({ year, from, to, partial }) => ({ year, from, to, partial })),
  ).toEqual([
    { year: 2026, from: '2026-01-01', to: '2026-09-17', partial: true },
    { year: 2025, from: '2025-01-01', to: '2025-12-31', partial: false },
  ]);
  for (const { from, to, total, bankParts } of years) {
    const bank = bankCostsReport(opened.db, to, { from, to });
    const portfolio = costsTaxesReport(opened.db, { today: to });
    expect(total).not.toBeNull();
    if (!total) throw new Error('Expected annual figures');
    const tradeFees = bank.rows.find(({ key }) => key === 'orders')?.cents ?? 0;
    expect(bankParts).toEqual(bank.rows.map(({ key, name, cents }) => ({ key, name, cents })));
    expect(tradeFees).toBe(portfolio.costs.fees.totalCents);
    expect(total.householdCents).toBe(bank.totalCents - tradeFees - bank.portfolioAccountFeeCents);
    expect(total.portfolioFeeCents).toBe(tradeFees + bank.portfolioAccountFeeCents);
    // TER is rounded once per security over the selected period.
    expect(total.terCents).toBe(from.startsWith('2026') ? 806 : portfolio.costs.terCents);
    expect(total.ratioBp).toBe(
      portfolio.valueCents > 0 ? ratioBp(total.portfolioCostCents, portfolio.valueCents) : null,
    );
    expect(total.taxCents).toBe(portfolio.taxes.totalCents);
    expect(total.totalCents).toBe(bank.totalCents + total.terCents + portfolio.taxes.totalCents);
  }
  expect(years[0]?.total).toMatchObject({
    householdCents: 932,
    portfolioFeeCents: 1045,
    terCents: 806,
    taxCents: 1250,
    totalCents: 4033,
  });
  expect(years[0]?.bankParts.map(({ key, cents }) => [key, cents])).toEqual([
    ['interest', 407],
    ['account', 203],
    ['orders', 1045],
    ['fx', 17],
    ['overdraft', 305],
  ]);
  expect(years[1]?.total).toMatchObject({
    householdCents: 101,
    portfolioFeeCents: 0,
    taxCents: 0,
    ratioBp: 1,
  });
});
