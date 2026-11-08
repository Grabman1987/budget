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

for (const theme of ['light', 'dark'] as const) {
  test(`calm Plan toolbar presentation (${theme})`, async ({ page, request, baseURL }, info) => {
    const { ids } = await openPlan(page, request, baseURL!, theme);
    const toolbar = page.locator('.plan-calm-toolbar');
    const filters = toolbar.getByRole('group', { name: 'Kategoriefilter' });
    await expect(filters.getByRole('button')).toHaveText([
      'Alle (3)',
      'Überzogen (0)',
      'Unterfinanziert (1)',
      'Überfinanziert (0)',
      'Verfügbar (1)',
    ]);
    await expect(page.getByRole('button', { name: 'Geld verteilen', exact: true })).toHaveCount(1);
    const row = page.locator(`.prow:has([data-category-id="${ids[0]}"])`);
    await expect(row.locator('.spending-bar')).toHaveCSS('visibility', 'hidden');
    await expect(row.locator('.activity-link')).toHaveCSS('text-decoration-line', 'none');
    await expect(row.locator('.pill svg')).toHaveCount(1);
    if (page.viewportSize()!.width === 1440) {
      const bounds = await toolbar
        .locator(':scope > *')
        .evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect()));
      expect(Math.max(...bounds.map((r) => r.top))).toBeLessThan(
        Math.min(...bounds.map((r) => r.bottom)),
      );
      // Every primary chip fits, without horizontal scrolling at the target desktop width.
      expect(await filters.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await row.hover();
      await expect(row.locator('.spending-bar')).toHaveCSS('visibility', 'visible');
      await expect(row.locator('.pbar-fill')).toHaveCSS('background-image', 'none');
    }
    await page.mouse.move(0, 0);
    expect(
      (await new AxeBuilder({ page }).include('.plan-month-frame').analyze()).violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`plan-${page.viewportSize()!.width}-${theme}.png`),
      fullPage: true,
    });
    if (page.viewportSize()!.width === 1440) {
      const months = toolbar.getByRole('group', { name: 'Sichtbare Monate' });
      await months.getByRole('button', { name: '2', exact: true }).click();
      await expect(page.locator('.ptable-multi .pm-month')).toHaveCount(2);
      await expect(page.locator('.ptable-multi .pill svg')).toHaveCount(6);
      await months.getByRole('button', { name: '1', exact: true }).click();
      await expect(row).toBeVisible();
    }
  });
  test(`Plan toolbar reuses audited undo and redo (${theme})`, async ({
    page,
    request,
    baseURL,
  }, info) => {
    const { accountsBefore } = await openPlan(page, request, baseURL!, theme);
    const toolbar = page.locator('.plan-calm-toolbar');
    await toolbar.locator('.plan-menu-verteilen > summary').click();
    await page.getByRole('button', { name: 'Leere füllen', exact: true }).click();
    await expect(page.getByTestId('to-be-assigned')).toHaveText('970,00 €');
    const history = toolbar.getByRole('group', { name: 'Änderungen' });
    await history.getByRole('button', { name: 'Rückgängig', exact: true }).click();
    await expect(page.getByTestId('to-be-assigned')).toHaveText('980,00 €');
    await expect(page.locator('.toast.is-open')).toContainText('Rückgängig gemacht.');
    const toast = (await page.locator('.toast.is-open .toast-body').boundingBox())!;
    const toastAction = (await page.locator('.toast.is-open button').boundingBox())!;
    expect(toastAction.x).toBeGreaterThanOrEqual(toast.x);
    expect(toastAction.x + toastAction.width).toBeLessThanOrEqual(toast.x + toast.width);
    expect(toast.y).toBeGreaterThan(page.viewportSize()!.height / 2);
    expect(toast.y + toast.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.screenshot({
      path: info.outputPath(`plan-${page.viewportSize()!.width}-${theme}-undo.png`),
    });
    await history.getByRole('button', { name: 'Wiederholen', exact: true }).click();
    await expect(page.getByTestId('to-be-assigned')).toHaveText('970,00 €');
    expect(await (await request.get('/api/accounts')).json()).toEqual(accountsBefore);
  });
  test(`Plan density persists without changing money (${theme})`, async ({
    page,
    request,
    baseURL,
  }) => {
    const { ids, accountsBefore } = await openPlan(page, request, baseURL!, theme);
    const toolbar = page.locator('.plan-calm-toolbar');
    const row = page.locator(`.prow:has([data-category-id="${ids[0]}"])`);
    const options = toolbar.locator('.plan-menu-optionen');
    await options.locator('summary').click();
    await options
      .getByRole('group', { name: 'Dichte' })
      .getByRole('button', { name: 'Kompakt' })
      .click();
    await expect(page.locator('.plan-density-compact')).toBeVisible();
    await expect(row.locator('.spending-bar')).toHaveCSS('height', '2px');
    await page.reload();
    await expect(page.locator('.plan-density-compact')).toBeVisible();
    await options.locator('summary').click();
    await options.getByRole('button', { name: 'Minimal', exact: true }).click();
    await expect(row.locator('.spending-bar')).toHaveCSS('display', 'none');
    await expect(page.locator('.prow:has(.pname)')).toHaveCount(3);
    await expect(page.getByTestId('to-be-assigned')).toHaveText('980,00 €');
    await options.locator('summary').click();
    await options
      .getByRole('group', { name: 'Dichte' })
      .getByRole('button', { name: 'Alle', exact: true })
      .click();
    await expect(page.locator('.plan-density-all')).toBeVisible();

    expect(await (await request.get('/api/accounts')).json()).toEqual(accountsBefore);
  });
}

