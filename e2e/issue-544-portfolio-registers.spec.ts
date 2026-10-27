import AxeBuilder from '@axe-core/playwright';
import type { PortfolioPositionsView } from '@budget/db';
import { expect, sampleTest as test } from './sample';

const registers = [
  ['Übersicht', '/vermoegen/portfolio'],
  ['Positionen', '/vermoegen/portfolio/positionen'],
  ['Allokation', '/vermoegen/portfolio/allokation'],
  ['Sparpläne', '/vermoegen/portfolio/sparplaene'],
  ['Kennzahlen', '/vermoegen/portfolio/kennzahlen'],
] as const;

// Catches missing/dead register destinations, clipped labels and hidden oversized pages.
test('five portfolio registers preserve period and fit accessible desktop and phone pages', async ({
  page,
}, info) => {
  await page.goto('/vermoegen/portfolio?zeitraum=3J');
  for (const [label, path] of registers) {
    const nav = page.getByRole('navigation', { name: 'Portfolio-Register', exact: true });
    await expect(nav.getByRole('link')).toHaveCount(5);
    await nav.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(`${path}?zeitraum=3J`);
    await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.reload();
    await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Measure the loaded register, not the shorter loading shell after reload.
    if (label === 'Übersicht')
      await expect(page.getByTestId('portfolio-overview-chart')).toBeVisible();
    if (label === 'Übersicht' || label === 'Positionen')
      await expect(page.getByTestId('portfolio-value')).toHaveText('88.000,00 €');
    if (label === 'Positionen') await expect(page.locator('.portfolio-table')).toBeVisible();
    if (label === 'Allokation') await expect(page.locator('.vallo')).toBeVisible();
    if (label === 'Sparpläne')
      await expect(page.getByRole('region', { name: 'Sparpläne', exact: true })
        .getByRole('table')).toBeVisible();
    if (label === 'Kennzahlen')
      await expect(page.getByRole('link', { name: 'Portfolio-Auswertung öffnen' })).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      await page.evaluate(() => document.fonts.ready);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      }));
      expect(dimensions.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      if (info.project.name === 'desktop') expect(dimensions.height).toBeLessThanOrEqual(1800);
      for (const link of await nav.getByRole('link').all()) {
        const box = (await link.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(await link.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
      }
      await page.screenshot({
        path: info.outputPath(`${label}-${theme}.png`),
        fullPage: false,
      });
    }
  }
});

// Independent sample arithmetic: 88,000 EUR of securities, excluding depot cash.
test('portfolio endpoint, lead and independently summed positions share exact dated cents', async ({
  page,
  request,
}) => {
  const response = await request.get('/api/portfolio?period=3J&view=securities&history=performance');
  expect(response.ok()).toBe(true);
  const history = (await response.json()).portfolio.performanceHistory.dailyValues;
  expect(history.at(-1)).toMatchObject({ date: '2026-09-17', valueCents: 8_800_000 });
  const positionsResponse = await request.get('/api/portfolio/positions?asOf=2026-09-17');
  expect(positionsResponse.ok()).toBe(true);
  const positions = (await positionsResponse.json()) as PortfolioPositionsView;
  expect(positions.asOf).toBe('2026-09-17');
  expect(positions.valueCents).toBe(8_800_000);
  const rows = positions.classes.flatMap((group) => group.positions);
  expect(rows.every((row) => row.valueCents !== null)).toBe(true);
  expect(rows.reduce((sum, row) => sum + row.valueCents!, 0)).toBe(8_800_000);
  for (const path of ['/vermoegen/portfolio', '/vermoegen/portfolio/positionen']) {
    await page.goto(`${path}?zeitraum=3J`);
    await expect(page.getByTestId('portfolio-value')).toHaveText('88.000,00 €');
    await expect(page.locator('.vnw')).toContainText('17.09.2026');
    await expect(page.locator('.vnw')).toContainText('Wertpapiere ohne Depot-Bargeld');
  }
  await page.getByRole('region', { name: 'Positionen', exact: true })
    .getByRole('button', { name: 'ETF Welt', exact: true }).click();
  await expect(page).toHaveURL(/\/instrument\/[^?]+\?zeitraum=3J$/);
});

test('a closed calendar month uses the chart endpoint date for lead and positions', async ({
  page,
  request,
}) => {
  const response = await request.get(
    '/api/portfolio?period=2026-08..2026-08&view=securities&history=performance',
  );
  expect(response.ok()).toBe(true);
  const endpoint = (await response.json()).portfolio.performanceHistory.dailyValues.at(-1);
  expect(endpoint.date).toBe('2026-08-31');
  expect(endpoint.valueCents).toBe(8_686_069);
  const positionsResponse = await request.get('/api/portfolio/positions?asOf=2026-08-31');
  expect(positionsResponse.ok()).toBe(true);
  const positions = (await positionsResponse.json()) as PortfolioPositionsView;
  expect(positions.asOf).toBe('2026-08-31');
  expect(positions.valueCents).toBe(endpoint.valueCents);
  expect(positions.classes.flatMap((group) => group.positions)
    .reduce((sum, position) => sum + position.valueCents!, 0)).toBe(endpoint.valueCents);
  for (const path of ['/vermoegen/portfolio', '/vermoegen/portfolio/positionen']) {
    await page.goto(`${path}?zeitraum=2026-08..2026-08`);
    await expect(page.locator('.vnw')).toContainText('31.08.2026');
    await expect(page.getByTestId('portfolio-value')).toHaveText('86.860,69 €');
  }
});
