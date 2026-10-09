import AxeBuilder from '@axe-core/playwright';
import { REPORT_GROUPS } from '../apps/web/src/nav/reports-catalog';
import { sampleTest, expect } from './sample';

sampleTest.describe.configure({ timeout: 180_000 });
for (const group of REPORT_GROUPS) {
  sampleTest(`Fazit: ${group.name}`, async ({ page }, info) => {
    for (const report of group.items) {
      await page.goto(`/reports/${report.id}?monat=2026-08`);
      const verdict = page
        .getByTestId(report.id === 'gesamtuebersicht' ? 'whole-verdict' : 'report-verdict')
        .first();
      await expect(verdict, report.id).toBeVisible({ timeout: 45_000 });
      const text = await verdict.textContent();
      expect(text!.length, report.id).toBeLessThanOrEqual(140);
      expect(text, report.id).not.toMatch(/undefined|NaN|\{\w+\}/);
      const title = (await page.locator('.titleblock').isVisible())
        ? page.locator('.titleblock')
        : page.getByRole('banner');
      expect((await verdict.boundingBox())!.y).toBeGreaterThan((await title.boundingBox())!.y);
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      const result = await new AxeBuilder({ page }).include('.report-verdict').analyze();
      expect(result.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath(`verdict-${group.slug}-${theme}.png`),
        fullPage: true,
      });
    }
  });
}
sampleTest('Fazit: Heute, One-Pager header, reload, month change and privacy', async ({ page }) => {
  await page.goto('/reports/onepager?monat=2026-08');
  const verdicts = page.getByTestId('report-verdict');
  await expect(verdicts).toHaveCount(2, { timeout: 45_000 });
  const text = await verdicts.first().textContent();
  expect(await verdicts.nth(1).textContent()).toBe(text);
  await page.reload();
  await expect(verdicts.first()).toHaveText(text!, { timeout: 45_000 });
  await page.getByRole('button', { name: 'Vormonat', exact: true }).click();
  await expect(verdicts.first()).not.toHaveText(text!, { timeout: 45_000 });
  await page.keyboard.press('Control+Shift+h');
  await expect(verdicts.first()).toContainText('•••');
  expect(await verdicts.first().textContent()).not.toMatch(/\d/);
  await page.goto('/');
  // #268: the open month is marked as an interim state ("Zwischenstand bis TT.MM.", booked result so far).
  await expect(page.getByTestId('report-verdict')).toContainText(
    /Zwischenstand bis \d{2}\.\d{2}\.: gebuchtes Monatsergebnis/,
    { timeout: 45_000 },
  );
  await expect(page.getByTestId('report-verdict')).toContainText('•••');
});

sampleTest('Fazit: One-Pager prints only the sheet verdict', async ({ page }) => {
  await page.goto('/reports/onepager?monat=2026-08');
  await expect(page.getByTestId('report-verdict')).toHaveCount(2, { timeout: 45_000 });
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('report-verdict').first()).toBeHidden();
  await expect(page.getByTestId('report-verdict').nth(1)).toBeVisible();
});