test('assignment undo expires with its toast and stays disabled after an unrelated preference change', async ({
  page,
  request,
  baseURL,
}) => {
  await openPlan(page, request, baseURL!, 'light');
  await page.clock.install();
  const toolbar = page.locator('.plan-calm-toolbar');
  await toolbar.locator('.plan-menu-verteilen > summary').click();
  await page.getByRole('button', { name: 'Leere füllen', exact: true }).click();
  await expect(page.getByTestId('to-be-assigned')).toHaveText('970,00 €');
  const undo = toolbar.getByRole('button', { name: 'Rückgängig', exact: true });
  await expect(undo).toBeEnabled();
  await page.clock.runFor(6001);
  await expect(page.locator('.toast.is-open')).toHaveCount(0);
  await expect(undo).toBeDisabled();
  await toolbar.locator('.plan-menu-optionen > summary').click();
  await toolbar.getByRole('button', { name: 'Minimal', exact: true }).click();
  await expect(undo).toBeDisabled();
  await expect(page.getByTestId('to-be-assigned')).toHaveText('970,00 €');
});

test('menu filters stay visible as removable pressed toolbar chips', async ({
  page,
  request,
  baseURL,
}) => {
  await openPlan(page, request, baseURL!, 'light');
  const toolbar = page.locator('.plan-calm-toolbar');
  for (const name of ['Braucht Aufmerksamkeit', 'Ohne Kategorie']) {
    const filters = toolbar.getByRole('group', { name: 'Kategoriefilter' });
    await filters.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await toolbar.locator('.plan-menu-optionen > summary').click();
    await toolbar
      .getByRole('group', { name: 'Weitere Filter' })
      .getByRole('button', { name: new RegExp(name) })
      .click();
    const chip = toolbar
      .getByRole('group', { name: 'Kategoriefilter' })
      .getByRole('button', { name: new RegExp(name + '.*Filter entfernen') });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(chip).toBeInViewport();
    await chip.click();
    await expect(chip).toHaveCount(0);
    await expect(toolbar.getByRole('button', { name: 'Alle (3)', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
});
