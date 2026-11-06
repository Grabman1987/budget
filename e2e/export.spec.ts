import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('CSV export downloads all account and portfolio CSVs as one ZIP', async ({
  page,
  isMobile,
}) => {
  await page.goto('/einstellungen/export');
  await expect(page).toHaveTitle('Einstellungen · CSV-Export · Budget');
  // Desktop: the settings rail marks the page; phone: the back bar names it.
  const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  if (isMobile)
    await expect(page.locator(on ? '.m-title-text' : '.settings-here')).toHaveText('CSV-Export');
  else
    await expect(page.getByRole('link', { name: 'CSV-Export', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  await expect(page.getByRole('heading', { name: 'CSV-Export', exact: true })).toBeVisible();
  await expect(
    page.getByText(
      on
        ? 'Konten, Depots, Buchungen und Quellenverläufe · ZIP-Datei'
        : 'Alle Konten und Depots als CSV-Dateien in einer ZIP-Datei herunterladen.',
    ),
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
  if ((await page.locator('.app').getAttribute('data-budget-redesign')) === '1') {
    await page
      .getByRole('region', { name: 'Bank', exact: true })
      .getByRole('button', { name: 'Prüfen' })
      .click();
    await page
      .getByRole('region', { name: 'Krypto', exact: true })
      .getByRole('button', { name: 'Prüfen' })
      .click();
  }
  await expect(page.getByRole('heading', { name: 'Bank-Sync (PSD2)', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Krypto-Lesequelle' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'YNAB-Import' })).toHaveCount(0);
  await expect(page.locator('input[type=file]')).toHaveCount(0);

  await page.goto('/einstellungen/datenquellen/abgleich?lauf=legacy');
  await expect(page.getByText('Seite nicht gefunden')).toBeVisible();
  await expect(page.getByText('Abgleich mit YNAB', { exact: true })).toHaveCount(0);
});

test('encrypted backup is a separate retryable download with restore guidance', async ({
  page,
}, info) => {
  await page.goto('/einstellungen/export');
  const backup = page.getByRole('button', { name: 'Verschlüsselte Sicherung herunterladen' });
  if ((await page.locator('.app').getAttribute('data-budget-redesign')) !== '1') {
    await expect(backup).toHaveCount(0);
    return;
  }
  await expect(backup).toBeEnabled();
  await expect(page.getByText(/privaten age-Schlüssel/)).toBeVisible();
  await expect(page.getByText(/Sicherungstag \(UTC\)/)).toBeVisible();
  let attempts = 0;
  // The auth/storage boundary is covered by encrypted-backup.test.ts; the browser has no bucket.
  await page.route('**/api/export/backup.age', async (route) => {
    attempts += 1;
    if (attempts === 1) return route.fulfill({ status: 404, json: { error: 'backup_missing' } });
    return route.fulfill({
      contentType: 'application/octet-stream',
      headers: { 'content-disposition': 'attachment; filename="budget-2026-11-05.tar.age"' },
      body: 'age-encryption.org/v1\n-> synthetic encrypted fixture',
    });
  });
  await backup.click();
  await expect(page.getByRole('alert')).toContainText('keine abgeschlossene');
  await expect(backup).toBeEnabled();
  await expect(page.getByRole('button', { name: 'ZIP-Export herunterladen' })).toBeEnabled();
  const download = page.waitForEvent('download');
  await backup.click();
  expect((await download).suggestedFilename()).toBe('budget-2026-11-05.tar.age');
  await expect(
    page.getByRole('status').filter({ hasText: 'Sicherung heruntergeladen' }),
  ).toContainText('2026-11-05');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(attempts).toBe(2);
  await page.screenshot({ path: info.outputPath('encrypted-backup.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const bounds = await backup.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(await backup.evaluate((button) => button.scrollWidth <= button.clientWidth)).toBe(true);
});
