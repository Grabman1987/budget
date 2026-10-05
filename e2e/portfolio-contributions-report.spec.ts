import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { cents, formatEuro } from '@budget/domain';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sampleTest } from './sample';

const screenshot = async (page: Page, name: string, info: TestInfo) => {
  const dir = process.env['BUDGET_CONTRIBUTIONS_EVIDENCE'];
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
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
  ).toEqual({
    innerWidth: expectedWidth,
    clientWidth: expectedWidth,
    scrollWidth: expectedWidth,
  });
};

sampleTest(
  'real sample endpoint supplies the report and period switch requests fresh data',
  async ({ page }, info) => {
    const first = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/api/portfolio' &&
        url.searchParams.get('period') === '3J' &&
        url.searchParams.get('history') === 'contributions'
      );
    });
    await page.goto('/reports/peinzahlungen?zeitraum=3J');
    const response = await first;
    expect(response.status()).toBe(200);
    const { portfolio } = (await response.json()) as {
      portfolio: {
        period: string;
        view: string;
        performance: {
          from: string;
          to: string;
          endValueCents: number;
          contributionsCents: number;
          gainCents: number;
        };
        contributionHistory: {
          from: string;
          to: string;
          startValueCents: number;
          endValueCents: number;
          contributionsCents: number;
          gainCents: number;
          months: unknown[];
          years: unknown[];
        };
      };
    };
    expect(portfolio).toMatchObject({ period: '3J', view: 'securities' });
    expect(portfolio.contributionHistory).toMatchObject({
      from: portfolio.performance.from,
      to: portfolio.performance.to,
      endValueCents: portfolio.performance.endValueCents,
      contributionsCents: portfolio.performance.contributionsCents,
      gainCents: portfolio.performance.gainCents,
    });
    expect(portfolio.contributionHistory.months).toHaveLength(36);
    expect(portfolio.contributionHistory.years).toHaveLength(4);
    await expect(page.getByTestId('contributions-end-value')).toHaveText(
      formatEuro(cents(portfolio.contributionHistory.endValueCents)),
    );
    await expect(page.getByTestId('contributions-period')).toContainText(
      portfolio.performance.from.split('-').reverse().join('.'),
    );
    await expect(page.locator('.contributions-years tbody tr')).toHaveCount(4);
    await expect(
      page.getByRole('table', {
        name: 'Je Monat im Zeitraum',
      }),
    ).toBeVisible();

    const switched = page.waitForResponse((candidate) => {
      const url = new URL(candidate.url());
      return (
        url.pathname === '/api/portfolio' &&
        url.searchParams.get('period') === '1J' &&
        url.searchParams.get('history') === 'contributions'
      );
    });
    await page.getByRole('group', { name: 'Zeitraum' }).getByRole('button', { name: '1J' }).click();
    expect((await switched).status()).toBe(200);
    await expect(page).toHaveURL(/zeitraum=1J/);

    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await accessibleAndContained(page, info.project.use.viewport!.width as number);
      await screenshot(page, `contributions-${theme}-${info.project.name}.png`, info);
    }
  },
);

