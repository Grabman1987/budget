import AxeBuilder from '@axe-core/playwright';
import { expect, sampleTest as test } from './sample';

test('envelope details have a URL; browser back restores the scrolled list', async ({
  page,
}, info) => {
  await page.goto('/plan/monat?monat=2026-09');
  await expect(page.locator('.ptable .pname').last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  const trigger = page.locator('.ptable .pname').last();
  const name = (await trigger.textContent())!.trim();
  await trigger.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => window.scrollY);
  expect(scroll).toBeGreaterThan(0);
  await trigger.click();
  await expect(page).toHaveURL(/\/plan\/monat\/envelope\/[^?]+\?monat=2026-09/);
  const detailUrl = page.url();
  await expect(page.getByRole('navigation', { name: 'Brotkrumen' })).toContainText('Monat');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('envelope-detail.png'), fullPage: true });
  await page.goBack();
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-09$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0);
  await expect(page.locator('.ptable .pname').last()).toContainText(name);

  await page.goto(detailUrl);
  await expect(page.getByRole('button', { name: 'Zuweisen oder verschieben' })).toBeVisible();
  const edit = page.getByRole('button', { name: 'Zuweisen oder verschieben' });
  await edit.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('dialog.panel[open]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(edit).toBeFocused();
  await page.getByRole('link', { name: 'Zurück zum Monat' }).click();
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-09$/);
  const main = await page.locator('.plan-main').boundingBox();
  const summary = await page.getByRole('region', { name: 'Monatsüberblick' }).boundingBox();
  expect(main && summary && summary.y >= main.y + main.height).toBe(true);
  await page.screenshot({ path: info.outputPath('plan-inline-summary.png'), fullPage: true });
});

test('monthly income and legacy category links use detail pages', async ({ page }) => {
  await page.goto('/plan/monat?monat=2026-09');
  await page.getByRole('button', { name: /Einnahmen im Detail/ }).click();
  await expect(page).toHaveURL(/\/plan\/monat\/einnahmen\?monat=2026-09$/);
  await expect(page.getByTestId('income-received')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-09$/);
  await page.goto('/plan/monat?monat=2026-09&kategorie=cat-investieren');
  await expect(page).toHaveURL(/\/plan\/monat\/envelope\/cat-investieren\?monat=2026-09$/);
  await expect(page.getByRole('button', { name: 'Zuweisen oder verschieben' })).toBeVisible();
  await page.goto('/plan/monat/envelope/unknown-synthetic-category?monat=2026-09');
  await expect(page.getByText('Diese Kategorie ist nicht vorhanden.')).toBeVisible();
});
