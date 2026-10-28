import AxeBuilder from '@axe-core/playwright';
import type { PortfolioPerformanceHistory, PortfolioPositionsView } from '@budget/db';
import type { Page } from '@playwright/test';
import { expect, sampleTest as test } from './sample';

const registers = [
  ['Übersicht', '/vermoegen/portfolio'],
  ['Positionen', '/vermoegen/portfolio/positionen'],
  ['Allokation', '/vermoegen/portfolio/allokation'],
  ['Sparpläne', '/vermoegen/portfolio/sparplaene'],
  ['Kennzahlen', '/vermoegen/portfolio/kennzahlen'],
] as const;

test('portfolio navigation rows do not overlap at the 640px shell breakpoint', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto('/vermoegen/portfolio');
  await expect(page.getByTestId('portfolio-overview-chart')).toBeVisible();
  const area = page.getByRole('navigation', { name: 'Register von Vermögen', exact: true });
  const portfolio = page.getByRole('navigation', { name: 'Portfolio-Register', exact: true });
  const areaBox = (await area.boundingBox())!;
  const portfolioBox = (await portfolio.boundingBox())!;
  expect(portfolioBox.y).toBeGreaterThanOrEqual(areaBox.y + areaBox.height);
  for (const link of await portfolio.getByRole('link').all()) {
    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(640);
  }
  await page.screenshot({ path: info.outputPath('640-registers.png'), fullPage: false });
});

async function expectLoadedRegister(page: Page, label: (typeof registers)[number][0]) {
  // Measure the loaded register, not the shorter loading shell after reload.
  if (label === 'Übersicht')
    await expect(page.getByTestId('portfolio-overview-chart')).toBeVisible();
  if (label === 'Übersicht' || label === 'Positionen')
    await expect(page.getByTestId('portfolio-value')).toHaveText('88.000,00 €');
  if (label === 'Positionen') await expect(page.locator('.portfolio-table')).toBeVisible();
  if (label === 'Allokation') await expect(page.locator('.vallo')).toBeVisible();
  if (label === 'Sparpläne')
    await expect(
      page.getByRole('region', { name: 'Sparpläne', exact: true }).getByRole('table'),
    ).toBeVisible();
  if (label === 'Kennzahlen')
    await expect(page.getByRole('link', { name: 'Portfolio-Auswertung öffnen' })).toBeVisible();
}

// Keep the complete sequential journey; accessibility/captures get independent register cases.
test('five portfolio registers preserve period across navigation and reload', async ({ page }) => {
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
    await expectLoadedRegister(page, label);
  }
});

// Each register retains both themes and every existing accessibility/geometry oracle at 30s.
for (const [label, path] of registers) {
  test(`${label}: portfolio register fits accessible light and dark pages`, async ({
    page,
  }, info) => {
    await page.goto(`${path}?zeitraum=3J`);
    const nav = page.getByRole('navigation', { name: 'Portfolio-Register', exact: true });
    await expectLoadedRegister(page, label);
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
  });
}

// Independent sample arithmetic: 88,000 EUR of securities, excluding depot cash.
test('portfolio endpoint, lead and independently summed positions share exact dated cents', async ({
  page,
  request,
}) => {
  const response = await request.get(
    '/api/portfolio?period=3J&view=securities&history=performance',
  );
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
  await page
    .getByRole('region', { name: 'Positionen', exact: true })
    .getByRole('button', { name: 'ETF Welt', exact: true })
    .click();
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
  expect(
    positions.classes
      .flatMap((group) => group.positions)
      .reduce((sum, position) => sum + position.valueCents!, 0),
  ).toBe(endpoint.valueCents);
  for (const path of ['/vermoegen/portfolio', '/vermoegen/portfolio/positionen']) {
    await page.goto(`${path}?zeitraum=2026-08..2026-08`);
    await expect(page.locator('.vnw')).toContainText('31.08.2026');
    await expect(page.getByTestId('portfolio-value')).toHaveText('86.860,69 €');
  }
});

