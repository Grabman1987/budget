import AxeBuilder from '@axe-core/playwright';
import { expect, sampleTest as test } from './sample';

test('phone search and filter sheet immediately update, retain, remove and reset URL filters', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  test.skip(info.project.name !== 'mobile', 'Phone filter sheet at 390 px');
  await page.goto('/konten/buchungen');
  const trigger = page.getByRole('button', { name: /^Filter \(/ });
  await expect(page.getByRole('button', { name: 'Filter (0)', exact: true })).toBeVisible();
  // The text search is not a standalone row any more: it is the first field of the sheet.
  await expect(page.getByLabel('In Buchungen suchen')).toBeHidden();
  await expect(page.getByLabel('Status', { exact: true })).toBeHidden();
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
  await expect(page).toHaveURL(/status=pending/);
  await expect(page).toHaveURL(/von=2026-09-01/);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(sheet.getByLabel('Status', { exact: true })).toHaveValue('pending');
  await sheet.getByLabel('Status', { exact: true }).selectOption('pending');
  // The flag filter is retired (#1040).
  await expect(sheet.getByLabel('Markierung', { exact: true })).toHaveCount(0);
  await sheet.getByLabel('Von', { exact: true }).fill('2026-09-01');
  await sheet.getByRole('button', { name: 'Fertig', exact: true }).click();
  await expect(page).toHaveURL(/status=pending/);
  await expect(page.getByRole('button', { name: 'Filter (2)', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Von: 01.09.2026 entfernen', exact: true }).click();
  await expect(page).not.toHaveURL(/von=/);
  await expect(page.getByRole('button', { name: 'Filter (1)', exact: true })).toBeVisible();
  await trigger.click();
  await sheet.getByLabel('In Buchungen suchen').fill('Muster');
  await expect(page).toHaveURL(/q=Muster/);
  await sheet.getByRole('button', { name: 'Fertig', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Suche: Muster entfernen' })).toBeVisible();
  await page.getByRole('button', { name: 'Filter (2)', exact: true }).click();
  await sheet.getByRole('button', { name: 'Zurücksetzen', exact: true }).click();
  await expect(page).not.toHaveURL(/markierung=|von=/);
  await sheet.getByRole('button', { name: 'Fertig', exact: true }).click();
  await expect(trigger).toBeVisible();
  // Reset clears the text search too: it is part of the sheet now.
  await expect(page).not.toHaveURL(/q=|markierung=|von=/);

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
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

test('desktop opens the same immediate filter dialog', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Desktop filter dialog');
  await page.goto('/konten/buchungen');
  await page.getByRole('button', { name: /^Filter \(/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Buchungen filtern' });
  await expect(dialog.getByLabel('Konto', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Status', { exact: true })).toBeVisible();
  await dialog.getByLabel('Status', { exact: true }).selectOption('pending');
  await expect(page).toHaveURL(/status=pending/);
  await page.screenshot({ path: info.outputPath('ledger-desktop.png') });
});
