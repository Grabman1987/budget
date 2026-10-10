import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { performanceReportSeries, windowPerformance, eachDay } from '@budget/domain';

const window = { from: '2025-12-31', to: '2026-03-15' };
const input = {
  series: eachDay(window.from, window.to).map((date) => ({
    date,
    valueCents: date < '2026-01-31' ? 10000 : date < '2026-02-28' ? 22000 : 19800,
  })),
  flows: [{ date: '2026-01-31', cents: 10000 }],
};

test('benchmark selection persists and report shows class comparisons, accessible heatmap and gaps', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  let chosen: string[] = [];
  const instruments = [
    { id: 'benchmark-ftse', name: 'FTSE All-World' },
    { id: 'benchmark-sp500', name: 'S&P 500' },
    { id: 'benchmark-nasdaq', name: 'Nasdaq-100' },
    { id: 'benchmark-atx', name: 'ATX' },
  ];
  let gap = false;
  await page.route('**/api/portfolio/benchmarks', async (route) => {
    if (route.request().method() === 'PATCH') chosen = route.request().postDataJSON().ids;
    await route.fulfill({ json: { ids: chosen, instruments, groupId: 'synthetic-group' } });
  });
  await page.route('**/api/portfolio?*', (route) => {
    const quotes = chosen.length
      ? [
          { date: window.from, level: 100, reason: null },
          ...(gap ? [] : [{ date: '2026-01-31', level: 105, reason: null }]),
          { date: '2026-02-28', level: 100, reason: null },
          { date: window.to, level: 110, reason: null },
        ]
      : undefined;
    const history = performanceReportSeries(input, window, quotes);
    const performance = windowPerformance(input, window);
    return route.fulfill({
      json: {
        portfolio: {
          period: new URL(route.request().url()).searchParams.get('period') ?? 'YTD',
          asOf: '2026-09-17',
          positions: [],
          performance: { ...performance, benchmarkTtwror: history.benchmarkReturn, beta: null },
          performanceHistory: {
            ...history,
            classes: [
              {
                assetClassId: 'class-a',
                name: 'Klasse Test',
                currentHolding: true,
                valueCents: 0,
                performance,
                index: history.index,
              },
              {
                assetClassId: 'class-sold',
                name: 'Historische Klasse',
                currentHolding: false,
                valueCents: 19800,
                performance,
                index: history.index,
              },
            ],
          },
          benchmark: null,
          benchmarks: chosen.map((id) => ({
            ...history,
            id,
            name: instruments.find((b) => b.id === id)!.name,
            beta: null,
          })),
          realizedGainCents: 0,
          realizedGainComplete: true,
        },
      },
    });
  });
  await page.goto('/reports/prendite?zeitraum=YTD');
  const ftse = page.getByRole('checkbox', { name: 'FTSE All-World', exact: true });
  const sp = page.getByRole('checkbox', { name: 'S&P 500', exact: true });
  await expect(ftse).not.toBeChecked();
  await expect(page.locator('.benchmark-setup')).toContainText('nur das Portfolio');
  await expect(page.locator('.performance-chart').first().locator('path.l-forecast')).toHaveCount(
    0,
  );
  const current = page.getByRole('table', {
    name: 'Aktuell gehaltene Klassen · Kennzahlen im gewählten Zeitraum',
  });
  await expect(current).toContainText('Klasse Test');
  await expect(current).not.toContainText('Historische Klasse');
  const historical = page.getByRole('table', {
    name: 'Historische und leere Klassen · Kennzahlen im gewählten Zeitraum',
  });
  await expect(historical).not.toBeVisible();
  const historicalToggle = page.getByText('Historische und leere Anlageklassen (1)', {
    exact: true,
  });
  await historicalToggle.focus();
  await historicalToggle.press('Enter');
  await expect(historical).toContainText('Historische Klasse');
  await expect(historical).toContainText('198,00 €');
  await historicalToggle.press('Enter');
  await ftse.check();
  await expect(page.locator('.benchmark-setup')).toHaveCount(0);
  await expect(ftse).toBeEnabled();
  await sp.check();
  await expect(sp).toBeEnabled();
  await page.reload();
  await expect(ftse).toBeChecked();
  await expect(sp).toBeChecked();
  await expect(page.getByTestId('benchmark-return')).toHaveText(['+10,0 %', '+10,0 %']);
  await expect(page.locator('.performance-chart').first().locator('path.l-forecast')).toHaveCount(
    2,
  );
  await page.locator('.performance-chart').first().locator('.chart-interactive').focus();
  await expect(page.locator('.chart-tooltip')).toContainText('FTSE All-World');
  await expect(page.locator('.chart-tooltip')).toContainText('S&P 500');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Anlageklassen nebeneinander' })).toBeVisible();
  const matrix = page.locator('.performance-heatmap');
  await expect(matrix).toContainText('+20,0 %');
  await expect(matrix).toContainText('−10,0 %');
  await expect(matrix).toContainText('0,0 % *');
  await expect(matrix).toContainText('+8,0 % *');
  const fallback = page.getByText('Monatsrenditen als einfache Tabelle', { exact: true });
  await fallback.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('table', { name: 'Renditen und gespeicherte Benchmark-Kursdaten' }),
  ).toBeVisible();
  await page.getByText('Verlauf als Tabelle', { exact: true }).click();
  await expect(page.getByRole('table', { name: 'Indexwerte · Start = 100' })).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    const result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: info.outputPath(`performance-comparison-${theme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
  gap = true;
  await page.reload();
  await expect(page.getByTestId('benchmark-return')).toHaveText(['–', '–']);
  await expect(page.getByText(/Die betroffene Benchmark-Rendite/)).toBeVisible();
  await page.getByText('Monatsrenditen als einfache Tabelle', { exact: true }).click();
  await expect(
    page.getByRole('table', { name: 'Renditen und gespeicherte Benchmark-Kursdaten' }),
  ).toContainText('Kurslücke');
  await expect(matrix).toContainText('+20,0 %');
  await ftse.uncheck();
  await expect(ftse).toBeEnabled();
  await sp.uncheck();
  await expect(sp).toBeEnabled();
  await page.reload();
  await expect(ftse).not.toBeChecked();
  await expect(sp).not.toBeChecked();
  await expect(page.locator('.benchmark-setup')).toContainText('nur das Portfolio');
});
