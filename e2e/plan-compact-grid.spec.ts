import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('compact groups retain cent totals, add controls, keyboard and multiple months', async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(90_000);
  const month = '2026-10';
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, {
      data,
      headers: { origin: baseURL! },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return await response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Musterkonto',
    type: 'checking',
    openingDate: `${month}-01`,
    openingBalanceCents: 200_000,
  });
  const categoryIds: string[] = [];
  for (let g = 0; g < 2; g++) {
    const { group } = await post('/categories/groups', { name: `Mustergruppe ${g + 1}` });
    for (let i = 0; i < 9; i++) {
      const { category } = await post('/categories', {
        name: `Posten ${g + 1}.${i + 1}`,
        groupId: group.id,
        class: 'need',
        stage: 2,
        target: { validFrom: month, target: { kind: 'monthly', amountCents: 1_001 } },
      });
      categoryIds.push(category.id);
      const response = await page.request.put(`/api/budget/${month}/assigned`, {
        data: { items: [{ categoryId: category.id, assignedCents: 501 }] },
        headers: { origin: baseURL! },
      });
      expect(response.ok(), await response.text()).toBe(true);
    }
  }
  for (const categoryId of [categoryIds[0], categoryIds[9]]) {
    await post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: `${month}-02`,
      categoryId,
      amountCents: -703,
    });
  }
  await page.goto(`/plan/monat?monat=${month}`);
  await expect(page.locator('.ptable .prow')).toHaveCount(18);
  await expect(page.getByTestId('to-be-assigned')).toHaveText('1.909,82 €');
  await expect(page.getByText('Unterfinanziert 90,00 €', { exact: true })).toBeVisible();
  await expect(page.locator('.pgroup').first().locator('.col-assign')).toHaveText('45,09 €');
  await expect(page.locator('.pgroup').first().locator('.col-act')).toHaveText('−7,03 €');
  await expect(page.locator('.pgroup').first().locator('.col-avail')).toHaveText('38,06 €');
  await expect(
    page.locator('.plan-topbar summary').filter({ hasText: '2 überzogen' }),
  ).toBeVisible();
  await page.locator('.plan-tba').click();
  await expect(page.getByRole('group', { name: 'Maßkette Zu verteilen' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(
    await page.locator('.plan-tba').evaluate((e) => e.parentElement!.hasAttribute('open')),
  ).toBe(false);
  await expect(page.getByText('Monatsdetails', { exact: true })).toBeVisible();
  expect(await page.locator('.plan-details').getAttribute('open')).toBeNull();
  const desktop = info.project.name === 'desktop';
  if (desktop) {
    const dimensions = await page.locator('.plan').evaluate((plan) => {
      const rows = Array.from(plan.querySelectorAll('.prow')).map((r) => r.getBoundingClientRect());
      return {
        beforeGrid:
          plan.querySelector('.ptable')!.getBoundingClientRect().top -
          plan.getBoundingClientRect().top,
        heights: rows.map((r) => r.height),
        visible: rows.filter((r) => r.bottom <= window.innerHeight).length,
        groups: Array.from(plan.querySelectorAll('.pgroup')).map(
          (r) => r.getBoundingClientRect().height,
        ),
      };
    });
    await info.attach('compact-grid-dimensions', {
      body: JSON.stringify(dimensions),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('plan-compact-fold.png') });
    expect(dimensions.beforeGrid).toBeLessThanOrEqual(120);
    expect(Math.max(...dimensions.heights)).toBeLessThanOrEqual(40);
    expect(Math.max(...dimensions.groups)).toBeLessThanOrEqual(36);
    expect(dimensions.visible).toBeGreaterThanOrEqual(14);
  }
  const firstGroup = page.getByRole('button', { name: 'Mustergruppe 1', exact: true });
  await firstGroup.focus();
  await page.keyboard.press('Enter');
  await expect(firstGroup).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.ptable .prow')).toHaveCount(9);
  await page.getByRole('button', { name: 'Alle ausklappen', exact: true }).click();
  await expect(page.locator('.ptable .prow')).toHaveCount(18);
  await page.getByRole('button', { name: 'Alle einklappen', exact: true }).click();
  await expect(page.locator('.ptable .prow')).toHaveCount(0);
  await page.getByRole('button', { name: 'Alle ausklappen', exact: true }).click();
  await page
    .getByRole('button', { name: 'Kategorie in Mustergruppe 1 anlegen', exact: true })
    .click();
  const categoryDialog = page.getByRole('dialog', { name: 'Kategorie anlegen' });
  await expect(categoryDialog).toBeVisible();
  await categoryDialog.getByLabel('Name', { exact: true }).fill('cg');
  await expect(page.getByRole('dialog', { name: 'Gruppe anlegen' })).toHaveCount(0);
  await categoryDialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('g');
  await expect(page.getByRole('dialog', { name: 'Gruppe anlegen' })).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Gruppe anlegen' })
    .getByRole('button', { name: 'Schließen', exact: true })
    .click();
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('c');
  await expect(categoryDialog).toBeVisible();
  await categoryDialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.getByLabel('Ansicht', { exact: true }).selectOption('triage');
  await expect(page.locator('.ptable .prow:not(.is-empty)')).toHaveCount(2);
  await page.getByLabel('Ansicht', { exact: true }).selectOption('group');
  if (desktop) {
    await page.getByRole('button', { name: '2 Monate', exact: true }).click();
    await expect(page.locator('.ptable-multi .prow')).toHaveCount(18);
    await expect(page.getByTestId('tba-2026-11')).toBeVisible();
    await page.getByRole('button', { name: '1 Monat', exact: true }).click();
  }
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (!desktop) {
      for (const selector of [
        '.grp-toggle',
        '.plan-add',
        '.assign-btn',
        '.plan-select',
        '.plan-topbar summary',
        '.plan-topbar > .btn',
      ]) {
        const heights = await page
          .locator(selector)
          .evaluateAll((elements) => elements.map((e) => e.getBoundingClientRect().height));
        expect(
          heights.every((h) => h >= 44),
          selector,
        ).toBe(true);
      }
    }
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`plan-compact-${scheme}.png`) });
  }
});
