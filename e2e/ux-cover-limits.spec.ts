import { test } from './isolated-ledger';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('cover limits protect commitments, explain missing money and show credit separately', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.setTimeout(60_000);
  const month = '2026-10';
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { data, headers: { origin: baseURL! } });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Testgeldbörse',
    type: 'cash',
    openingDate: '2026-10-01',
    openingBalanceCents: 16000,
  });
  await post('/accounts', {
    name: 'Testgiro',
    type: 'checking',
    openingDate: '2026-10-01',
    openingBalanceCents: -3000,
    overdraftLimitCents: 6000,
  });
  const { group } = await post('/categories/groups', { name: 'Testdeckung' });
  const { category: source } = await post('/categories', {
    name: 'Testgesundheit',
    groupId: group.id,
    class: 'need',
  });
  const { category: target } = await post('/categories', {
    name: 'Testalltag',
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
  expect(assigned.ok()).toBe(true);
  await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-02',
    categoryId: target.id,
    amountCents: -10000,
  });
  await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-08',
    status: 'pending',
    categoryId: source.id,
    amountCents: -2000,
  });
  await post('/expected', {
    name: 'Testfixzahlung',
    accountId: account.id,
    categoryId: source.id,
    dueDay: 10,
    startDate: '2026-10-01',
    kind: 'outflow',
    validFrom: '2026-10-01',
    amountCents: 2000,
  });
  await page.goto(`/plan/monat?monat=${month}`);
  const money = page.locator('.plan-budget-money');
  await expect(money.locator('summary')).toContainText('Geld auf Budget-Konten · 30,00 €');
  await expect(money.locator('summary')).toContainText('davon Dispo/Kreditrahmen genutzt −30,00 €');
  await money.locator('summary').click();
  await expect(money).toContainText('Rahmen 60,00 €');
  const select = page.getByLabel('Quelle für alle Überziehungen');
  await expect(select.locator('option', { hasText: 'Testgesundheit' })).toContainText(
    'fest verplant 40,00 € · frei 20,00 €',
  );
  await expect(page.locator('.cover-missing')).toContainText('Es fehlen 30,00 €');
  await expect(page.getByRole('button', { name: 'Umbuchung anlegen' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'In den nächsten Monat mitnehmen' })).toHaveAttribute(
    'href',
    /monat=2026-11/,
  );
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `test-results/cover-limits-${info.project.name}-${theme}.png`,
      fullPage: true,
    });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await select.selectOption(source.id);
  await page.getByRole('button', { name: 'Alle aus Testgesundheit decken' }).click();
  await expect(page.locator('.toast.is-open')).toContainText('0 gedeckt, 1 offen · 30,00 € fehlen');
  await expect(select.locator('option', { hasText: 'Testgesundheit' })).toHaveCount(0);
  const value = (name: string) => page.locator('tr.prow', { hasText: name }).locator('.col-avail');
  await expect(value('Testgesundheit')).toHaveText('40,00 €');
  await expect(value('Testalltag')).toHaveText('−30,00 €');
  await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(value('Testgesundheit')).toHaveText('60,00 €');
  await expect(value('Testalltag')).toHaveText('−50,00 €');
});
