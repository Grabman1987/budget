import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';

// Run against the matching build flag; both states preserve their own readiness contract.
const redesign = process.env['VITE_BUDGET_REDESIGN'] === '1';

test('same-context focus refresh preserves money only in the redesign and clears failed reads', async ({
  page,
}, info) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto('/?monat=2026-09&period=month');
    const net = page.locator('[data-kennzahl="nettovermoegen"]');
    const budget = page.locator('[data-kennzahl="zu-verteilen"]');
    const low = page.locator('.heute-forecast-low');
    await expect(net).toBeVisible();
    await expect(page.locator('[data-budget-redesign="1"]')).toHaveCount(redesign ? 1 : 0);
    await expect(budget).toBeVisible();
    await expect(low).toBeVisible();
    const netText = await net.textContent();
    const budgetText = await budget.textContent();
    const lowCents = await low.getAttribute('data-cents');
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/heute?*', async (route) => {
      await held;
      await route.fulfill({ status: 503, json: { error: 'synthetic_unavailable' } });
    });
    const read = page.waitForRequest('**/api/heute?*');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      window.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await read;
    try {
      if (redesign) {
        await expect(page.getByText(/Heute-Daten werden aktualisiert/)).toBeVisible();
        await expect(net).toHaveText(netText!);
        await expect(low).toHaveAttribute('data-cents', lowCents!);
        await expect(page.locator('.heute-compact-forecast')).toContainText('17.09.2026');
        await expect(page.locator('.heute-compact-forecast')).toContainText('wird aktualisiert');
      } else await expect(net).toHaveCount(0);
      await expect(budget).toHaveText(budgetText!);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`refresh-${colorScheme}.png`),
        fullPage: true,
      });
    } finally {
      release();
    }
    await expect(net).toHaveCount(0);
    await expect(page.getByText(/Heute-Daten werden aktualisiert/)).toHaveCount(0);
    await expect(budget).toHaveText(budgetText!);
    await page.unroute('**/api/heute?*');
  }
});
