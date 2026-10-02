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

type DepotsPayload = {
  depots: {
    period: string;
    window: { from: string; to: string } | null;
    benchmark: { name: string } | null;
    depots: Array<{ accountId: string; name: string; valueCents: number; shareBp: number }>;
    total: { valueCents: number; performance: { ttwror: number } } | null;
  };
};

sampleTest(
  'depot comparison reads the sample ledger and switches the period',
  async ({ page }, info) => {
    sampleTest.setTimeout(90_000);
    const first = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/portfolio/depots' && url.searchParams.get('period') === '1J';
    });
    await page.goto('/reports/pdepots?zeitraum=1J');
    const response = await first;
    expect(response.status()).toBe(200);
    const { depots } = (await response.json()) as DepotsPayload;
    expect(depots.depots.length).toBeGreaterThanOrEqual(3);
    expect(depots.depots.reduce((sum, d) => sum + d.shareBp, 0)).toBe(10_000);

    // One drawing per depot plus the total, with the value from the read model.
    await expect(page.getByTestId('depot')).toHaveCount(depots.depots.length);
    await expect(page.getByTestId('depot-value').last()).toHaveText(
      formatEuro(cents(depots.total!.valueCents)),
    );
    await expect(page.getByRole('heading', { name: 'Alle Depots', level: 3 })).toBeVisible();
    await expect(page.getByRole('table', { name: /Rechnung Alle Depots/ })).toContainText('= Wert');
    await expect(page.getByTestId('depot-chart').first()).toBeVisible();

    // Figures side by side: one column per depot and the total.
    const kpi = page.locator('.depots-kpi table');
    await expect(kpi.locator('thead th')).toHaveCount(depots.depots.length + 2);
    await expect(kpi.getByRole('row', { name: /^TTWROR/ })).toBeVisible();
    await expect(kpi.getByRole('row', { name: /^Anteil/ })).toContainText('%');

    // A product opens on the Portfolio page (decisions are made there).
    const link = page.getByRole('link', { name: 'ETF Welt' }).first();
    await expect(link).toHaveAttribute('href', /\/vermoegen\/portfolio\?.*produkt=/);

    const switched = page.waitForResponse((candidate) => {
      const url = new URL(candidate.url());
      return url.pathname === '/api/portfolio/depots' && url.searchParams.get('period') === '3M';
    });
    await page.getByRole('group', { name: 'Zeitraum' }).getByRole('button', { name: '3M' }).click();
    expect((await switched).status()).toBe(200);
    await expect(page).toHaveURL(/zeitraum=3M/);
    await expect(page.getByTestId('depot')).toHaveCount(depots.depots.length);

    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await accessibleAndContained(page, info.project.use.viewport!.width as number);
      await screenshot(page, `depots-${theme}-${info.project.name}.png`, info);
    }
  },
);

sampleTest(
  'depot comparison is honest about missing history and valuation errors',
  async ({ page }, info) => {
    sampleTest.setTimeout(60_000);
    await page.route('**/api/portfolio/depots?*', (route) =>
      route.fulfill({
        json: {
          depots: {
            asOf: '2026-09-17',
            period: '1J',
            window: null,
            benchmark: null,
            benchmarkIndex: null,
            depots: [],
            total: null,
          },
        },
      }),
    );
    await page.goto('/reports/pdepots?zeitraum=1J');
    await expect(
      page.getByRole('status').filter({ hasText: 'keine bewertbare Historie' }),
    ).toBeVisible();
    await expect(page.getByTestId('depot')).toHaveCount(0);
    await page.unroute('**/api/portfolio/depots?*');

    await page.route('**/api/portfolio/depots?*', (route) =>
      route.fulfill({
        status: 503,
        json: {
          error: 'valuation_unavailable',
          reason: 'missing_price',
          message: 'Ein benötigter Wertpapierkurs fehlt bis einschließlich 17.09.2026.',
        },
      }),
    );
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Wertpapierkurs fehlt');
    await expect(page.getByTestId('depot')).toHaveCount(0);
    await accessibleAndContained(page, info.project.use.viewport!.width as number);
  },
);
