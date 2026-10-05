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
  await report.locator('tbody tr').first().getByRole('button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('link').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await inspectReport(page, info, 'income-expense');
});
