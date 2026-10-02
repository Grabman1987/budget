import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { MAIN_URL } from '../playwright.config';

async function post(request: APIRequestContext, path: string, data: unknown) {
  const result = await request.post(`/api${path}`, { data, headers: { origin: MAIN_URL } });
  expect(result.ok(), await result.text()).toBe(true);
  return (await result.json()) as Record<string, { id: string }>;
}

test('annual plan: independent figures, all metrics, year navigation and 375px read-only layout', async ({
  page,
}, info) => {
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 375, height: 812 });
  const tag = `${info.project.name}-${Date.now()}`;
  const account = (
    await post(page.request, '/accounts', {
      name: `Jahresplan Konto ${tag}`,
      type: 'checking',
      openingDate: '2026-01-01',
      openingBalanceCents: 1_000_000,
    })
  )['account']!;
  const groupName = `Jahresplan Gruppe ${tag}`;
  const group = (await post(page.request, '/categories/groups', { name: groupName }))['group']!;
  const categoryName = `Jahresplan Kategorie ${tag}`;
  const category = (
    await post(page.request, '/categories', {
      name: categoryName,
      groupId: group.id,
      class: 'need',
      kind: 'variable',
    })
  )['category']!;
  for (const [month, assignedCents] of [
    ['2026-01', 10_001],
    ['2026-02', 5_000],
  ] as const) {
    const response = await page.request.put(`/api/budget/${month}/assigned`, {
      data: { items: [{ categoryId: category.id, assignedCents }] },
      headers: { origin: MAIN_URL },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }
  await post(page.request, '/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-01-12',
    amountCents: -3_002,
    categoryId: category.id,
  });
  await post(page.request, '/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-02-12',
    amountCents: 203,
    categoryId: category.id,
  });
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/budget/') && request.method() !== 'GET')
      writes.push(request.method());
  });
  await page.goto('/plan/jahr?monat=2026-01');
  await expect(page.getByRole('heading', { name: '2026', exact: true })).toBeVisible();
  const mobile = info.project.name === 'mobile';
  const row = mobile
    ? page.locator('.year-phone-row', { hasText: categoryName }).first()
    : page.locator('.year-table tbody tr', { hasText: categoryName });
  await expect(row).toContainText('100,01 €');
  if (!mobile) {
    await expect(row.locator('.year-end')).toHaveText('150,01 €');
    await expect(page.locator('.year-table thead th')).toHaveCount(14);
    expect(await row.locator('th').evaluate((element) => getComputedStyle(element).position)).toBe(
      'sticky',
    );
  }
  await page.getByRole('button', { name: 'Aktivität', exact: true }).click();
  await expect(row).toContainText('−30,02 €');
  if (!mobile) await expect(row.locator('.year-end')).toHaveText('−27,99 €');
  await page.getByRole('button', { name: 'Verfügbar', exact: true }).click();
  await expect(row).toContainText('69,99 €');
  if (mobile) {
    await page.getByLabel('Monat', { exact: true }).selectOption('2026-02');
    await expect(row).toContainText('122,02 €');
    await page.getByText('Jahreswerte je Kategorie', { exact: true }).click();
    await expect(
      page.locator('.year-phone-annual .year-phone-row', { hasText: categoryName }),
    ).toContainText('122,02 €');
  } else await expect(row.locator('.year-end')).toHaveText('122,02 €');
  const groupButton = page.getByRole('button', { name: new RegExp(groupName) });
  await groupButton.click();
  await expect(groupButton).toHaveAttribute('aria-expanded', 'false');
  await groupButton.click();
  await expect(row).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({
    path: info.outputPath(`plan-year-${info.project.name}.png`),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Vorjahr', exact: true }).click();
  await expect(page).toHaveURL(/monat=2025-01/);
  await expect(page.getByRole('heading', { name: '2025', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nächstes Jahr', exact: true }).click();
  await expect(page).toHaveURL(/monat=2026-01/);
  await expect(row).toBeVisible();
  expect(writes).toEqual([]);
});

test('annual plan: a failed month never becomes a partial zero-filled year', async ({ page }) => {
  await page.route('**/api/budget/2026-06', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Synthetic unavailable month' } }),
    }),
  );
  await page.goto('/plan/jahr?monat=2026-06');
  await expect(page.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('heading', { name: 'Jahresübersicht' })).toHaveCount(0);
  await page.unroute('**/api/budget/2026-06');
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.getByRole('heading', { name: 'Jahresübersicht' })).toBeVisible();
});