test('class mini histories retain the shared period, full class universe and monthly source indexes', async ({
  page,
  request,
}, info) => {
  for (const [period, end] of [
    ['2026-01..2026-05', '2026-05-31'],
    ['2026-08..2026-08', '2026-08-31'],
  ]) {
    const response = await request.get(
      `/api/portfolio?period=${period}&view=securities&history=performance`,
    );
    expect(response.ok()).toBe(true);
    const history = (await response.json()).portfolio.performanceHistory as PortfolioPerformanceHistory;
    expect(history.index.at(-1)?.date).toBe(end);
    expect(history.classes.map((cls) => cls.name)).toEqual([
      'Aktien Welt',
      'Schwellenländer',
      'Spekulativ',
      'Ohne Anlageklasse',
    ]);
    await page.goto(`/vermoegen/portfolio?zeitraum=${period}`);
    const classes = page.getByRole('region', { name: 'Anlageklassen im Verlauf', exact: true });
    await expect(classes.getByTestId('portfolio-class-history')).toHaveCount(4);
    await expect(classes.getByRole('heading', { level: 3 })).toHaveText(
      history.classes.map((cls) => cls.name),
    );
    await expect(classes).toContainText('Monatliche TTWROR · Indexbasis 100');
    await expect(classes.getByTestId('portfolio-flow-marker')).toHaveCount(0);
    const dailyMarkers = history.dailyValues.filter(
      (point) => point.depositsCents > 0 || point.withdrawalsCents > 0,
    );
    await expect(page.getByTestId('portfolio-flow-marker')).toHaveCount(dailyMarkers.length);
    await classes.getByText('Klassenverläufe als Tabelle', { exact: true }).click();
    const rows = classes.getByTestId('portfolio-class-history-table').locator('tbody tr');
    await expect(rows).toHaveCount(history.index.length);
    for (const [i, point] of history.index.entries()) {
      const date = `${point.date.slice(8)}.${point.date.slice(5, 7)}.${point.date.slice(0, 4)}`;
      await expect(rows.nth(i).getByRole('rowheader')).toHaveText(date);
      await expect(rows.nth(i).getByRole('cell')).toHaveText(
        history.classes.map((cls) => {
          const value = cls.index.find((entry) => entry.date === point.date)?.portfolio;
          return value == null
            ? 'Nicht verfügbar'
            : new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(value);
        }),
      );
    }
    const first = classes.getByTestId('portfolio-class-history').first();
    const clear = await first.locator('figcaption').innerText();
    expect(clear).not.toContain('Nicht verfügbar');
    const chart = first.locator('.chart-interactive');
    await chart.focus();
    for (let i = 1; i < history.index.length; i++) await chart.press('ArrowRight');
    const known = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(
      history.classes[0]!.index.at(-1)!.portfolio!,
    );
    const tooltipId = (await chart.getAttribute('aria-describedby'))
      ?.split(/\s+/)
      .find((id) => id.endsWith('-tooltip'));
    expect(tooltipId).toBeTruthy();
    const tooltip = page.locator(`[id="${tooltipId}"]`);
    await expect(tooltip).toContainText(known);
    await chart.press('Escape');
    const profile = page.locator('.m-profile > summary');
    const phone = await profile.isVisible();
    if (phone) await profile.click();
    await page.getByRole('button', { name: 'Beträge verbergen', exact: true }).click();
    if (phone) await profile.click();
    await expect(first.locator('figcaption')).toContainText('Letzter Index: •••');
    await expect(classes.getByTestId('portfolio-class-history-table')).not.toContainText(known);
    await chart.focus();
    for (let i = 1; i < history.index.length; i++) await chart.press('ArrowRight');
    await expect(tooltip).toContainText('•••');
    await expect(tooltip).not.toContainText(known);
    const accessible = await classes.locator('[aria-label], [title], [aria-valuetext]').evaluateAll(
      (elements) => elements.flatMap((element) => [
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('aria-valuetext'),
      ]).join('\n'),
    );
    expect(accessible).not.toContain(known);
    await chart.press('Escape');
    if (phone) await profile.click();
    await page.getByRole('button', { name: 'Beträge verbergen', exact: true }).click();
    if (phone) await profile.click();
    await expect(first.locator('figcaption')).toHaveText(clear, { useInnerText: true });
    const responseAfter = await request.get(
      `/api/portfolio?period=${period}&view=securities&history=performance`,
    );
    expect((await responseAfter.json()).portfolio.performanceHistory.dailyValues).toEqual(
      history.dailyValues,
    );
    await page.evaluate((theme) => {
      document.documentElement.dataset['theme'] = theme;
    }, period === '2026-01..2026-05' ? 'light' : 'dark');
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await classes.getByText('Klassenverläufe als Tabelle', { exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    if (info.project.name !== 'desktop') {
      const summary = (await classes.locator('summary').boundingBox())!;
      expect(summary.height).toBeGreaterThanOrEqual(44);
      expect(summary.width).toBeGreaterThanOrEqual(44);
    }
    await classes.screenshot({ path: info.outputPath(`class-histories-${period}.png`) });
  }
});
