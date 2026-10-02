import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { costsTaxesReport } from './portfolio-costs';
import { portfolioSummary } from './portfolio-summary';
import { REPORT_TODAY, reportPortfolioFixture } from './portfolio-report-fixture';
import { seedBasics } from './test-helpers';

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
