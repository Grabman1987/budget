import { cents, formatEuro } from '@budget/domain';
import type { ReportTables } from '../apps/web/src/reports/table-reports-api';
import { sampleTest as test, expect } from './sample';
import { inspectReport } from './spending-helpers';

test.describe.configure({ timeout: 120_000 });

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
  await page.getByLabel(data.categories[1]!.name, { exact: true }).uncheck();
  await expect(values.locator('thead th')).toHaveCount(2);
  await page.getByLabel(data.categories[1]!.name, { exact: true }).check();
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
  await page.getByLabel(data.categories[1]!.name, { exact: true }).uncheck();
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
  await expect(page.locator('.sr-heat a').first()).toBeVisible();
  await expect(page.locator('.sr-heat a').first()).toHaveAttribute('aria-label', /••• €/);
  await expect(page.locator('.sr-heat a').filter({ hasText: '•••' }).first()).toBeVisible();
});

test('heatmap month cell opens the exact classified category sum and has usable touch targets', async ({
  page,
}, info) => {
  await page.goto('/reports/ausgaben?zeitraum=1M');
  const link = page.locator('.sr-heat tbody tr').first().locator('td a').last();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  const params = new URL(href!, page.url()).searchParams;
  const response = await page.request.get(
    `/api/bookings?basis=category-spending&categoryId=${params.get('kategorie')}&from=${params.get('von')}&to=${params.get('bis')}`,
  );
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as { categorySpendingCents: number };
  await expect(link).toHaveText(formatEuro(cents(data.categorySpendingCents)));
  const box = await link.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await inspectReport(page, info, 'category-heatmap');
  await link.click();
  await expect(page.locator('.ksum')).toContainText(
    `Kategorie netto ${formatEuro(cents(data.categorySpendingCents))}`,
  );
});
