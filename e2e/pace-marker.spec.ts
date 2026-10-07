import { sampleTest as test, expect } from './sample';
import type { Heute } from '../apps/web/src/heute/api';
import { eur } from '../apps/web/src/ledger/format';

test('Pace shares its header and tooltip on Heute and One-Pager, with today on Plan bars', async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => localStorage.setItem('budget-heute-more-phone', '1'));
  const { pace } = (await (await page.request.get('/api/heute?month=2026-09')).json()) as Heute;
  const header = `Tag 17 von 30 · Ausgegeben ${eur(pace.figures.spentCents, { cents: false })} · Erwartet ${eur(pace.figures.expectedToDateCents, { cents: false })} · Hochrechnung ${eur(pace.figures.forecastEndCents, { cents: false })}`;
  for (const url of ['/?monat=2026-09', '/reports/onepager?monat=2026-09']) {
    await page.goto(url);
    await expect(page.getByTestId('pace-header')).toHaveText(header, { timeout: 30_000 });
    const chart = page.getByTestId('heute-pace-chart');
    await expect(chart).toBeVisible();
    await expect(chart.locator('.l-today')).toHaveCount(1);
    await expect(chart.locator('text').filter({ hasText: /^heute$/ })).toHaveCount(1);
    const group = chart.locator('..');
    await group.focus();
    for (let d = 0; d < 17; d++) await page.keyboard.press('ArrowRight');
    const tooltip = page.locator('.chart-tooltip');
    for (const [name, value] of [
      ['Ist', pace.figures.spentCents],
      ['Erwartet', pace.figures.expectedToDateCents],
      ['Deckel', pace.figures.limitCents],
      ['Hochrechnung', pace.figures.spentCents],
    ] as const) {
      await expect(
        tooltip
          .locator('.chart-tooltip-row')
          .filter({ has: page.getByText(name, { exact: true }) }),
      ).toContainText(eur(value));
    }
    await page.keyboard.press('Escape');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => {
        document.documentElement.dataset['theme'] = t;
      }, theme);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`${url.startsWith('/reports') ? 'onepager' : 'heute'}-${theme}.png`),
        fullPage: true,
      });
    }
  }
  await page.goto('/plan?monat=2026-09');
  const marks = page.locator('.pbar-tick');
  await expect(marks.first()).toBeVisible();
  await expect(marks.first()).toHaveText('heute');
  expect(
    parseFloat(await marks.first().evaluate((el) => (el as HTMLElement).style.left)),
  ).toBeCloseTo((17 / 30) * 100);
  await page.screenshot({ path: info.outputPath('plan-today.png'), fullPage: true });
  await page.goto('/plan?monat=2026-08');
  await expect(marks).toHaveCount(0);
});
