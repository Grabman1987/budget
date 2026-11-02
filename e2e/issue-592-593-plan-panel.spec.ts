import { withShellControls } from './shell-actions';
import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-15' });
async function togglePrivacy(page: Page) {
  await withShellControls(page, async ({ privacy: button }) => {
    await button.click();
  });
}
async function checkPanel(page: Page, phone: boolean) {
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const side = page.getByRole('complementary', { name: 'Plan-Inspektor' });
  if (phone) {
    for (const control of await side
      .locator('button:visible, summary:visible, input:visible, select:visible, a:visible')
      .all()) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  }
  for (const amount of await side.locator('.plan-money:visible').all()) {
    expect(await amount.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('nowrap');
    expect(await amount.evaluate((node) => node.getBoundingClientRect().height)).toBeLessThan(44);
  }
}

async function seedAutomaticPlan(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
) {
  const send = async (method: string, path: string, data: unknown) => {
    const response = await request.fetch(`/api${path}`, {
      method,
      data,
      headers: { origin: baseURL! },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json() as Promise<{
      account: { id: string };
      group: { id: string };
      category: { id: string };
    }>;
  };
  await send('POST', '/accounts', {
    name: 'Synthetic money',
    type: 'checking',
    openingDate: '2026-10-01',
    openingBalanceCents: 1150,
  });
  const { group } = await send('POST', '/categories/groups', { name: 'Synthetic actions' });
  const ids: string[] = [];
  for (const name of ['Visible target', 'Visible empty', 'Outside filter']) {
    const { category } = await send('POST', '/categories', {
      name,
      groupId: group.id,
      kind: 'variable',
      class: 'need',
      stage: 2,
    });
    ids.push(category.id);
  }
  for (const [id, amountCents] of [
    [ids[0], 1000],
    [ids[1], 200],
  ] as const)
    await send('PUT', `/categories/${id}/target`, {
      validFrom: '2026-10',
      target: { kind: 'monthly', amountCents },
    });
  await send('PUT', '/budget/2026-10/assigned', {
    items: [
      { categoryId: ids[0], assignedCents: 400 },
      { categoryId: ids[2], assignedCents: 250 },
    ],
  });
  const state = async () => {
    const response = await request.get('/api/budget/2026-10');
    expect(response.ok()).toBe(true);
    const view = (await response.json()) as BudgetMonthView;
    return {
      assigned: ids.map(
        (id) => view.summary.envelopes.find((r) => r.categoryId === id)!.assignedCents,
      ),
      tba: view.summary.toBeAssignedCents,
    };
  };
  await page.goto('/plan/monat?monat=2026-10&q=Visible');
  return { ids, state };
}

test('592 all five displayed deltas equal actual selected/visible assignments and single Undo', async ({
  page,
  request,
  baseURL,
}) => {
  const { state } = await seedAutomaticPlan(page, request, baseURL);
  const side = page.getByRole('complementary', { name: 'Plan-Inspektor' });
  await side.getByText('Automatisch zuweisen', { selector: 'summary', exact: true }).click();
  const automatic = side.getByRole('region', { name: 'Automatisch zuweisen', exact: true });
  await expect(automatic.getByRole('button')).toHaveCount(5);
  await expect(automatic.getByText('0 überzogen, 2 unterfinanziert')).toBeVisible();
  for (const [label, amount, assigned, tba] of [
    ['Wie letzter Monat', '−4,00 €', [0, 0, 250], 900],
    ['Ø 3 Monate', '−4,00 €', [0, 0, 250], 900],
    ['Ziele', '+5,00 €', [900, 0, 250], 0],
    ['Leere füllen', '+2,00 €', [400, 200, 250], 300],
    ['Auf 0 zurücksetzen', '−4,00 €', [0, 0, 250], 900],
  ] as const) {
    const button = automatic.getByRole('button', { name: `${label} ${amount}`, exact: true });
    await expect(button).toBeEnabled();
    await button.click();
    await expect.poll(state).toEqual({ assigned, tba });
    await page
      .locator('.toast.is-open')
      .getByRole('button', { name: 'Rückgängig', exact: true })
      .click();
    await expect.poll(state).toEqual({ assigned: [400, 0, 250], tba: 500 });
  }
  await expect(
    automatic
      .getByRole('button', { name: 'Ziele +5,00 €', exact: true })
      .locator('..')
      .getByText('3,00 € fehlen für 2 Kategorien · auf Zu verteilen begrenzt'),
  ).toBeVisible();
  await page.reload();
  await expect(automatic).toBeVisible();
  await expect.poll(state).toEqual({ assigned: [400, 0, 250], tba: 500 });
});

test('592 automatic panel themes, privacy and selected assignment preserve literal state and Undo', async ({
  page,
  request,
  baseURL,
}, info) => {
  const { ids, state } = await seedAutomaticPlan(page, request, baseURL);
  const side = page.getByRole('complementary', { name: 'Plan-Inspektor' });
  await side.getByText('Automatisch zuweisen', { selector: 'summary', exact: true }).click();
  const automatic = side.getByRole('region', { name: 'Automatisch zuweisen', exact: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    await checkPanel(page, info.project.name !== 'desktop');
    await automatic.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`automatic-${theme}.png`), fullPage: false });
    await togglePrivacy(page);
    await expect(automatic.locator('.plan-automatic-row .plan-money')).toHaveText([
      '••• €',
      '••• €',
      '••• €',
      '••• €',
      '••• €',
    ]);
    await expect(automatic).not.toContainText('3,00 €');
    await togglePrivacy(page);
  }
  await page.reload();
  await expect(automatic).toBeVisible();
  await expect.poll(state).toEqual({ assigned: [400, 0, 250], tba: 500 });
  await page.locator(`.pname[data-category-id="${ids[1]}"]`).click();
  const selected = side.getByRole('region', { name: 'Automatisch zuweisen', exact: true });
  await expect(
    selected.getByRole('button', { name: 'Auf 0 zurücksetzen 0,00 €', exact: true }),
  ).toBeDisabled();
  await expect(selected.getByRole('button', { name: 'Ziele +2,00 €', exact: true })).toBeEnabled();
  await selected.getByRole('button', { name: 'Ziele +2,00 €', exact: true }).click();
  await expect.poll(state).toEqual({ assigned: [400, 200, 250], tba: 300 });
  await page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true })
    .click();
  await expect.poll(state).toEqual({ assigned: [400, 0, 250], tba: 500 });
});

