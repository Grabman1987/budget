import AxeBuilder from '@axe-core/playwright';
import { expect, sampleTest as test } from './sample';
import { eachDay, performanceReportSeries, windowPerformance } from '@budget/domain';

test('portfolio value/return shares a period, exact inspection, privacy and accessible themes', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method()))
      writes.push(request.url());
  });
  await page.goto('/vermoegen/portfolio');
  const overview = page.getByRole('region', { name: 'Portfolioentwicklung', exact: true });
  await expect(overview.getByRole('button', { name: 'Wert €', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(overview).toContainText('Wertpapiere ohne Depot-Bargeld');
  const response = await page.request.get(
    '/api/portfolio?period=Alles&view=securities&history=performance',
  );
  expect(response.ok()).toBe(true);
  // Synthetic sample: all held securities sum to exactly 8_800_000 cents on 17 September.
  const body = await response.json();
  expect(body.portfolio.performanceHistory.dailyValues.at(-1)).toMatchObject({
    date: '2026-09-17',
    valueCents: 8_800_000,
  });
  await expect(page.getByTestId('portfolio-value')).toHaveText('88.000,00 €');
  await expect(overview.getByTestId('portfolio-overview-chart')).not.toContainText('-0 €');
  await expect(overview.getByRole('link', { name: 'Benchmarks auswählen' })).toHaveAttribute(
    'href',
    '/einstellungen/depots#benchmark-settings-title',
  );
  const chart = overview.locator('.chart-interactive');
  const overviewBox = (await overview.boundingBox())!;
  const svgBox = (await overview.getByTestId('portfolio-overview-chart').boundingBox())!;
  expect(svgBox.width).toBeGreaterThanOrEqual(overviewBox.width - 1);
  expect(
    await overview
      .getByTestId('portfolio-overview-chart')
      .evaluate((svg) => (svg as SVGSVGElement).viewBox.baseVal.width),
  ).toBeGreaterThanOrEqual(overviewBox.width - 1);
  await chart.focus();
  const valueBox = (await overview.getByTestId('portfolio-overview-chart').boundingBox())!;
  await page.mouse.move(valueBox.x + valueBox.width - 8, valueBox.y + 70);
  if (info.project.use.hasTouch)
    await page.touchscreen.tap(valueBox.x + valueBox.width - 8, valueBox.y + 70);
  await expect(page.locator('.chart-tooltip')).toContainText('Wertpapiere');
  await expect(page.locator('.chart-tooltip')).toContainText('€');
  await expect(page.locator('.chart-tooltip')).toContainText('88.000,00 €');
  await chart.press('Escape');
  await overview.getByRole('button', { name: 'Rendite %', exact: true }).click();
  await expect(chart).toHaveAttribute(
    'aria-label',
    'Portfolioentwicklung, zeitgewichtet, Indexbasis 100',
  );
  await chart.focus();
  await chart.press('ArrowRight');
  await expect(page.locator('.chart-tooltip')).toContainText('Entwicklung (Indexbasis 100)');
  await chart.press('Escape');
  await overview.getByRole('button', { name: '1M', exact: true }).click();
  await expect(page).toHaveURL(/zeitraum=1M/);
  await expect(overview.getByRole('button', { name: 'Rendite %', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await overview.getByRole('button', { name: 'Wert €', exact: true }).click();
  await expect(page).toHaveURL(/zeitraum=1M/);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset['theme'] = theme;
    }, theme);
    await page.evaluate(() => document.fonts.ready);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    if (
      (info.project.name === 'desktop' && theme === 'light') ||
      (info.project.name === 'webkit-iphone' && theme === 'dark')
    ) {
      await page.screenshot({
        path: `docs/evidence/portfolio-chart/${info.project.name}-${theme}.png`,
        fullPage: true,
      });
    }
  }
  const profileMenu = page.locator('.m-profile summary');
  if (info.project.name !== 'desktop') await profileMenu.click();
  await page.getByRole('button', { name: 'Beträge verbergen' }).click();
  if (info.project.name !== 'desktop') await profileMenu.press('Escape');
  await chart.focus();
  await chart.press('ArrowRight');
  await expect(page.locator('.chart-tooltip')).toContainText('•••');
  await expect(page.getByTestId('portfolio-value')).toContainText('•••');
  expect(writes).toEqual([]);
});

test('selected benchmark shares base 100, a missing quote breaks the line, and flows have markers', async ({
  page,
}) => {
  const window = { from: '2026-03-02', to: '2026-03-07' };
  const input = {
    series: eachDay(window.from, window.to).map((date) => ({
      date,
      valueCents: date < '2026-03-04' ? 10_000 : 22_000,
    })),
    flows: [{ date: '2026-03-04', cents: 10_000 }],
  };
  const history = performanceReportSeries(input, window, [
    { date: '2026-03-02', level: 100, reason: null },
    { date: '2026-03-03', level: 102, reason: null },
    { date: '2026-03-05', level: 104, reason: null },
    { date: '2026-03-06', level: 106, reason: null },
    { date: '2026-03-07', level: 110, reason: null },
  ]);
  await page.route('**/api/portfolio?*', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.portfolio.performance = windowPerformance(input, window);
    body.portfolio.performanceHistory = { ...history, classes: [] };
    body.portfolio.benchmarks = [
      { ...history, id: 'synthetic-benchmark', name: 'Vergleich Test', beta: null },
    ];
    await route.fulfill({ json: body });
  });
  await page.goto('/vermoegen/portfolio');
  const overview = page.getByRole('region', { name: 'Portfolioentwicklung', exact: true });
  await expect(overview.getByTestId('portfolio-flow-marker')).toHaveCount(1);
  await overview.getByRole('button', { name: 'Rendite %', exact: true }).click();
  await expect(overview.locator('.portfolio-chart-line-1 path.l-prev')).toHaveCount(2);
  await expect(overview).toContainText('Kursindex, ohne Ausschüttungen');
  await expect(overview).toContainText('Differenz Portfolio: 0,0 Pp');
  const chart = overview.locator('.chart-interactive');
  await chart.focus();
  await expect(page.locator('.chart-tooltip')).toContainText('100');
  const box = (await overview.getByTestId('portfolio-overview-chart').boundingBox())!;
  await page.mouse.move(box.x + box.width - 17, box.y + 70);
  if (test.info().project.use.hasTouch)
    await page.touchscreen.tap(box.x + box.width - 17, box.y + 70);
  await expect(page.locator('.chart-tooltip')).toContainText('Vergleich Test');
  await expect(page.locator('.chart-tooltip')).toContainText('110 (+10 %)');
});

test('portfolio reports remove Dietz figures while retaining PP TTWROR and XIRR', async ({
  page,
}) => {
  for (const route of ['/reports/prendite', '/reports/pdepots']) {
    await page.goto(route);
    await expect(page.getByRole('button', { name: 'TTWROR', exact: true }).first()).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/Modified Dietz|Geldgewichtet/);
    if (route.endsWith('prendite'))
      await expect(page.getByRole('button', { name: 'XIRR', exact: true })).toBeVisible();
  }
});
