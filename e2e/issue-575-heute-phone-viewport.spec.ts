import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect as baseExpect } from './sample';

const expect = baseExpect.configure({ timeout: 15_000 });

test('actual monthly pace starts on the first phone screen and both folds clear bottom controls', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    localStorage.removeItem('budget-heute-more-phone');
    localStorage.removeItem('budget-heute-more-desktop');
  });
  const configured = page.viewportSize()!;
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    if (info.project.name === 'desktop') {
      await page.setViewportSize(configured);
      await page.goto('/?monat=2026-09&period=month');
      await expect(page.getByTestId('heute-wealth-history')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      for (const selector of ['.heute-kennzahlen', '[data-testid="heute-pace-chart"]', '[data-testid="heute-wealth-history"]']) {
        const box = (await page.locator(selector).boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(900);
      }
    }
    const phoneSizes = configured.width === 390 && configured.height !== 844
      ? [configured, { width: 390, height: 844 }] : [{ width: 390, height: 844 }];
    for (const viewport of phoneSizes) {
      await page.setViewportSize(viewport);
      await page.goto('/?monat=2026-09&period=month');
      await expect(page.getByTestId('heute-wealth-history')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.scrollTo(0, 0));
      const pace = (await page.locator('#heute-pace-title').boundingBox())!;
      expect(pace.y).toBeGreaterThanOrEqual(0);
      expect(pace.y, 'the actual monthly chart section starts below the first screen').toBeLessThan(viewport.height);
      const order = await page.locator('.heute-overview-charts > section').evaluateAll((sections) => sections.map((section) => section.getAttribute('aria-labelledby')));
      expect(order).toEqual(['heute-pace-title', 'heute-forecast-title', 'heute-wealth-title']);
      const fold = page.getByRole('button', { name: 'Mehr zum Monat' });
      await expect(fold).toHaveAttribute('aria-expanded', 'false');
      for (const open of [false, true]) {
        if (open) await fold.click();
        await expect(fold).toHaveAttribute('aria-expanded', String(open));
        await page.evaluate(async () => {
          window.scrollTo(0, document.documentElement.scrollHeight);
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          window.scrollBy(0, -1);
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        await expect(page.locator('.fab')).toBeVisible();
        const controls = await page.locator('.tabbar, .fab').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
        const controlsTop = Math.min(...controls);
        const last = page.locator('.heute li:visible, .heute .heute-more p:visible, .heute .heute-more a:visible').last();
        const row = (await last.boundingBox())!;
        expect(row.y).toBeGreaterThanOrEqual(0);
        expect(row.y + row.height).toBeLessThanOrEqual(controlsTop);
        if (!open) {
          const booking = (await page.locator('.heute-booking').last().boundingBox())!;
          expect(booking.y).toBeGreaterThanOrEqual(0);
          expect(booking.y + booking.height).toBeLessThanOrEqual(controlsTop);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
        for (const target of await page.locator('.heute-lead-head .btn, .pace-context-toggle, .heute-compact-forecast-head .btn, .heute-more > button, .heute-wealth-line > a').all()) {
          const box = (await target.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
        await page.screenshot({ path: info.outputPath(`575-${viewport.height}-${colorScheme}-${open ? 'open' : 'closed'}.png`) });
      }
    }
  }
});