sampleTest(
  'contribution report handles a fully sold portfolio, missing history and valuation errors honestly',
  async ({ page }, info) => {
    const fullSale = {
      portfolio: {
        period: '1J',
        view: 'securities',
        positions: [],
        performance: { from: '2025-09-17', to: '2026-09-17', days: 365 },
        contributionHistory: {
          daily: [
            { date: '2025-09-17', valueCents: 25_000, investedCents: 25_000 },
            { date: '2026-09-17', valueCents: 0, investedCents: 25_000 + -25_000 },
          ],
          from: '2025-09-17',
          to: '2026-09-17',
          startValueCents: 25_000,
          endValueCents: 0,
          contributionsCents: -25_000,
          gainCents: 0,
          months: [
            {
              from: '2026-08-17',
              to: '2026-09-17',
              valueCents: 0,
              investedCents: 0,
              startValueCents: 25_000,
              inflowsCents: 0,
              outflowsCents: -25_000,
              contributionsCents: -25_000,
              gainCents: 0,
            },
          ],
          years: [
            {
              year: 2026,
              months: 9,
              performance: {
                from: '2025-12-31',
                to: '2026-09-17',
                startValueCents: 25_000,
                endValueCents: 0,
                contributionsCents: -25_000,
                gainCents: 0,
                monthCount: 10,
              },
            },
          ],
        },
      },
    };
    await page.route('**/api/portfolio?*', async (route) => route.fulfill({ json: fullSale }));
    await page.goto('/reports/peinzahlungen?zeitraum=1J');
    await expect(page.getByTestId('contributions-end-value')).toHaveText('0,00 €');
    await expect(page.getByRole('group', { name: 'Maßkette Einzahlungen und Wert' })).toContainText(
      '−Nettozuflüsse / Entnahmen250 €',
    );
    await expect(page.getByText(/Keine Sparplan-/)).toBeVisible();
    await page.unroute('**/api/portfolio?*');

    await page.route('**/api/portfolio?*', async (route) =>
      route.fulfill({
        json: {
          portfolio: {
            period: '1J',
            view: 'securities',
            positions: [],
            performance: null,
            contributionHistory: null,
          },
        },
      }),
    );
    await page.reload();
    await expect(page.locator('.contributions-empty')).toContainText('keine bewertbare Historie');
    await page.unroute('**/api/portfolio?*');

    await page.route('**/api/portfolio?*', async (route) =>
      route.fulfill({
        status: 503,
        json: {
          error: 'valuation_unavailable',
          reason: 'missing_fx',
          message: 'Fehlender Wechselkurs für USD.',
        },
      }),
    );
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Fehlender Wechselkurs für USD.');
    await expect(page.getByTestId('contributions-end-value')).toHaveCount(0);
    await accessibleAndContained(page, info.project.use.viewport!.width as number);

    await page.unroute('**/api/portfolio?*');
    await page.route('**/api/portfolio?*', async (route) =>
      route.fulfill({
        json: {
          portfolio: {
            period: '1J',
            view: 'securities',
            positions: [],
            performance: { from: '2026-09-01', to: '2026-09-17', days: 16 },
            contributionHistory: {
              daily: [
                {
                  date: '2026-09-01',
                  valueCents: Number.MAX_SAFE_INTEGER,
                  investedCents: Number.MAX_SAFE_INTEGER,
                },
                {
                  date: '2026-09-17',
                  valueCents: Number.MAX_SAFE_INTEGER,
                  investedCents: Number.MAX_SAFE_INTEGER + 0,
                },
              ],
              from: '2026-09-01',
              to: '2026-09-17',
              startValueCents: Number.MAX_SAFE_INTEGER,
              endValueCents: Number.MAX_SAFE_INTEGER,
              contributionsCents: 0,
              gainCents: 0,
              months: [
                {
                  from: '2026-09-01',
                  to: '2026-09-17',
                  valueCents: Number.MAX_SAFE_INTEGER,
                  investedCents: Number.MAX_SAFE_INTEGER,
                  startValueCents: Number.MAX_SAFE_INTEGER,
                  inflowsCents: 0,
                  outflowsCents: 0,
                  contributionsCents: 0,
                  gainCents: 0,
                },
              ],
              years: [],
            },
          },
        },
      }),
    );
    await page.reload();
    await expect(page.getByTestId('contributions-chart')).toBeVisible();

    await page.unroute('**/api/portfolio?*');
    await page.route('**/api/portfolio?*', async (route) =>
      route.fulfill({
        json: {
          portfolio: {
            period: '1J',
            view: 'securities',
            positions: [],
            performance: { from: '2026-09-01', to: '2026-09-17', days: 16 },
            contributionHistory: {
              daily: [
                {
                  date: '2026-09-01',
                  valueCents: 8_000_000_000_000_000,
                  investedCents: 8_000_000_000_000_000,
                },
                {
                  date: '2026-09-17',
                  valueCents: 0,
                  investedCents: 8_000_000_000_000_000 + -9_007_199_254_740_950,
                },
              ],
              from: '2026-09-01',
              to: '2026-09-17',
              startValueCents: 8_000_000_000_000_000,
              endValueCents: 0,
              contributionsCents: -9_007_199_254_740_950,
              gainCents: 1_007_199_254_740_950,
              months: [
                {
                  from: '2026-09-01',
                  to: '2026-09-17',
                  valueCents: 0,
                  investedCents: -1_007_199_254_740_950,
                  startValueCents: 8_000_000_000_000_000,
                  inflowsCents: 0,
                  outflowsCents: -9_007_199_254_740_950,
                  contributionsCents: -9_007_199_254_740_950,
                  gainCents: 1_007_199_254_740_950,
                },
              ],
              years: [],
            },
          },
        },
      }),
    );
    await page.reload();
    await expect(page.getByTestId('contributions-chart')).toBeVisible();

    await page.unroute('**/api/portfolio?*');
    await page.route('**/api/portfolio?*', async (route) =>
      route.fulfill({
        json: {
          portfolio: {
            period: '1J',
            view: 'securities',
            positions: [],
            performance: { from: '2026-09-01', to: '2026-09-17', days: 16 },
            contributionHistory: {
              daily: [
                {
                  date: '2026-09-01',
                  valueCents: 9_007_199_254_740_949,
                  investedCents: 9_007_199_254_740_949,
                },
                {
                  date: '2026-09-17',
                  valueCents: 9_007_199_254_740_900,
                  investedCents: 9_007_199_254_740_949 + -51,
                },
              ],
              from: '2026-09-01',
              to: '2026-09-17',
              startValueCents: 9_007_199_254_740_949,
              endValueCents: 9_007_199_254_740_900,
              contributionsCents: -51,
              gainCents: 2,
              months: [
                {
                  from: '2026-09-01',
                  to: '2026-09-17',
                  valueCents: 9_007_199_254_740_900,
                  investedCents: 9_007_199_254_740_898,
                  startValueCents: 9_007_199_254_740_949,
                  inflowsCents: 0,
                  outflowsCents: -51,
                  contributionsCents: -51,
                  gainCents: 2,
                },
              ],
              years: [],
            },
          },
        },
      }),
    );
    await page.reload();
    await expect(page.getByTestId('contributions-chart')).toBeVisible();
  },
);
