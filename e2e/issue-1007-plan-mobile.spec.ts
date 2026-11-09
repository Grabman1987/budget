import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-15' });

async function openPlan(
  page: Page,
  request: APIRequestContext,
  baseURL: string,
  theme: 'light' | 'dark',
) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((value) => localStorage.setItem('budget-theme', value), theme);
  const send = async (path: string, data: unknown, method = 'POST') => {
    const response = await request.fetch(`/api${path}`, {
      method,
      data,
      headers: { origin: baseURL! },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  await send('/accounts', {
    name: 'Synthetic cash',
    type: 'cash',
    openingDate: '2026-10-01',
    openingBalanceCents: 100000,
  });
  const { group } = await send('/categories/groups', { name: 'Synthetic group' });
  const ids: string[] = [];
  for (const name of ['Synthetic target', 'Synthetic reserve', 'Synthetic everyday']) {
    const { category } = await send('/categories', {
      name,
      groupId: group.id,
      class: 'need',
      kind: 'variable',
      stage: 2,
    });
    ids.push(category.id);
  }
  await send(
    `/categories/${ids[0]}/target`,
    { validFrom: '2026-10', target: { kind: 'monthly', amountCents: 1000 } },
    'PUT',
  );
  await send(
    '/budget/2026-10/assigned',
    { items: [{ categoryId: ids[1], assignedCents: 2000 }] },
    'PUT',
  );
  const accountsBefore = await (await request.get('/api/accounts')).json();
  await page.goto('/plan/monat?monat=2026-10');
  await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
  await expect(page.getByTestId('to-be-assigned')).toHaveText('980,00 €');
  return { ids, accountsBefore };
}

test('phone Plan: Ansicht chip, fixed Verteilen and full-screen Zuweisen', async ({
  page,
  request,
  baseURL,
}) => {
  const { ids } = await openPlan(page, request, baseURL!, 'light');
  test.skip(page.viewportSize()!.width >= 768, 'phone only');
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && new URL(r.url()).pathname.startsWith('/api/'))
      writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  // No filter block and no table head; one "Ansicht" chip next to the search.
  await expect(page.locator('.plan-filter-chips')).toHaveCount(0);
  await expect(page.locator('.ptable thead')).toHaveClass(/sr-only/);
  const chip = page.locator('.plan-calm-toolbar .plan-menu-optionen > summary');
  await expect(chip).toContainText('Ansicht');
  // "Verteilen" is fixed at the bottom, above the tab bar.
  const dock = page.locator('.plan-distribute-dock');
  await expect(dock).toHaveCSS('position', 'fixed');
  await expect(page.locator('.plan-menu-verteilen > summary')).toContainText('Verteilen');
  await expect(page.getByRole('button', { name: 'Geld verteilen', exact: true })).toBeVisible();
  // A tap on a category opens the full-screen "Zuweisen" with a decimal keypad.
  await page.locator(`.pname[data-category-id="${ids[2]}"]`).click();
  const sheet = page.getByRole('dialog', { name: 'Zuweisen für Synthetic everyday' });
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  expect(box.width).toBe(page.viewportSize()!.width);
  expect(box.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1);
  expect(
    (await new AxeBuilder({ page }).include('dialog.plan-assign-sheet').analyze()).violations,
  ).toEqual([]);
  const amount = sheet.getByLabel('Neu zugewiesen');
  await expect(amount).toHaveAttribute('inputmode', 'decimal');
  await expect(amount).toBeFocused();
  await amount.fill('12,50+7,50');
  await sheet.getByRole('button', { name: 'Zuweisen', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('to-be-assigned')).toHaveText('960,00 €');
  expect(writes).toEqual(['PUT /api/budget/2026-10/assigned']);
  // A relative entry survives the blur caused by tapping the button: 20,00 + 7,50.
  await page.locator(`.pname[data-category-id="${ids[2]}"]`).click();
  const again = page.getByRole('dialog', { name: /^Zuweisen für / });
  await again.getByLabel('Neu zugewiesen').fill('+7,50');
  await again.getByRole('button', { name: 'Zuweisen', exact: true }).click();
  await expect(again).toHaveCount(0);
  await expect(page.getByTestId('to-be-assigned')).toHaveText('952,50 €');
  expect(writes).toEqual(['PUT /api/budget/2026-10/assigned', 'PUT /api/budget/2026-10/assigned']);
  // Details still reaches the inspector.
  await page.locator(`.pname[data-category-id="${ids[2]}"]`).click();
  await page
    .getByRole('dialog', { name: /^Zuweisen für / })
    .getByRole('button', { name: 'Details', exact: true })
    .click();
  await expect(page.getByRole('complementary', { name: 'Plan-Inspektor' })).toBeVisible();
});
