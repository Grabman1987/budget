import { sampleTest as test, expect as baseExpect } from './sample';
import AxeBuilder from '@axe-core/playwright';
import type { Heute } from '../apps/web/src/heute/api';
import { eur } from '../apps/web/src/ledger/format';

const expect = baseExpect.configure({ timeout: 15_000 });

// Retain the original Heute spec's setup and timeout for this moved acceptance case.
test.beforeEach(async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    localStorage.setItem('budget-heute-more-phone', '1');
  });
});

test('monthly pace and wealth expose exact dates and amounts with honest gaps in both themes', async ({ page }, info) => {
  const response = await page.request.get('/api/heute?month=2026-09&period=month');
  const data: Heute = await response.json();
  if ('unavailable' in data.netWorth) throw new Error('Synthetic current wealth must be available');
  const net = data.netWorth;
  expect(net.series).toHaveLength(12);
  expect(net.series.at(-1)).toEqual({ day: data.stand.today, cents: net.totalCents });
  const gap = net.series[6]!;
  await page.route('**/api/heute?*', (route) => route.fulfill({ json: {
    ...data, netWorth: { ...net, series: net.series.map((point, index) => index === 6 ? {
      day: point.day, cents: null,
      unavailable: { reason: 'missing_fx', asOf: point.day, message: 'Synthetic historical FX gap.' },
    } : point) },
  } }));
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto('/?monat=2026-09&period=month');
    const wealth = page.getByTestId('heute-wealth-history');
    const pace = page.getByTestId('heute-pace-chart');
    await expect(wealth).toBeVisible();
    await expect(pace).toBeVisible();
    await expect(page.locator('[data-kennzahl="nettovermoegen"]')).toHaveText(eur(net.totalCents));
    await page.evaluate(async () => { await document.fonts.ready; });
    if (info.project.name === 'desktop') {
      expect(page.viewportSize()).toEqual({ width: 1440, height: 900 });
      for (const item of [page.getByTestId('heute-kennzahlen'), pace, wealth]) {
        const box = await item.boundingBox();
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(900);
      }
    }
    const wealthGroup = wealth.locator('..');
    await wealthGroup.focus();
    for (let i = 0; i < 11; i++) await page.keyboard.press('ArrowRight');
    const tooltip = page.locator('.chart-tooltip');
    await expect(tooltip).toContainText(eur(net.totalCents));
    await expect(tooltip).toContainText(data.stand.today.split('-').reverse().join('.'));
    const keyboard = await tooltip.textContent();
    await page.keyboard.press('Escape');
    await wealth.locator('[data-chart-point="11"]').hover();
    await expect(tooltip).toHaveText(keyboard!);
    await wealthGroup.focus();
    // Hover retained the endpoint; five steps back reaches the explicit historical hole.
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
    await expect(tooltip).toContainText(gap.day.split('-').reverse().join('.'));
    await expect(tooltip).toContainText('Bewertung nicht verfügbar');
    await expect(wealth.locator('path.heute-wealth-segment')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await pace.locator('..').focus();
    for (let i = 0; i < data.pace.todayDay; i++) await page.keyboard.press('ArrowRight');
    await expect(tooltip).toContainText(eur(data.pace.figures.spentCents));
    await expect(tooltip).toContainText(`${data.pace.month}-${String(data.pace.todayDay).padStart(2, '0')}`.split('-').reverse().join('.'));
    const paceKeyboard = await tooltip.textContent();
    const marker = pace.locator('.pace-plan-marker');
    await page.keyboard.press('Escape');
    await marker.hover();
    await expect(tooltip).toHaveText(paceKeyboard!);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const box = await wealthGroup.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations.map((violation) => violation.id)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`heute-charts-${colorScheme}.png`), fullPage: true });
  }
  await page.evaluate(() => localStorage.setItem('budget-amounts-hidden', '1'));
  await page.reload();
  await page.getByTestId('heute-wealth-history').locator('..').focus();
  for (let i = 0; i < 11; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('.chart-tooltip')).not.toContainText(eur(net.totalCents));
});

