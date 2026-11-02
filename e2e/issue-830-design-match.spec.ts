import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { sampleTest as test, expect } from './sample';
import type { Heute } from '../apps/web/src/heute/api';
import { eur } from '../apps/web/src/ledger/format';

const evidence = 'docs/evidence/redesign-heute-20261102';
test('Heute matches the numbered compact overview and preserves expanded drilldowns', async ({
  page,
}) => {
  // Two overview frames and ten full detail captures, including native WebKit.
  test.setTimeout(90_000);
  await page.goto('/?monat=2026-09&period=payday');
  await expect(page.locator('.app')).toBeVisible();
  const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  if (!on) {
    await expect(page.getByTestId('heute-kennzahlen')).toBeVisible();
    await expect(page.locator('.heute-screen')).toHaveCount(0);
    return;
  }
  mkdirSync(evidence, { recursive: true });
  const source = (await (
    await page.request.get('/api/heute?month=2026-09&period=payday')
  ).json()) as Heute;
  const forecast = source.forecast35d;
  if (!forecast || !('report' in forecast) || !forecast.report?.low)
    throw new Error('Synthetic T2 forecast unavailable');
  const report = forecast.report;
  await expect(page.locator('.hv-forecast [data-testid="liquidity-lowpoint"]')).toHaveAttribute(
    'data-cents',
    String(report.low!.cents),
  );
  const plot = page.locator('.hv-forecast .chart-interactive');
  await page.evaluate(() => document.fonts.ready);
  await plot.scrollIntoViewIfNeeded();
  await plot.focus();
  await expect(plot).toBeFocused();
  for (let i = 0; i < report.points.length; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('.chart-tooltip')).toContainText(
    eur(report.points.at(-1)!.balanceCents),
  );
  await page.keyboard.press('Escape');

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.goto('/?monat=2026-09&period=payday');
    await expect(page.getByTestId('heute-lead-value')).toBeVisible();
    await expect(page.getByTestId('heute-pace-chart')).toBeVisible();
    await expect(page.getByTestId('liquidity-chart')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect((await page.locator('.hv-chain-bar').boundingBox())!.width).toBeGreaterThan(250);
    const headings = await page.locator('.hv-grid .hv-card h2').allTextContents();
    expect(headings).toEqual([
      '1Monat im Blick',
      '2Kontoprognose · Budget-Konten · 35 Tage',
      '3Als Nächstes',
      '4Fällig',
      '5Letzte Buchungen',
    ]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: `${evidence}/${width === 1440 ? 'desktop' : 'phone'}-light.png`,
      scale: 'css',
    });
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    if (width === 1440) {
      const pace = (await page.locator('.hv-pace').boundingBox())!;
      const work = (await page.locator('.hv-tasks').boundingBox())!;
      expect(work.x).toBeGreaterThan(pace.x + pace.width);
      expect(pace.width / work.width).toBeGreaterThan(1.8);
      expect(
        (await page.locator('.hv-forecast').boundingBox())!.y +
          (await page.locator('.hv-forecast').boundingBox())!.height,
      ).toBeLessThanOrEqual(900);
    } else {
      for (const action of [
        page.locator('.hv-revisions a').nth(0),
        page.locator('.hv-revisions a').nth(1),
      ]) {
        expect(
          await action.evaluate((element) => {
            const b = element.getBoundingClientRect();
            return [
              [b.left + 3, b.top + 3],
              [b.right - 3, b.top + 3],
              [b.left + 3, b.bottom - 3],
              [b.right - 3, b.bottom - 3],
            ].every(([x, y]) => {
              const hit = document.elementFromPoint(x!, y!);
              return element === hit || element.contains(hit);
            });
          }),
        ).toBe(true);
      }
      expect(
        (await page.locator('.hv-revisions a').first().boundingBox())!.y +
          (await page.locator('.hv-revisions a').first().boundingBox())!.height,
      ).toBeLessThan(780);
    }
  }
  for (const kind of [
    'free',
    'pace',
    'forecast',
    'tasks',
    'due',
    'bookings',
    'wealth',
    'metrics',
    'pinned',
    'month',
  ]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?monat=2026-09&period=payday');
    await page.locator(`.heute-screen a[href^="/heute/details/${kind}?"]`).first().click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === `/heute/details/${kind}` &&
        url.searchParams.get('monat') === '2026-09' &&
        url.searchParams.get('period') === 'payday',
    );
    await expect(page.getByRole('link', { name: 'Zurück zu Heute', exact: true })).toBeVisible();
    await expect(page.locator('.heute-detail-title, #dimension-title').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: `${evidence}/drilldown-${kind}-light.png`,
      fullPage: true,
      scale: 'css',
    });
    if (['free', 'due', 'wealth'].includes(kind)) {
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      await page.screenshot({
        path: `${evidence}/drilldown-${kind}-phone-light.png`,
        fullPage: true,
        scale: 'css',
      });
    }
    await page.getByRole('link', { name: 'Zurück zu Heute', exact: true }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === '/' &&
        url.searchParams.get('monat') === '2026-09' &&
        url.searchParams.get('period') === 'payday',
    );
  }
});
