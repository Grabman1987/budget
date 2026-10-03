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
  let chosen: string | null = null;
  let gap = false;
  await page.route('**/api/securities', (route) =>
    route.fulfill({
      json: { securities: [{ id: 'synthetic-benchmark', name: 'Vergleich Test' }] },
    }),
  );
  await page.route('**/api/portfolio/benchmark', async (route) => {
    if (route.request().method() === 'PATCH')
      chosen = (route.request().postDataJSON() as { securityId: string | null }).securityId;
    await route.fulfill({
      json: {
        securityId: chosen,
        name: chosen ? 'Vergleich Test' : null,
        available: chosen !== null,
        groupId: 'synthetic-group',
      },
    });
  });
  await page.route('**/api/portfolio?*', (route) => {
    const quotes = chosen
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
          positions: [],
          performance: { ...performance, benchmarkTtwror: history.benchmarkReturn, beta: null },
          performanceHistory: {
            ...history,
            classes: [
              {
                assetClassId: 'class-a',
                name: 'Klasse Test',
                valueCents: 19800,
                performance,
                index: history.index,
              },
            ],
          },
          benchmark: chosen ? { securityId: chosen, name: 'Vergleich Test' } : null,
          realizedGainCents: 0,
          realizedGainComplete: true,
        },
      },
    });
  });
  await page.goto('/reports/prendite?zeitraum=YTD');
  await expect(
    page.getByText('Keine Benchmark gewählt. Bitte in den Einstellungen ein Wertpapier auswählen.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Benchmark einstellen' }).click();
  const select = page.getByLabel('Benchmark-Wertpapier');
  await expect(select).toHaveValue('');
  await select.selectOption('synthetic-benchmark');
  await page.getByRole('button', { name: 'Benchmark speichern' }).click();
  await expect(page.getByText('Benchmark gespeichert.')).toBeVisible();
  await page.reload();
  await expect(select).toHaveValue('synthetic-benchmark');
  await page.goto('/reports/prendite?zeitraum=YTD');
  await expect(page.getByTestId('benchmark-return')).toHaveText('+10,0 %');
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
    await page.screenshot({
      path: info.outputPath(`performance-comparison-${theme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
  gap = true;
  await page.reload();
  await expect(page.getByTestId('benchmark-return')).toHaveText('–');
  await expect(page.getByText(/Die Benchmark hat Kurs- oder Wechselkurslücken/)).toBeVisible();
  await page.getByText('Monatsrenditen als einfache Tabelle', { exact: true }).click();
  await expect(
    page.getByRole('table', { name: 'Renditen und gespeicherte Benchmark-Kursdaten' }),
  ).toContainText('Kurslücke');
  await expect(matrix).toContainText('+20,0 %');
});
