import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('CSV export downloads all account and portfolio CSVs as one ZIP', async ({ page }) => {
  await page.goto('/einstellungen/export');
  await expect(page).toHaveTitle('Einstellungen · CSV-Export · Budget');
  const register = page.getByRole('link', { name: 'CSV-Export', exact: true });
  await expect(register).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'CSV-Export', exact: true })).toBeVisible();
  await expect(
    page.getByText('Alle Konten und Depots als CSV-Dateien in einer ZIP-Datei herunterladen.'),
  ).toBeVisible();
  await expect(page.locator('input[type=file], a[download]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ZIP-Export herunterladen' })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Import/Export', exact: true })).toHaveCount(0);

  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
  const screenshot = test.info().outputPath('export.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await test.info().attach('CSV export', {
    path: screenshot,
    contentType: 'image/png',
  });
});

test('legacy import entry points cannot open the removed wizard or report', async ({ page }) => {
  await page.goto('/einstellungen/import');
  await expect(page).toHaveURL(/\/einstellungen\/export$/);
  await expect(page.getByRole('heading', { name: 'CSV-Export', exact: true })).toBeVisible();

  await page.goto('/einstellungen/datenquellen?lauf=legacy&schritt=konten');
  await expect(page.getByRole('heading', { name: 'Bank-Sync (PSD2)', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Krypto-Lesequelle' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'YNAB-Import' })).toHaveCount(0);
  await expect(page.locator('input[type=file]')).toHaveCount(0);

  await page.goto('/einstellungen/datenquellen/abgleich?lauf=legacy');
  await expect(page.getByText('Seite nicht gefunden')).toBeVisible();
  await expect(page.getByText('Abgleich mit YNAB', { exact: true })).toHaveCount(0);
});
