import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { balance, openAccount, pickCategory, toast } from './ledger-helpers';

test('new captures use booking month and existing stored values survive dialog edits', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.setTimeout(90_000);
  const headers = { origin: baseURL! };
  const post = async (path: string, data: unknown) => {
    const response = await request.post('/api' + path, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Girokonto A',
    type: 'checking',
    onBudget: true,
    openingDate: '2026-09-01',
  });
  const { group } = await post('/categories/groups', { name: 'Einnahmen A' });
  const { category } = await post('/categories', {
    name: 'Gehalt A',
    kind: 'income',
    class: null,
    groupId: group.id,
  });
  await post('/payees', { name: 'Zahler A' });
  await page.goto('/einstellungen/zuordnung');
  await expect(page.getByRole('heading', { name: 'Budgetmonat für Einnahmen' })).toBeVisible();
  await page.getByLabel('Quelle', { exact: true }).selectOption('income-salary');
  await page.getByRole('button', { name: 'Regel speichern' }).click();
  await expect(toast(page)).toContainText('Budgetmonat-Regeln gespeichert.');
  await expect(page.getByRole('button', { name: 'Regel entfernen: Gehalt' })).toBeVisible();
  await page.getByRole('heading', { name: 'Budgetmonat für Einnahmen' }).click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset['theme'] = theme;
    }, theme);
    expect((await new AxeBuilder({ page }).include('.data-sources').analyze()).violations).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `test-results/income-rules-${info.project.name}-${theme}.png`,
      fullPage: true,
    });
  }
  await openAccount(page, account.name);
  await page.goto(`/konten/${account.id}?panel=buchung`);
  // The common + Buchung route selects a fresh capture panel on the account.
  let panel = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Einnahme', exact: true }).click();
  await panel.getByLabel('Betrag', { exact: true }).fill('2000,01');
  await panel.getByLabel('Von (Zahler)').fill('Zahler A');
  await panel.getByLabel('Datum', { exact: true }).fill('2026-09-30');
  await pickCategory(panel, category.name);
  await panel.getByLabel('Einnahmeart', { exact: true }).selectOption('income-salary');
  await expect(panel.getByLabel('Budgetmonat')).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset['theme'] = theme;
    }, theme);
    expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `test-results/income-capture-${info.project.name}-${theme}.png`,
      fullPage: true,
    });
  }
  await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(balance(page)).toHaveText('2.000,01 €');
  const budget = async (month: string) =>
    (await (await request.get('/api/budget/' + month)).json()).summary;
  expect(await budget('2026-09')).toMatchObject({ incomeCents: 200001, toBeAssignedCents: 200001 });
  expect(await budget('2026-10')).toMatchObject({ incomeCents: 0, toBeAssignedCents: 200001 });
  const list = await (await request.get('/api/bookings?accountId=' + account.id)).json();
  const stored = list.items[0];
  const overridden = await request.patch('/api/bookings/' + stored.id, {
    headers,
    data: { incomeNextMonth: true },
  });
  expect(overridden.ok()).toBe(true);
  await page.goto(`/konten/buchungen?konto=${account.id}`);
  await page
    .getByRole('row', { name: /Zahler A/ })
    .getByRole('button', { name: /bearbeiten/ })
    .click();
  panel = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await expect(panel.getByLabel('Budgetmonat')).toHaveCount(0);
  await panel.getByLabel('Notiz').fill('Muster erhalten');
  await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(panel).toBeHidden();
  const read = async () => (await (await request.get('/api/bookings/' + stored.id)).json()).booking;
  expect(await read()).toMatchObject({ incomeNextMonth: true, memo: 'Muster erhalten' });
  await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect.poll(async () => (await read()).memo).toBe(null);
  expect((await read()).incomeNextMonth).toBe(true);
  await openAccount(page, account.name);
  await expect(balance(page)).toHaveText('2.000,01 €');
});
