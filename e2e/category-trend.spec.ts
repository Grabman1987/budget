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

// Owner517 replaces the multicategory/previous-year overlay with one category plus its mean.
// Null versus zero and previous-year pairing retain their literal domain regression unchanged.
test('category choice and period survive reload; exact month sources and booking sums still reconcile', async ({ page }, info) => {
  const response = await page.request.get('/api/report-tables/months');
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as ReportTables;
  const ids = data.categories.slice(0, 2).map((c) => c.id);
  await page.goto(`/reports/kategorien?zeitraum=3M&kategorien=${encodeURIComponent(JSON.stringify(ids))}&vorjahr=true`);
  const template = page.getByTestId('template-category');
  const picker = page.getByRole('combobox', { name: 'Kategorie', exact: true });
  await expect(picker).toHaveValue(ids[0]!);
  expect(new URL(page.url()).searchParams.get('vorjahr')).toBe('true');
  await expect(template.locator('tbody tr td')).toHaveCount(5);
  await picker.selectOption(ids[1]!);
  await expect(picker).toHaveValue(ids[1]!);
  await picker.selectOption(ids[0]!);
  await page.getByRole('group', { name: 'Zeitraum', exact: true }).getByRole('button', { name: '1M', exact: true }).click();
  await expect(template.locator('tbody tr td')).toHaveCount(3);
  await page.getByRole('group', { name: 'Zeitraum', exact: true }).getByRole('button', { name: '3M', exact: true }).click();
  await page.reload();
  await expect(picker).toHaveValue(ids[0]!);
  await expect(template.locator('tbody tr td')).toHaveCount(5);
  await expect(template.locator('.ex-template-trend .l-actual')).toBeVisible();
  await expect(template.locator('.ex-template-trend .l-prev')).toBeVisible();
  await inspectReport(page, info, 'category-trend');
  const expected = data.months.find((m) => m.month === '2026-08')!.spending[ids[0]!] ?? 0;
  const cell = template.locator('[data-template-column="2026-08"]');
  expect((await cell.innerText()).replace(/\s*[↑↓]$/, '').trim()).toBe(formatEuro(cents(expected)));
  await cell.click();
  const sources = page.getByTestId('template-sources');
  await expect(sources.locator(':scope > p').first().locator('strong')).toHaveText([formatEuro(cents(expected)), formatEuro(cents(expected))]);
  await expect(sources.getByRole('alert')).toHaveCount(0);
  const link = sources.locator('.report-source-link').first();
  const booking = new URL((await link.getAttribute('href'))!, page.url()).searchParams.get('buchung');
  expect(booking).toBeTruthy();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`buchung=${booking}`));
  // Keep the independent all-bookings category-month reconciliation at its existing consumer.
  await page.goto(`/konten/buchungen?kategorie=${encodeURIComponent(ids[0]!)}&von=2026-08-01&bis=2026-08-31&basis=category-spending`);
  const params = new URL(page.url()).searchParams;
  expect(params.get('kategorie')).toBe(ids[0]);
  expect(params.get('von')).toBe('2026-08-01');
  expect(params.get('bis')).toBe('2026-08-31');
  await expect(page.locator('.ksum')).toContainText(`Kategorie netto ${formatEuro(cents(expected))}`);
});

test('masking covers the accepted category trend values and exact heatmap source cells', async ({ page }) => {
  await page.goto('/reports/kategorien?zeitraum=Alles&vorjahr=true');
  const template = page.getByTestId('template-category');
  await expect(template.locator('.table-cell-open').first()).toBeVisible();
  const privacy = page.getByRole('button', { name: 'Beträge verbergen' });
  if (!(await privacy.isVisible())) await page.locator('.m-profile summary').click();
  await privacy.click();
  await expect(template.locator('.table-cell-open').first()).toHaveText(/••• €/);
  await page.goto('/reports/ausgaben?zeitraum=1M');
  await openExpenseHeatmap(page);
  const cell = page.getByTestId('template-heatmap').locator('[data-template-row^="cat:"] .table-cell-open[data-template-column^="20"]').first();
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
