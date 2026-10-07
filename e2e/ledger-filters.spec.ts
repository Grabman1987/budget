import AxeBuilder from '@axe-core/playwright';
import { expect, sampleTest as test } from './sample';

test('phone search and filter sheet apply, discard, remove and reset URL filters', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  test.skip(info.project.name !== 'mobile', 'Phone filter sheet at 390 px');
  await page.goto('/konten/buchungen');
  const trigger = page.getByRole('button', { name: 'Filter (0)', exact: true });
  const search = page.getByLabel('In Buchungen suchen');
  await expect(search).toBeVisible();
  await expect(page.getByLabel('Status', { exact: true })).toBeHidden();
  const searchBox = await search.boundingBox();
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox!.x).toBeGreaterThan(searchBox!.x);
  expect(Math.abs(triggerBox!.y - searchBox!.y)).toBeLessThan(2);
  await expect(page.locator('[data-booking]').first()).toBeInViewport();

  await trigger.click();
  const sheet = page.getByRole('dialog', { name: 'Buchungen filtern', exact: true });
  await expect(sheet).toHaveClass(/sheet-bottom/);
  await expect(sheet.getByLabel('Sortieren')).toHaveValue('date-desc');
  await expect(sheet.getByLabel('Sortieren').locator('option:checked')).toHaveText(
    'Neueste zuerst',
  );
  await sheet.getByLabel('Status', { exact: true }).selectOption('pending');
  await sheet.getByLabel('Von', { exact: true }).fill('2026-09-01');
  await expect(page).not.toHaveURL(/status=|von=/);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(sheet.getByLabel('Status', { exact: true })).toHaveValue('');
  await sheet.getByLabel('Status', { exact: true }).selectOption('pending');
  await sheet.getByLabel('Markierung', { exact: true }).selectOption('none');
  await sheet.getByLabel('Von', { exact: true }).fill('2026-09-01');
  await sheet.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await expect(page).toHaveURL(/status=pending/);
  await expect(page.getByRole('button', { name: 'Filter (3)', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Status: vorgemerkt entfernen', exact: true }).click();
  await expect(page).not.toHaveURL(/status=/);
  await expect(page.getByRole('button', { name: 'Filter (2)', exact: true })).toBeVisible();
  await search.fill('Muster');
  await expect(page).toHaveURL(/q=Muster/);
  await page.getByRole('button', { name: 'Filter (2)', exact: true }).click();
  await sheet.getByRole('button', { name: 'Zurücksetzen', exact: true }).click();
  await expect(page).toHaveURL(/markierung=none/);
  await sheet.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await expect(trigger).toBeVisible();
  await expect(page).toHaveURL(/q=Muster/);
  await expect(page).not.toHaveURL(/markierung=|von=/);

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    await search.fill('');
    await expect(page.locator('[data-booking]').first()).toBeVisible();
    await page.screenshot({ path: info.outputPath(`ledger-${theme}.png`) });
    await trigger.click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`filters-${theme}.png`) });
    await sheet.getByRole('button', { name: 'Schließen', exact: true }).click();
    await expect(trigger).toBeFocused();
  }
});

test('desktop keeps the inline filter row', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Desktop inline filters');
  await page.goto('/konten/buchungen');
  await expect(page.getByRole('button', { name: /^Filter \(/ })).toHaveCount(0);
  await expect(page.getByLabel('Konto', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Status', { exact: true })).toBeVisible();
  await page.getByLabel('Status', { exact: true }).selectOption('pending');
  await expect(page).toHaveURL(/status=pending/);
  await page.screenshot({ path: info.outputPath('ledger-desktop.png') });
});
