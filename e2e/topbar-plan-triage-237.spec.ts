import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';

test('phone status or Heute action opens real triage cover and undo on an isolated ledger', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.setTimeout(120_000);
  const month = '2026-10';
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, {
      data,
      headers: { origin: baseURL! },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Testgeldbörse',
    type: 'cash',
    openingDate: '2026-10-01',
    openingBalanceCents: 16000,
  });
  const { group } = await post('/categories/groups', { name: 'Testplanung' });
  const { category: source } = await post('/categories', {
    name: 'Testquelle',
    groupId: group.id,
    class: 'need',
  });
  const { category: target } = await post('/categories', {
    name: 'Testziel',
    groupId: group.id,
    class: 'need',
  });
  const assigned = await request.put(`/api/budget/${month}/assigned`, {
    headers: { origin: baseURL! },
    data: {
      items: [
        { categoryId: source.id, assignedCents: 8000 },
        { categoryId: target.id, assignedCents: 5000 },
      ],
    },
  });
  expect(assigned.ok(), await assigned.text()).toBe(true);
  await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-02',
    categoryId: target.id,
    amountCents: -10000,
  });

  const getMonth = async () => {
    const response = await request.get(`/api/budget/${month}`);
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as BudgetMonthView;
  };
  const balances = async () => {
    const view = await getMonth();
    return {
      source: view.summary.envelopes.find((e) => e.categoryId === source.id)?.availableCents,
      target: view.summary.envelopes.find((e) => e.categoryId === target.id)?.availableCents,
    };
  };
  expect(await balances()).toEqual({ source: 8000, target: -5000 });

  const phone = info.project.name === 'mobile';
  const status = page.locator('.m-status').getByRole('link', { name: '1 überzogen' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const chip = phone
    ? status
    : page.locator('.heute-attention').getByRole('link', { name: 'Plan prüfen', exact: true });
  await expect(page.locator('.topbar .overspent-chip')).toHaveCount(0);
  await expect(chip).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await page.evaluate(() => document.fonts.ready);
    await expect(chip).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(`topbar-${theme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }

  await chip.click();
  await expect(page).toHaveURL(/\/plan\/monat\?/);
  const url = new URL(page.url());
  expect(url.pathname).toBe('/plan/monat');
  expect(url.searchParams.get('monat')).toBe(month);
  expect(url.searchParams.get('ansicht')).toBe('triage');
  // #587: no overspending chip in the head; the overspent row is marked and the cover actions
  // open from the Zu verteilen disclosure.
  const targetRow = page.locator('tr.prow', { hasText: 'Testziel' });
  await expect(page.locator('.plan-chip-scroll')).not.toContainText('überzogen');
  await expect(targetRow).toHaveClass(/is-over/);
  await page.locator('.plan-tba').click();
  await expect(page.locator('.triage')).toContainText('1 Envelopes überzogen');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const sourceSelect = page.getByLabel('Quelle für alle Überziehungen');
  await sourceSelect.selectOption(source.id);
  await page.getByRole('button', { name: 'Alle aus Testquelle decken' }).click();
  await expect(page.locator('.toast.is-open')).toContainText('1 gedeckt, 0 offen');
  await expect(status).toHaveCount(0);
  // The triage view lists only overspent rows: the covered target leaves the marked rows.
  await expect(page.locator('tr.prow.is-over', { hasText: 'Testziel' })).toHaveCount(0);
  await expect(targetRow).toHaveCount(0);
  await expect(page.locator('tr.prow.is-over')).toHaveCount(0);
  expect(await balances()).toEqual({ source: 3000, target: 0 });

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(`triage-covered-${theme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }

  await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.locator('.toast.is-open')).toContainText('Rückgängig gemacht');
  expect(await balances()).toEqual({ source: 8000, target: -5000 });
  if (phone) await expect(status).toBeVisible();
  await expect(targetRow).toHaveClass(/is-over/);
  await expect(page.locator('tr.prow.is-over')).toHaveCount(1);
  await expect(page.locator('.plan-chip-scroll')).not.toContainText('überzogen');
});
