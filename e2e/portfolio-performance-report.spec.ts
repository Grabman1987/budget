import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { cents, formatEuro } from '@budget/domain';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { MAIN_URL } from '../playwright.config';
import { sampleTest } from './sample';

type PerformanceFixture = {
  from: string;
  to: string;
  days: number;
  monthCount: number;
  startValueCents: number;
  contributionsCents: number;
  gainCents: number;
  endValueCents: number;
  ttwror: number | null;
  ttwrorAnnualised: number | null;
  moneyWeighted: number | null;
  xirr: number | null;
};

const performance: PerformanceFixture = {
  from: '2025-09-17',
  to: '2026-09-17',
  days: 366,
  monthCount: 12,
  startValueCents: 100_000,
  contributionsCents: -112_300,
  gainCents: 12_300,
  endValueCents: 0,
  ttwror: 0.123,
  ttwrorAnnualised: 0.456,
  moneyWeighted: 0.118,
  xirr: 0.121,
};

function summary(
  overrides: {
    period?: string;
    performance?: PerformanceFixture | null;
    realizedGainCents?: number;
    realizedGainComplete?: boolean;
  } = {},
) {
  return {
    portfolio: {
      period: overrides.period ?? 'YTD',
      view: 'securities',
      positions: [],
      performance: overrides.performance === undefined ? { ...performance } : overrides.performance,
      realizedGainCents: overrides.realizedGainCents ?? 123_456,
      realizedGainComplete: overrides.realizedGainComplete ?? true,
    },
  };
}

async function checkAccessibility(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}

async function evidenceScreenshot(page: Page, name: string, info: TestInfo) {
  const dir = process.env['BUDGET_PORTFOLIO_REPORT_EVIDENCE'];
  if (dir) mkdirSync(dir, { recursive: true });
  await page.screenshot({
    fullPage: true,
    animations: 'disabled',
    path: dir ? join(dir, name) : info.outputPath(name),
  });
}

