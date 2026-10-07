import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';

test('report terms explain returns with keyboard and touch without leaving the report', async ({
  page,
}, info) => {
  await page.goto('/reports/prendite?zeitraum=3J');
  const term = page.getByRole('button', { name: 'TTWROR', exact: true }).first();
  await expect(term).toBeVisible({ timeout: 60_000 });
  await term.focus();
  await page.keyboard.press('Enter');
  const explanation = page.locator('.term-popover:popover-open');
  await expect(explanation).toContainText('Ein- und Auszahlungen');
  await expect(term).toHaveAccessibleDescription(/Ein- und Auszahlungen/);
  await page.keyboard.press('Escape');
  await expect(explanation).toHaveCount(0);
  await expect(term).toBeFocused();
  await page.keyboard.press('Space');
  await expect(explanation).toBeVisible();
  await page.keyboard.press('Escape');
  if (info.project.use.hasTouch) await term.tap();
  else await term.click();
  await expect(explanation).toBeVisible();
  const trigger = (await term.boundingBox())!;
  expect(trigger.width).toBeGreaterThanOrEqual(44);
  expect(trigger.height).toBeGreaterThanOrEqual(44);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const box = (await explanation.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: info.outputPath(`glossary-${theme}.png`), fullPage: true });
  }
  await page.getByRole('heading', { name: 'Rendite und Kennzahlen', exact: true }).click();
  await expect(explanation).toHaveCount(0);
  const irr = page.getByRole('button', { name: 'XIRR', exact: true });
  await irr.click();
  await expect(explanation).toContainText('Zeitpunkte');
  await page.keyboard.press('Escape');
  await page.goto('/reports/onepager?monat=2026-08');
  const printedTerm = page.getByRole('button', { name: 'Bedarf', exact: true });
  await expect(printedTerm).toBeVisible({ timeout: 60_000 });
  await printedTerm.click();
  await expect(explanation).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(printedTerm).toBeVisible();
  await expect(explanation).toBeHidden();
  expect(
    await printedTerm.evaluate((element) => getComputedStyle(element).textDecorationLine),
  ).toBe('none');
  await page.emulateMedia({ media: 'screen' });
  await page.goto('/');
  await expect(page.locator('.term-trigger')).toHaveCount(0);
});