test('593 preselected cover is capped, one click/Undo restores both categories, focus and private nowrap survive themes', async ({
  page,
  request,
  baseURL,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const send = async (method: string, path: string, data: unknown) => {
    const response = await request.fetch(`/api${path}`, {
      method,
      data,
      headers: { origin: baseURL! },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json() as Promise<{
      account: { id: string };
      group: { id: string };
      category: { id: string };
    }>;
  };
  const { account } = await send('POST', '/accounts', {
    name: 'Synthetic cover money',
    type: 'checking',
    openingDate: '2026-10-01',
    openingBalanceCents: 10000,
  });
  const { group } = await send('POST', '/categories/groups', { name: 'Synthetic cover' });
  const ids: string[] = [];
  for (const name of ['Synthetic source', 'Synthetic target', 'Synthetic reserve']) {
    const { category } = await send('POST', '/categories', {
      name,
      groupId: group.id,
      kind: 'variable',
      class: 'need',
      stage: 2,
    });
    ids.push(category.id);
  }
  await send('PUT', '/budget/2026-10/assigned', {
    items: [
      { categoryId: ids[0], assignedCents: 700 },
      { categoryId: ids[2], assignedCents: 9300 },
    ],
  });
  await send('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    categoryId: ids[1],
    date: '2026-10-03',
    amountCents: -900,
  });
  const state = async () => {
    const response = await request.get('/api/budget/2026-10');
    const view = (await response.json()) as BudgetMonthView;
    return ids.map((id) => view.summary.envelopes.find((r) => r.categoryId === id)!.assignedCents);
  };
  await page.goto('/plan/monat?monat=2026-10');
  await page.locator(`.pname[data-category-id="${ids[1]}"]`).click();
  const side = page.getByRole('complementary', { name: 'Plan-Inspektor' });
  const heading = side.getByRole('heading', { name: 'Synthetic target', exact: true });
  await expect(heading).toBeVisible();
  if (info.project.name !== 'desktop') {
    await expect(heading).toBeFocused();
    expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    expect((await heading.boundingBox())!.y).toBeLessThan(page.viewportSize()!.height);
  }
  await expect(side.getByText('Aus Synthetic reserve', { exact: true })).toBeVisible();
  await side.getByRole('button', { name: 'Mit 9,00 € decken', exact: true }).click();
  await expect.poll(state).toEqual([700, 900, 8400]);
  await page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true })
    .click();
  await expect.poll(state).toEqual([700, 0, 9300]);
  await side.getByLabel('Aus', { exact: true }).selectOption(ids[0]!);
  await expect(side.getByText('Aus Synthetic source', { exact: true })).toBeVisible();
  await expect(
    side
      .locator('.inspector-cover-suggestion')
      .getByText('2,00 € bleiben offen · auf freies Geld begrenzt'),
  ).toBeVisible();
  await side.getByRole('button', { name: 'Mit 7,00 € decken', exact: true }).click();
  await expect.poll(state).toEqual([0, 700, 9300]);
  await page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true })
    .click();
  await expect.poll(state).toEqual([700, 0, 9300]);
  await expect(heading).toHaveAttribute('title', /Bedarf · Tempo:/);
  await expect(side.locator('.inspector-pace')).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    await checkPanel(page, info.project.name !== 'desktop');
    await heading.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`selected-${theme}.png`), fullPage: false });
    await togglePrivacy(page);
    await expect(side.locator('.inspector-cover-suggestion .plan-money')).toHaveText('••• €');
    await expect(heading).toHaveAttribute('title', /Bedarf · Tempo:.*•••/);
    await togglePrivacy(page);
  }
  await side.getByRole('button', { name: 'Auswahl aufheben', exact: true }).click();
  await expect(page.locator(`.pname[data-category-id="${ids[1]}"]`)).toBeFocused();
  await expect(
    side.getByRole('heading', { name: 'Monatsüberblick Oktober 2026', exact: true }),
  ).toBeVisible();
});
