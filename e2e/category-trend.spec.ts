import { cents, formatEuro, lastDayOfMonth } from '@budget/domain';
import type { Page } from '@playwright/test';
import type { ReportTables } from '../apps/web/src/reports/table-reports-api';
import { sampleTest as test, expect } from './sample';
import { inspectReport } from './spending-helpers';

test.describe.configure({ timeout: 120_000 });

async function openExpenseHeatmap(page: Page) {
  const toggle = page.locator('section[aria-labelledby="sa-explorer"] .section-toggle');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await page.getByRole('link', { name: 'In Auswertung öffnen', exact: true }).click();
  await expect(page.getByTestId('template-heatmap')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('exakt')).toBe('true');
}

test('category choice, period and previous-year month survive reload; month links reconcile with bookings', async ({
  page,
}, info) => {
  const response = await page.request.get('/api/report-tables/months');
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as ReportTables;
  const ids = data.categories.slice(0, 2).map((c) => c.id);
  await page.goto(
    `/reports/kategorien?zeitraum=3M&kategorien=${encodeURIComponent(JSON.stringify(ids))}&vorjahr=true`,
  );
  const values = page.locator('.category-trend-values');
  await expect(values.locator('tbody tr')).toHaveCount(3);
  await expect(values.locator('thead th')).toHaveCount(3);
  await expect(page.getByLabel('Vorjahresmonat anzeigen')).toBeChecked();
  await page.locator('.category-trend-picker summary').click();
  await page.getByRole('checkbox', { name: data.categories[1]!.name, exact: true }).uncheck();
  await expect(values.locator('thead th')).toHaveCount(2);
  await page.getByRole('checkbox', { name: data.categories[1]!.name, exact: true }).check();
  await page.getByRole('button', { name: '1M', exact: true }).click();
  await expect(values.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '3M', exact: true }).click();
  await page.reload();
  await expect(values.locator('tbody tr')).toHaveCount(3);
  await expect(values.locator('thead th')).toHaveCount(3);
  await expect(page.locator('[data-testid="category-trend-chart"] .l-prev')).toHaveCount(2);
  await inspectReport(page, info, 'category-trend');
  const link = values.locator('tbody tr').last().locator('td').first().locator('a').first();
  const expected = data.months.find((m) => m.month === '2026-08')!.spending[ids[0]!] ?? 0;
  await expect(link).toHaveText(formatEuro(cents(expected)));
  await page.locator('.category-trend-picker summary').click();
  await page.getByRole('checkbox', { name: data.categories[1]!.name, exact: true }).uncheck();
  await page.locator('[data-testid="category-trend-chart"] a').last().click();
  await expect(page).toHaveURL(/\/konten\/buchungen\?/);
  const params = new URL(page.url()).searchParams;
  expect(params.get('kategorie')).toBe(ids[0]);
  expect(params.get('von')).toBe('2026-08-01');
  expect(params.get('bis')).toBe('2026-08-31');
  await expect(page.locator('.ksum')).toContainText(
    `Kategorie netto ${formatEuro(cents(expected))}`,
  );
});

test('missing previous-year data stays blank and masking covers trend values and heatmap', async ({
  page,
}) => {
  await page.goto('/reports/kategorien?zeitraum=Alles&vorjahr=true');
  const values = page.locator('.category-trend-values');
  await expect(values.locator('tbody tr').first().locator('td div')).toHaveText('–');
  await expect(values.locator('tbody tr').first().locator('td a')).toHaveCount(1);
  const privacy = page.getByRole('button', { name: 'Beträge verbergen' });
  if (!(await privacy.isVisible())) await page.locator('.m-profile summary').click();
  await privacy.click();
  await expect(values.locator('a').first()).toHaveText('••• €');
  await page.goto('/reports/ausgaben?zeitraum=1M');
  await openExpenseHeatmap(page);
  const cell = page
    .getByTestId('template-heatmap')
    .locator('[data-template-row^="cat:"] .table-cell-open[data-template-column^="20"]')
    .first();
  await expect(cell).toBeVisible();
  await expect(cell).toHaveAttribute('aria-label', /••• €/);
  expect((await cell.innerText()).replace(/\s*[↑↓]$/, '').trim()).toBe('••• €');
});

test('heatmap month cell opens the exact classified category sum and has usable touch targets', async ({
  page,
}, info) => {
  await page.goto('/reports/ausgaben?zeitraum=1M');
  const reportUrl = page.url();
  const categoryId = await page.locator('[data-category]').first().getAttribute('data-category');
  expect(categoryId).toBeTruthy();
  await openExpenseHeatmap(page);
  const cell = page
    .locator(`[data-template-row="cat:${categoryId}"]`)
    .locator('.table-cell-open[data-template-column^="20"]')
    .last();
  await expect(cell).toBeVisible();
  const month = (await cell.getAttribute('data-template-column'))!;
  expect(month).toMatch(/^\d{4}-\d{2}$/);
  const from = `${month}-01`;
  const to = lastDayOfMonth(month);
  const response = await page.request.get(
    `/api/bookings?basis=category-spending&categoryId=${categoryId}&from=${from}&to=${to}`,
  );
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as { categorySpendingCents: number };
  const expected = formatEuro(cents(data.categorySpendingCents));
  expect((await cell.innerText()).replace(/\s*[↑↓]$/, '').trim()).toBe(expected);
  const box = await cell.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await inspectReport(page, info, 'category-heatmap');
  await cell.click();
  const sources = page.getByTestId('template-sources');
  await expect(sources.locator(':scope > p').first().locator('strong')).toHaveText([
    expected,
    expected,
  ]);
  await expect(sources.getByRole('alert')).toHaveCount(0);
  await page.goto(reportUrl);
  const category = page.locator(`[data-category="${categoryId}"]`);
  const group = page.locator('.sa-groups > li').filter({ has: category });
  await group.locator('.sa-group-name').click();
  const link = category.getByRole('link');
  await expect(link).toHaveText(expected);
  const params = new URL((await link.getAttribute('href'))!, page.url()).searchParams;
  expect(params.get('kategorie')).toBe(categoryId);
  expect(params.get('von')).toBe(from);
  expect(params.get('bis')).toBe(to);
  await link.click();
  await expect(page).toHaveURL(/\/konten\/buchungen\?/);
  await expect(page.locator('.ksum')).toContainText(
    `Kategorie netto ${formatEuro(cents(data.categorySpendingCents))}`,
  );
});
