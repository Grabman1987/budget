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

type AllocationPayload = {
  allocation: {
    totalCents: number;
    classes: Array<{ name: string; targetBp: number | null; breach: boolean }>;
    regions: Array<{ region: string | null }>;
    history: { dates: string[]; classes: unknown[] } | null;
  };
};

sampleTest('allocation report reads the sample ledger', async ({ page }, info) => {
  sampleTest.setTimeout(90_000);
  const first = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/portfolio/allocation-report',
  );
  await page.goto('/reports/pallocation');
  const response = await first;
  expect(response.status()).toBe(200);
  const { allocation } = (await response.json()) as AllocationPayload;
  expect(allocation.classes.length).toBeGreaterThanOrEqual(3);

  await expect(page.getByTestId('sunburst-classes')).toBeVisible();
  await expect(page.getByTestId('sunburst-regions')).toBeVisible();
  await expect(page.getByTestId('alloc-total')).toHaveText(
    formatEuro(cents(allocation.totalCents)),
  );
  await expect(page.getByTestId('soll-ist-chart')).toBeVisible();
  await expect(page.getByTestId('soll-table').locator('tbody tr')).toHaveCount(
    allocation.classes.length,
  );
  await expect(page.getByTestId('soll-table')).toContainText('Aktien Welt');
  await expect(page.getByTestId('speculative-note')).toContainText('R15');
  await expect(page.getByRole('table', { name: 'Regionen' })).toContainText('Nordamerika');
  await expect(page.getByRole('link', { name: 'ETF Welt' }).first()).toHaveAttribute(
    'href',
    /produkt=/,
  );

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await accessibleAndContained(page, info.project.use.viewport!.width as number);
    await screenshot(page, `allocation-${theme}-${info.project.name}.png`, info);
  }
});

const mock = (overrides: Record<string, unknown>) => ({
  allocation: {
    asOf: '2026-09-17',
    totalCents: 100_000,
    targetSet: {
      source: 'dated',
      tierLabel: null,
      upToCents: null,
      position: null,
      count: null,
      investmentSumCents: null,
      sumUnavailable: false,
    },
    classes: [
      {
        assetClassId: 'a',
        name: 'Klasse A',
        valueCents: 60_000,
        shareBp: 6_000,
        targetBp: 4_000,
        bandBp: 500,
        deviationBp: 2_000,
        breach: true,
        products: [
          {
            securityId: 'p1',
            name: 'Produkt 1',
            valueCents: 60_000,
            shareBp: 6_000,
            depots: ['Depot X'],
            ttwror12: null,
          },
        ],
      },
      {
        assetClassId: null,
        name: 'Ohne Anlageklasse',
        valueCents: 40_000,
        shareBp: 4_000,
        targetBp: null,
        bandBp: null,
        deviationBp: null,
        breach: false,
        products: [
          {
            securityId: 'p2',
            name: 'Produkt 2',
            valueCents: 40_000,
            shareBp: 4_000,
            depots: ['Depot X'],
            ttwror12: 0.05,
          },
        ],
      },
    ],
    regions: [
      {
        region: null,
        valueCents: 100_000,
        shareBp: 10_000,
        products: [
          { securityId: 'p1', name: 'Produkt 1', valueCents: 60_000 },
          { securityId: 'p2', name: 'Produkt 2', valueCents: 40_000 },
        ],
      },
    ],
    regionsComplete: false,
    speculative: {
      totalCents: 100_000,
      valueCents: 0,
      shareBp: 0,
      limitBp: 1_000,
      overCents: 0,
      breach: false,
    },
    history: null,
    ...overrides,
  },
});

sampleTest(
  'allocation report is honest about breaches, missing regions, history and errors',
  async ({ page }, info) => {
    sampleTest.setTimeout(60_000);
    await page.route('**/api/portfolio/allocation-report', (route) =>
      route.fulfill({ json: mock({}) }),
    );
    await page.goto('/reports/pallocation');
    await expect(page.getByTestId('soll-table')).toContainText('außerhalb des Bands (R13', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('soll-table')).toContainText('kein Soll hinterlegt');
    await expect(page.getByText('Ohne Regionsangabe: Produkt 1, Produkt 2.')).toBeVisible();
    await expect(
      page.getByText('Für den Verlauf liegt keine bewertbare Historie vor.'),
    ).toBeVisible();
    await accessibleAndContained(page, info.project.use.viewport!.width as number);
    await page.unroute('**/api/portfolio/allocation-report');

    await page.route('**/api/portfolio/allocation-report', (route) =>
      route.fulfill({ json: mock({ totalCents: 0, classes: [], regions: [] }) }),
    );
    await page.reload();
    await expect(
      page.getByRole('status').filter({ hasText: 'keine Wertpapierpositionen' }),
    ).toBeVisible({ timeout: 15_000 });
    await page.unroute('**/api/portfolio/allocation-report');

    await page.route('**/api/portfolio/allocation-report', (route) =>
      route.fulfill({
        status: 503,
        json: { error: 'valuation_unavailable', message: 'Fehlender Wechselkurs für USD.' },
      }),
    );
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Fehlender Wechselkurs für USD.');
    await expect(page.getByTestId('sunburst-classes')).toHaveCount(0);
  },
);
