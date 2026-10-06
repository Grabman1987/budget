import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';
import { REPORTS } from '../apps/web/src/nav/reports-catalog';
import { eur } from '../apps/web/src/ledger/format';

test('report navigation, daily values, keyboard and touch inspection', async ({ page }, info) => {
  await page.goto('/reports/peinzahlungen?zeitraum=YTD');
  const chart = page.getByTestId('contributions-chart');
  await expect(chart).toBeVisible({ timeout: 30_000 });
  const response = await page.request.get(
    '/api/portfolio?period=YTD&view=securities&history=contributions',
  );
  const {
    portfolio: { contributionHistory: history },
  } = await response.json();
  const line = await chart.locator('.contributions-value-line').getAttribute('d');
  expect(line!.match(/L/g)!.length).toBe(history.daily.length - 1);
  const group = chart.locator('..');
  await group.focus();
  const tooltip = page.locator('.chart-tooltip[role="status"]');
  await expect(tooltip).toContainText(eur(history.daily[0].valueCents));
  await expect(tooltip.locator('.chart-tooltip-date')).toHaveText(
    history.daily[0].date.split('-').reverse().join('.'),
  );
  await page.keyboard.press('ArrowRight');
  await expect(tooltip.locator('.chart-tooltip-date')).toHaveText(
    history.daily[1].date.split('-').reverse().join('.'),
  );
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.boundingBox())!;
  const tapY = Math.min(box.y + box.height / 4, page.viewportSize()!.height - 120);
  const visibleWidth = Math.min(box.width, page.viewportSize()!.width - box.x - 16);
  if (info.project.name === 'mobile') await page.touchscreen.tap(box.x + visibleWidth * 0.65, tapY);
  else await page.mouse.move(box.x + visibleWidth * 0.65, tapY);
  await expect(tooltip).toBeVisible();
  const date = await tooltip.locator('.chart-tooltip-date').textContent();
  expect(date).not.toBe(history.daily[0].date.split('-').reverse().join('.'));
  const tipBox = (await tooltip.boundingBox())!;
  expect(tipBox.y).toBeGreaterThanOrEqual(0);
  expect(tipBox.y + tipBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(tipBox.x).toBeGreaterThanOrEqual(0);
  expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.evaluate(() => window.scrollTo(0, 0));
  await group.focus();
  await page.keyboard.press('ArrowRight');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset['theme'] = t;
    }, theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`chart-tooltip-${theme}.png`), fullPage: true });
  }
  await page
    .getByRole('heading', { name: /Wertpapiere/ })
    .first()
    .click();
  await expect(tooltip).toHaveCount(0);
  // The report arrows live in the desktop title block; the phone header keeps the plain title.
  if (info.project.name === 'mobile') return;
  await page
    .getByRole('button', { name: 'Nächster Bericht: Rendite und Kennzahlen', exact: true })
    .click();
  await expect(page).toHaveURL(/reports\/prendite/);
  await page
    .getByRole('button', {
      name: 'Vorheriger Bericht: Einzahlungen und Wert',
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/reports\/peinzahlungen/);
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  await expect(page).toHaveURL(/reports\/pallocation/);
  await page.goto('/reports/onepager');
  await expect(
    page.getByRole('button', { name: 'Vorheriger Bericht', exact: true }),
  ).toBeDisabled();
});

test('every rendered chart has shared inspection across reports and main pages', async ({
  page,
}) => {
  test.setTimeout(240_000);
  let count = 0;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const path of [
    ...REPORTS.map((r) => `/reports/${r.id}`),
    '/',
    '/vermoegen/nettovermoegen',
    '/vermoegen/freiheit',
    '/vermoegen/schulden',
    '/vermoegen/portfolio',
    '/konten',
    '/dev/bauteile',
  ]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(errors, path).toEqual([]);
    if (path === '/dev/bauteile')
      await expect(page.getByRole('alert')).toHaveText('Kategorie ist Pflicht bei Ausgaben.');
    else await expect(page.getByRole('alert')).toHaveCount(0);
    for (const chart of await page.locator('svg.chart').all()) {
      await expect(chart.locator('..')).toHaveAttribute('tabindex', '0');
      await chart.locator('..').focus();
      await expect(page.locator('.chart-tooltip[role="status"]')).toBeVisible();
      await page.keyboard.press('Escape');
      count++;
    }
    if (path.startsWith('/reports/'))
      await expect(page.getByTestId('valuation-hint')).toHaveCount(0);
  }
  expect(count).toBeGreaterThan(25);
});

test('Sankey links and nodes show amounts, shares and period', async ({ page }, info) => {
  await page.goto('/reports/geldfluss?monat=2026-09');
  const chart = page.getByTestId('sankey-chart');
  const node = chart
    .locator(info.project.name === 'mobile' ? 'li[data-chart-point]' : '.sk-node')
    .first();
  await expect(node).toBeVisible();
  if (info.project.name === 'mobile') await node.tap();
  else await node.hover();
  const tip = page.locator('.chart-tooltip[role="status"]');
  await expect(tip).toContainText('€');
  await expect(tip).toContainText('Anteil an Verfügbar');
  await expect(tip).toContainText('%');
  await expect(tip.locator('.chart-tooltip-date')).toContainText('2026');
  await chart
    .locator(info.project.name === 'mobile' ? 'li[data-chart-point]' : '.sk-link')
    .first()
    .dispatchEvent('pointerdown', {
      pointerType: info.project.name === 'mobile' ? 'touch' : 'mouse',
    });
  await expect(tip.locator('.chart-tooltip-row')).toHaveCount(2);
  await page.keyboard.press('Escape');
});

test('negative bars contrast with the chart surface in both themes', async ({ page }) => {
  await page.goto('/dev/bauteile');
  const bar = page.getByTestId('chart-signed').locator('.bar-neg2').first();
  await expect(bar).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset['theme'] = t;
    }, theme);
    const ratio = await bar.evaluate((el) => {
      const style = getComputedStyle(el);
      const canvas = document.createElement('canvas').getContext('2d')!;
      const lum = (color: string) => {
        canvas.fillStyle = color;
        canvas.fillRect(0, 0, 1, 1);
        const rgb = canvas.getImageData(0, 0, 1, 1).data;
        const parts = [rgb[0]!, rgb[1]!, rgb[2]!].map((c) => {
          const s = c / 255;
          return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return parts[0]! * 0.2126 + parts[1]! * 0.7152 + parts[2]! * 0.0722;
      };
      const a = lum(style.fill),
        b = lum(style.getPropertyValue('--surface'));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(3);
  }
});