test('Renditebericht reads period metrics and lifetime gains with an empty open-position list', async ({
  page,
}, info) => {
  const requested: string[] = [];
  await page.route('**/api/portfolio?*', async (route) => {
    const url = new URL(route.request().url());
    const selectedPeriod = url.searchParams.get('period') ?? 'YTD';
    requested.push(selectedPeriod);
    const response = summary({ period: selectedPeriod });
    if (selectedPeriod === '3M' && response.portfolio.performance) {
      response.portfolio.performance = {
        ...response.portfolio.performance,
        from: '2026-06-17',
        to: '2026-09-17',
        days: 92,
        monthCount: 3,
        contributionsCents: -10_000,
        gainCents: -90_000,
        endValueCents: 0,
      };
    }
    await route.fulfill({ json: response });
  });
  await page.goto('/reports/prendite?zeitraum=1J');

  await expect(
    page.getByRole('heading', { name: 'Rendite und Kennzahlen', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('period-ttwror')).toHaveText('+12,3 %');
  await expect(page.getByText('TTWROR im Zeitraum')).toBeVisible();
  await expect(page.getByText('TTWROR annualisiert')).toBeVisible();
  await expect(
    page.locator('.performance-metric').filter({ hasText: 'TTWROR annualisiert' }).locator('dd'),
  ).toHaveText('+45,6 %');
  await expect(page.getByText('annualisiert', { exact: true })).toBeVisible();
  await expect(page.getByTestId('realized-gain')).toHaveText('+1.234,56 €');
  await expect(page.getByRole('heading', { name: /Wertpapiere · letzte 12 Monate/ })).toBeVisible();
  await expect(page.getByText('Ansicht ohne Depotkassa')).toBeVisible();
  await expect(page.getByText(/keine Wertpapierpositionen offen/)).toBeVisible();
  expect(requested).toContain('1J');

  const period = page.getByRole('group', { name: 'Zeitraum' });
  await period.getByRole('button', { name: '3M', exact: true }).click();
  await expect(page).toHaveURL(/zeitraum=3M/);
  await expect.poll(() => requested.includes('3M')).toBe(true);
  await expect(page.getByRole('heading', { name: /Wertpapiere · letzte 3 Monate/ })).toBeVisible();
  const chain = page.getByRole('group', { name: /Maßkette Portfolioleistung/ });
  const netflows = chain.locator('.ct-pair').filter({ hasText: 'Nettozuflüsse' });
  await expect(netflows).toContainText('−');
  await expect(netflows).toContainText('100 €');

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await checkAccessibility(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await evidenceScreenshot(
      page,
      `portfolio-performance-fixture-${theme}-${info.project.name}.png`,
      info,
    );
  }
});

test('incomplete realized history is labelled and valuation failure hides all summary figures', async ({
  page,
}) => {
  let failWithValuationGap = false;
  let recovered = false;
  const responses: string[] = [];
  await page.route('**/api/portfolio?*', async (route) => {
    const period = new URL(route.request().url()).searchParams.get('period') ?? 'YTD';
    responses.push(
      `${period}:${failWithValuationGap ? 'error' : recovered ? 'recovered' : 'incomplete'}`,
    );
    if (failWithValuationGap) {
      await route.fulfill({
        status: 503,
        json: {
          error: 'valuation_unavailable',
          reason: 'missing_price',
          message: 'Ein benötigter Wertpapierkurs fehlt bis einschließlich 2026-09-17.',
          missingPriceSecurityIds: ['synthetic-security'],
          asOf: '2026-09-17',
        },
      });
      return;
    }
    if (recovered) {
      await route.fulfill({ json: summary() });
      return;
    }
    const incomplete = summary({ realizedGainCents: 0, realizedGainComplete: false });
    if (incomplete.portfolio.performance) {
      incomplete.portfolio.performance.ttwror = null;
      incomplete.portfolio.performance.ttwrorAnnualised = Number.MAX_VALUE;
    }
    await route.fulfill({ json: incomplete });
  });
  await page.goto('/reports/prendite?zeitraum=YTD');
  await expect(page.getByTestId('realized-gain')).toHaveText('0,00 €');
  await expect(page.locator('.performance-incomplete')).toContainText(
    'Bekannter dokumentierter Teilbetrag',
  );
  await expect(page.getByTestId('period-ttwror')).toHaveText('–');
  await expect(
    page.locator('.performance-metric').filter({ hasText: 'TTWROR annualisiert' }).locator('dd'),
  ).toHaveText('–');

  failWithValuationGap = true;
  await page.getByRole('group', { name: 'Zeitraum' }).getByRole('button', { name: '3M' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Portfolioauswertung nicht verfügbar.');
  await expect(alert).toContainText('Ein benötigter Wertpapierkurs fehlt');
  await expect(alert).toContainText('einschließlich der realisierten Gewinne');
  await expect(page.getByTestId('realized-gain')).toHaveCount(0);
  await expect(page.getByTestId('period-ttwror')).toHaveCount(0);

  failWithValuationGap = false;
  recovered = true;
  await alert.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect.poll(() => responses.includes('3M:recovered')).toBe(true);
  await expect(page.getByTestId('period-ttwror')).toHaveText('+12,3 %');
  await expect(page.getByTestId('realized-gain')).toHaveText('+1.234,56 €');
});

test('no-history response shows no invented return and labels a known zero realized gain', async ({
  page,
}) => {
  await page.route('**/api/portfolio?*', (route) =>
    route.fulfill({
      json: summary({
        performance: null,
        realizedGainCents: 0,
        realizedGainComplete: true,
      }),
    }),
  );
  await page.goto('/reports/prendite');
  await expect(
    page.locator('.performance-empty').filter({ hasText: 'Für das Portfolio' }),
  ).toBeVisible();
  await expect(page.getByTestId('realized-gain')).toHaveText('0,00 €');
  await expect(page.locator('.performance-incomplete')).toContainText(
    'Ergebnis aus den dokumentierten Verkäufen',
  );
  await expect(page.getByTestId('period-ttwror')).toHaveCount(0);
  await expect(page.getByText(/TTWROR|XIRR/)).toHaveCount(0);
});

sampleTest(
  'real sample portfolio response drives the period, ending value, realized gain and captures',
  async ({ page }, info) => {
    const firstResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/api/portfolio' &&
        url.searchParams.get('period') === '3J' &&
        url.searchParams.get('view') === 'securities'
      );
    });
    await page.goto('/reports/prendite?zeitraum=3J');
    const response = await firstResponse;
    expect(response.status()).toBe(200);
    const { portfolio } = (await response.json()) as {
      portfolio: {
        period: string;
        view: string;
        realizedGainCents: number;
        performance: {
          ttwror: number | null;
          endValueCents: number;
        } | null;
      };
    };
    expect(portfolio).toMatchObject({ period: '3J', view: 'securities' });
    expect(portfolio.performance).not.toBeNull();
    expect(await page.getByTestId('period-ttwror').innerText()).not.toBe('–');
    const endTerm = page
      .getByRole('group', { name: /Maßkette Portfolioleistung/ })
      .locator('.ct-pair')
      .filter({ hasText: 'Ende' });
    await expect(endTerm.locator('.ct-val')).toHaveText(
      formatEuro(cents(portfolio.performance!.endValueCents), { cents: false }),
    );
    await expect(page.getByTestId('realized-gain')).toHaveText(
      formatEuro(cents(portfolio.realizedGainCents), { sign: true }),
    );

    const switchedResponse = page.waitForResponse((candidate) => {
      const url = new URL(candidate.url());
      return (
        url.pathname === '/api/portfolio' &&
        url.searchParams.get('period') === '1J' &&
        url.searchParams.get('view') === 'securities'
      );
    });
    await page.getByRole('group', { name: 'Zeitraum' }).getByRole('button', { name: '1J' }).click();
    const switched = await switchedResponse;
    expect(switched.status()).toBe(200);
    const switchedBody = (await switched.json()) as { portfolio: { period: string } };
    expect(switchedBody.portfolio.period).toBe('1J');
    await expect(page).toHaveURL(/zeitraum=1J/);

    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await checkAccessibility(page);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await evidenceScreenshot(
        page,
        `portfolio-performance-${theme}-${info.project.name}.png`,
        info,
      );
    }
  },
);
