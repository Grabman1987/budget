import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';
import type { Heute } from '../apps/web/src/heute/api';
import { eur } from '../apps/web/src/ledger/format';
import { MIN_TARGET_PX } from './ledger-helpers';

test('Heute keeps canonical answers and exposes the lead and first action on the phone', async ({
  page,
}, info) => {
  await page.goto('/?monat=2026-09&period=payday');
  await expect(page.getByTestId('heute-lead-value')).toBeVisible();
  const enabled = (await page.locator('.heute-v2').count()) > 0;
  const source = await page.request.get('/api/heute?month=2026-09&period=payday');
  expect(source.ok()).toBe(true);
  const data = (await source.json()) as Heute;
  await expect(page.getByTestId('heute-lead-value')).toHaveText(eur(data.lead.freeCents));
  const titles = await page.locator('.heute-answer-grid h2').allTextContents();
  expect(titles).toEqual(
    enabled
      ? ['Frei bis Gehalt', 'Nettovermögen', 'Zu verteilen']
      : ['Zu verteilen', 'Frei bis Gehalt', 'Nettovermögen'],
  );
  if (!enabled) return;
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        return document.fonts.ready;
      });
      const lead = (await page.getByTestId('heute-lead-value').boundingBox())!;
      const action = page.locator('.heute-attention .attention-row a').first();
      const box = (await action.boundingBox())!;
      expect(lead.y).toBeGreaterThanOrEqual(0);
      expect(lead.y + lead.height).toBeLessThan(844);
      expect(box.y + box.height).toBeLessThan(760);
      expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`830-${width}-${colorScheme}.png`) });
    }
  }
  await expect(page.getByRole('link', { name: 'Finanz-Check und Verlauf öffnen' })).toHaveAttribute(
    'href',
    /\/reports\/finanzcheck/,
  );
});
