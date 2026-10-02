import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { cents, formatEuro } from '@budget/domain';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sampleTest } from './sample';

const screenshot = async (page: Page, name: string, info: TestInfo) => {
  const dir = process.env['BUDGET_PORTFOLIO_REPORT_EVIDENCE'];
  if (dir) mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: dir ? join(dir, name) : info.outputPath(name),
    fullPage: true,
    animations: 'disabled',
  });
};
const accessibleAndContained = async (page: Page, expectedWidth: number) => {
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
    [],
  );
  expect(
    await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
  ).toEqual({ innerWidth: expectedWidth, scrollWidth: expectedWidth });
};

type CostsPayload = {
  costs: {
    net: { grossCents: number; taxOnIncomeCents: number; costsCents: number; netCents: number };
    taxes: { onIncomeCents: number };
    latent: { totalCents: number; complete: boolean };
    products: Array<{ name: string }>;
  };
};

sampleTest(
  'costs report reads the sample ledger and shows broker taxes as booked',
  async ({ page }, info) => {
    sampleTest.setTimeout(90_000);
    const first = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/portfolio/costs-taxes',
    );
    await page.goto('/reports/psteuern');
    const response = await first;
    expect(response.status()).toBe(200);
    const { costs } = (await response.json()) as CostsPayload;
    expect(costs.products.length).toBeGreaterThanOrEqual(5);

    await expect(page.getByTestId('costs-net')).toHaveText(formatEuro(cents(costs.net.netCents)));
    await expect(page.getByTestId('latent-tax')).toHaveText(
      formatEuro(cents(costs.latent.totalCents)),
    );
    const chain = page.getByRole('group', { name: 'Maßkette Kosten und Steuern' });
    await expect(chain).toContainText('Erträge brutto');
    await expect(chain).toContainText('Steuern auf Erträge');
    await expect(chain).toContainText('Gebühren und TER');
    await expect(chain).toContainText(
      formatEuro(cents(costs.net.taxOnIncomeCents)).replace('.', ','),
    );
    await expect(page.getByText('keine zweite Quellensteuer')).toBeVisible();
    await expect(page.getByText('Beispielrechnung, keine Steuerberatung')).toBeVisible();
    await expect(page.getByTestId('cost-rate')).toContainText('Ziel ≤ 0,30 %');
    await expect(page.getByTestId('costs-products').locator('tbody tr')).toHaveCount(
      costs.products.length + 1,
    );
    await expect(page.getByRole('link', { name: 'ETF Welt' }).first()).toHaveAttribute(
      'href',
      /produkt=/,
    );

    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await accessibleAndContained(page, info.project.use.viewport!.width as number);
      await screenshot(page, `costs-${theme}-${info.project.name}.png`, info);
    }
  },
);

const zeroIncome = { grossCents: 0, taxCents: 0, feeCents: 0 };
const mock = (overrides: Record<string, unknown>) => ({
  costs: {
    asOf: '2026-09-17',
    from: '2025-09-17',
    to: '2026-09-17',
    valueCents: 500_000,
    income: {
      dividend: { grossCents: 10_000, taxCents: 2_750, feeCents: 0 },
      interest: zeroIncome,
      grossCents: 10_000,
    },
    taxes: {
      dividendCents: 2_750,
      interestCents: 0,
      saleCents: 1_000,
      purchaseCents: 0,
      bookingCents: 500,
      onIncomeCents: 2_750,
      totalCents: 4_250,
    },
    costs: {
      terCents: 20_000,
      fees: { orderCents: 300, incomeCents: 0, bookingCents: 0, otherCents: 50, totalCents: 350 },
      totalCents: 20_350,
      costRateBp: 41,
      targetBp: 30,
    },
    net: { grossCents: 10_000, taxOnIncomeCents: 2_750, costsCents: 20_350, netCents: -13_100 },
    latent: { rateBp: 2_750, totalCents: 55_000, complete: false },
    products: [
      {
        securityId: 'p1',
        name: 'Produkt 1',
        kind: 'etf',
        valueCents: 400_000,
        costBasisCents: 200_000,
        unrealizedGainCents: 200_000,
        latentTaxCents: 55_000,
        terBp: 50,
        terCents: 20_000,
        feesCents: 300,
        incomeGrossCents: 10_000,
        incomeTaxCents: 2_750,
      },
      {
        securityId: 'p2',
        name: 'Produkt 2',
        kind: 'crypto',
        valueCents: 100_000,
        costBasisCents: null,
        unrealizedGainCents: null,
        latentTaxCents: null,
        terBp: 0,
        terCents: 0,
        feesCents: 50,
        incomeGrossCents: 0,
        incomeTaxCents: 0,
      },
    ],
    ...overrides,
  },
});

sampleTest(
  'costs report is honest about a negative net, a missing basis, an empty year and errors',
  async ({ page }, info) => {
    sampleTest.setTimeout(60_000);
    await page.route('**/api/portfolio/costs-taxes', (route) => route.fulfill({ json: mock({}) }));
    await page.goto('/reports/psteuern');
    await expect(page.getByTestId('costs-net')).toHaveText('−131,00 €', { timeout: 20_000 });
    await expect(page.getByRole('status').filter({ hasText: 'Einstand fehlt' })).toHaveCount(0);
    await expect(page.getByText('fehlt der dokumentierte Einstand')).toBeVisible();
    await expect(page.getByTestId('cost-rate')).toContainText('überschritten');
    await expect(page.getByTestId('costs-other-taxes')).toHaveText('−15,00 €');
    await expect(page.getByText('Sonstige Gebühren')).toBeVisible();
    await accessibleAndContained(page, info.project.use.viewport!.width as number);
    await page.unroute('**/api/portfolio/costs-taxes');

    await page.route('**/api/portfolio/costs-taxes', (route) =>
      route.fulfill({
        json: mock({
          products: [],
          income: { dividend: zeroIncome, interest: zeroIncome, grossCents: 0 },
          net: { grossCents: 0, taxOnIncomeCents: 0, costsCents: 0, netCents: 0 },
          costs: {
            terCents: 0,
            fees: { orderCents: 0, incomeCents: 0, bookingCents: 0, otherCents: 0, totalCents: 0 },
            totalCents: 0,
            costRateBp: 0,
            targetBp: 30,
          },
        }),
      }),
    );
    await page.reload();
    await expect(
      page.getByRole('status').filter({ hasText: 'weder Erträge noch Kosten' }),
    ).toBeVisible({ timeout: 15_000 });
    await page.unroute('**/api/portfolio/costs-taxes');

    await page.route('**/api/portfolio/costs-taxes', (route) =>
      route.fulfill({
        status: 503,
        json: { error: 'valuation_unavailable', message: 'Fehlender Wechselkurs für USD.' },
      }),
    );
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Fehlender Wechselkurs für USD.');
    await expect(page.getByTestId('costs-net')).toHaveCount(0);
  },
);
