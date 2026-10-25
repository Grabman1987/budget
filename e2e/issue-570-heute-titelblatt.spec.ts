import AxeBuilder from '@axe-core/playwright';
import { expect as baseExpect, sampleTest as test } from './sample';

/**
 * #570: Heute Titelblatt (month switch, "Monat | Bis Gehalt", "Stand") and section heads without
 * circle numbers. Sample server, "today" is 17.09.2026.
 */
const expect = baseExpect.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 90_000 });

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    test.beforeEach(async ({ page }) => {
      // The "Mehr zum Monat" fold is closed on the phone by default.
      await page.addInitScript(() => localStorage.setItem('budget-heute-more-phone', '1'));
    });

    test('Titelblatt: month switch, Monat | Bis Gehalt and Stand; no horizontal scroll', async ({
      page,
    }, info) => {
      await page.goto('/');
      const head = page.locator('header.titleblock-heute');
      await expect(
        head.getByRole('heading', { name: 'September 2026', exact: true }),
      ).toBeVisible();
      const monat = head.getByRole('button', { name: 'Monat', exact: true });
      const payday = head.getByRole('button', { name: 'Bis Gehalt', exact: true });
      await expect(monat).toBeVisible();
      await expect(payday).toBeVisible();
      const stand = head.locator('.tb-field', { hasText: 'Stand' });
      const phone = (page.viewportSize()?.width ?? 1440) < 768;
      if (!phone) {
        // Desktop: the switch is right of the month, "Stand" sits underneath the switch.
        await expect(stand).toBeVisible();
        const title = await head.locator('.tb-title').boundingBox();
        const sw = await head.locator('.tb-field', { hasText: 'Zeitraum' }).boundingBox();
        const st = await stand.boundingBox();
        expect(sw!.x).toBeGreaterThanOrEqual(title!.x + title!.width - 1);
        expect(Math.abs(st!.x - sw!.x)).toBeLessThan(2);
        expect(st!.y).toBeGreaterThanOrEqual(sw!.y + sw!.height - 1);
        // The head keeps its former height (~85 px) so the Zu-tun list stays on the first screen.
        expect((await head.boundingBox())!.height).toBeLessThanOrEqual(88);
      } else {
        // Phone: touch targets of the month switch and the period switch.
        for (const target of [
          head.getByRole('button', { name: 'Vormonat' }),
          head.getByRole('button', { name: 'Nächster Monat' }),
          monat,
          payday,
        ]) {
          const box = await target.boundingBox();
          expect(box!.height).toBeGreaterThanOrEqual(44);
          expect(box!.width).toBeGreaterThanOrEqual(44);
        }
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`titelblatt-${colorScheme}-${info.project.name}.png`),
      });
    });

    test('no circle numbers in section heads; the Kennzahlen replace Monatsergebnis and Dieser Monat', async ({
      page,
    }) => {
      await page.goto('/?period=payday');
      await expect(page.getByRole('heading', { name: 'Letzte Buchungen' })).toBeVisible();
      await expect(page.locator('.heute .circle-no')).toHaveCount(0);
      for (const name of ['Zu verteilen', 'Frei bis Gehalt', 'Nettovermögen'])
        await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Monatsergebnis', exact: true })).toHaveCount(
        0,
      );
      await expect(page.getByText('Dieser Monat', { exact: true })).toHaveCount(0);
    });

    test('another month: switch follows, current-data sections say Stand heute; Axe is clean', async ({
      page,
    }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Vormonat' }).click();
      await expect(page).toHaveURL(/monat=2026-08/);
      await expect(page.getByRole('heading', { name: 'August 2026', exact: true })).toBeVisible();
      await expect(page.getByText('August 2026 · Pace')).toBeVisible();
      for (const name of ['Letzte Buchungen', 'Vermögensaufteilung', 'Finanz-Check']) {
        await expect(
          page.getByRole('region', { name, exact: true }).getByText('Stand heute · '),
        ).toBeVisible();
      }
      await expect(page.locator('.heute-answers > .heute-note')).toContainText(
        'Stand heute · 17.09.2026',
      );
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations).toEqual([]);
    });
  });
}
