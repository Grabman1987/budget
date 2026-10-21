import { sampleTest as test, expect } from './sample';
import { writeFileSync } from 'node:fs';

test('independent review: keyboard collapse retains the same group control focus', async ({ page }, info) => {
  await page.goto('/plan/monat?monat=2026-09');
  const row = page.locator('.ptable-zero .pmulti').first();
  await expect(row).toBeVisible();
  const id = await row.getAttribute('id');
  const group = page.locator(`[id="${id}"]`);
  await group.locator('.grp-toggle').focus();
  await page.keyboard.press('Space');
  await expect(group.locator('.grp-toggle')).toHaveAttribute('aria-expanded', 'false');
  const evidence = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    name: document.activeElement?.getAttribute('aria-label'),
    text: document.activeElement?.textContent?.slice(0, 150),
  }));
  writeFileSync(info.outputPath('collapse-focus.json'), JSON.stringify(evidence, null, 2));
  await expect(group.locator('.grp-toggle')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(group.locator('.grp-toggle')).toHaveAttribute('aria-expanded', 'true');
});

test('independent review: category and group selection survive parent collapse without losing any category', async ({ page }, info) => {
  await page.goto('/plan/monat?monat=2026-09');
  const table = page.locator('.ptable-zero');
  await expect(table.locator('tbody > tr:not(.pgroup-gap)')).toHaveCount(36);
  await expect(table.locator('.pname[data-category-id]')).toHaveCount(36);
  const row = table.locator('.pmulti').first();
  const id = await row.getAttribute('id');
  const group = page.locator(`[id="${id}"]`);
  const firstId = await group.locator('.pname').getAttribute('data-category-id');
  const own = group.locator('.col-name > .plan-select input');
  const parent = group.locator('.group-heading .plan-select input');
  await own.check();
  await expect(parent).toHaveJSProperty('indeterminate', true);
  await parent.check();
  await expect(own).toBeChecked();
  await group.locator('.grp-toggle').click();
  await expect(table.locator(`[data-category-id="${firstId}"]`)).toHaveCount(0);
  await expect(group.locator('.group-heading .plan-select input')).toBeChecked();
  await group.locator('.grp-toggle').click();
  await expect(table.locator('.pname[data-category-id]')).toHaveCount(36);
  await expect(group.locator('.col-name > .plan-select input')).toBeChecked();
  const geometry = await table.evaluate((element) => ({
    tableHeight: element.getBoundingClientRect().height,
    documentWidth: document.documentElement.scrollWidth,
    viewport: innerWidth,
    logicalRows: element.querySelectorAll('tbody > tr:not(.pgroup-gap)').length,
  }));
  writeFileSync(info.outputPath('independent-layout.json'), JSON.stringify(geometry, null, 2));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport);
  await page.screenshot({ path: info.outputPath('independent-phone.png'), fullPage: true });
});

test('independent review: group aggregates remain inert while first-category actions inspect that category', async ({ page }) => {
  await page.goto('/plan/monat?monat=2026-09');
  const band = page.locator('.ptable-zero .pmulti').first();
  await expect(band).toBeVisible();
  const selection = page.locator('.plan-inspector .inspector-selection');
  await expect(selection).toHaveCount(0);
  for (const total of await band.locator('.band-parent-totals .band-total').all()) {
    await total.click();
    await expect(selection).toHaveCount(0);
  }
  await band.locator('.band-parent').dispatchEvent('click');
  await expect(selection).toHaveCount(0);
  const categoryName = await band.locator('.pname .category-name').textContent();
  await band.locator('.pname').click();
  await expect(selection.getByRole('heading', { name: categoryName!, exact: true })).toBeVisible();
});
