import { readFileSync } from 'node:fs';
import { expect, sampleTest as test } from './sample';
import { inspectReport } from './spending-helpers';

test('income versus expense expands categories, drills bookings and exports the visible table', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.goto('/reports/einnahmen-ausgaben?zeitraum=1J');
  const report = page.getByTestId('income-expense-report');
  await expect(report).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('income-expense-chart')).toBeVisible();
  await expect(report.getByText('Netto (Einnahmen − Ausgaben)', { exact: true })).toBeVisible();
  const expand = report.getByRole('button', { expanded: false }).first();
  await expect(expand).toBeVisible();
  const collapsed = await report.locator('tbody tr').count();
  await expand.click();
  expect(await report.locator('tbody tr').count()).toBeGreaterThan(collapsed);
  const rows = await report.locator('tbody tr').count();
  expect(rows).toBeGreaterThan(10);
  const downloaded = page.waitForEvent('download');
  await report.getByRole('button', { name: 'CSV', exact: true }).click();
  const download = await downloaded;
  const csv = readFileSync((await download.path())!, 'utf8');
  expect(csv).toContain('"Summe";"Ø Monat"');
  expect(csv).toContain('Netto (Einnahmen − Ausgaben)');
  expect(csv.trim().split('\n')).toHaveLength(rows + 1);
  const cell = report.locator('tbody tr').first().getByRole('link').first();
  await expect(cell).toHaveAttribute('href', /spalte=2025-09/);
  expect((await cell.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await cell.click();
  await expect(page.getByTestId('income-expense-sources')).toBeVisible();
  await expect(page).toHaveURL(/einnahmen-ausgaben\/buchungen/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('income-expense-sources')).toBeVisible();
  const bookingLink = page.getByTestId('income-expense-sources').getByRole('link').first();
  await expect(bookingLink).toHaveAttribute('href', /von=2025-09-01/);
  await expect(bookingLink).toHaveAttribute('href', /bis=2025-09-30/);
  await inspectReport(page, info, 'income-expense-sources');
  await bookingLink.click();
  await expect(page).toHaveURL(/konten\/buchungen/);
  await page.reload();
  const backToCell = page.getByRole('link', { name: 'Zurück zur Report-Zelle' });
  if (info.project.name === 'mobile')
    expect((await backToCell.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await backToCell.click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/reports/einnahmen-ausgaben/buchungen' &&
      url.searchParams.get('zeitraum') === '1J' &&
      url.searchParams.get('zelle') === 'inc' &&
      url.searchParams.get('spalte') === '2025-09',
  );
  await page.getByRole('link', { name: 'Zurück zu Einnahmen und Ausgaben' }).click();
  await expect(report).toBeVisible();
  await expect(report.getByRole('button', { expanded: true }).first()).toBeVisible();
  await cell.click();
  await expect(page.getByTestId('income-expense-sources')).toBeVisible();
  await page.goBack();
  await expect(report).toBeVisible();
  await inspectReport(page, info, 'income-expense');
});

test('direct invalid report cells retain a usable back link and report period', async ({
  page,
}) => {
  await page.goto(
    '/reports/einnahmen-ausgaben/buchungen?zeitraum=1J&zelle=cat:missing&spalte=2025-09',
  );
  await expect(page.getByTestId('income-expense-sources')).toContainText(
    'Diese Zelle ist im Reportzeitraum nicht verfügbar.',
  );
  await page.getByRole('link', { name: 'Zurück zu Einnahmen und Ausgaben' }).click();
  await expect(page).toHaveURL(/\/reports\/einnahmen-ausgaben\?zeitraum=1J/);
});
