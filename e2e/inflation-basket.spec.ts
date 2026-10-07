import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { inspectReport } from './spending-helpers';

// Every attempt owns a synthetic ledger; settings and undo cannot race another viewport.
test('owner basket choices recalculate report 2.4 and survive reload', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.setTimeout(120_000);
  const headers = { origin: baseURL! };
  const post = async (path: string, data: unknown) => {
    const response = await request.post('/api' + path, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Giro Muster',
    type: 'checking',
    openingDate: '2024-09-01',
  });
  const { group } = await post('/categories/groups', { name: 'Verträge Muster' });
  const { category: rent } = await post('/categories', {
    name: 'Wohnen Muster',
    groupId: group.id,
    class: 'need',
    kind: 'fixed',
  });
  const { category: software } = await post('/categories', {
    name: 'Software Muster',
    groupId: group.id,
    class: 'want',
    kind: 'fixed',
  });
  for (let i = 0; i < 25; i++) {
    const date = new Date(Date.UTC(2024, 8 + i, 3)).toISOString().slice(0, 10);
    for (const [categoryId, payeeName, cents] of [
      [rent.id, 'Vermietung Muster', 10000],
      [software.id, 'Abo Muster', i < 16 ? 1000 : 7000],
    ] as const)
      await post('/bookings', {
        type: 'booking',
        accountId: account.id,
        date,
        payeeName,
        amountCents: -cents,
        splits: [{ categoryId, amountCents: -cents }],
      });
  }
  await page.goto('/reports/inflation');
  await expect(page.getByTestId('pi-rate')).toHaveText('0 %');
  await page.getByRole('link', { name: 'Warenkorb bearbeiten' }).click();
  const row = page.getByTestId('basket-category-' + software.id);
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 375, height: 844 });
  await expect(row).toContainText('Wunsch oder Zukunft');
  await row.getByLabel('Zählt mit:').selectOption('always');
  await expect(row.getByLabel('Zählt mit:')).toHaveValue('always');
  await expect(
    page.getByText(
      'Im Warenkorb: 2 Kategorien · Automatisch: 1 · Von dir gesetzt: 1 · Ausgeschlossen: 0',
    ),
  ).toBeVisible();
  await page.reload();
  await expect(row.getByLabel('Zählt mit:')).toHaveValue('always');
  await expect(row.getByRole('combobox')).toHaveCount(1);
  await expect(row.getByRole('checkbox')).toHaveCount(0);
  await expect(
    row.getByText('Abwählen, was nicht als Preis zählen soll (z. B. Zinsen).'),
  ).toBeVisible();
  await expect(row.getByRole('button', { name: 'Zuordnung speichern' })).toHaveCount(0);
  const choice = await row.getByLabel('Zählt mit:').boundingBox();
  expect(choice!.height).toBeGreaterThanOrEqual(44);
  await row.getByText('Ausnahmen (1)', { exact: true }).click();
  await expect(row.getByLabel('Abo Muster zählt mit')).toBeChecked();
  await inspectReport(page, info, 'inflation-basket-settings');
  await row.getByLabel('Abo Muster zählt mit').uncheck();
  await expect(row.getByLabel('Abo Muster zählt mit')).not.toBeChecked();
  await expect(row).toContainText('Nach den Ausnahmen fehlen regelmäßige Preise');
  await expect(row.getByLabel('Abo Muster zählt mit')).toBeEnabled();
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(row.getByLabel('Abo Muster zählt mit')).toBeChecked();
  await page.getByRole('link', { name: 'Zur persönlichen Inflation' }).click();
  await expect(page.getByTestId('pi-rate')).not.toHaveText('0 %');
  await expect(page.getByTestId('contributions-table')).toContainText('Software Muster');
  await expect(page.getByText('Warenkorb in den Einstellungen festgelegt')).toBeVisible();
  await page.getByRole('link', { name: 'Warenkorb bearbeiten' }).click();
  await row.getByLabel('Zählt mit:').selectOption('never');
  await expect(row.getByText('Ausgeschlossen', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(row.getByLabel('Zählt mit:')).toHaveValue('always');
  await row.getByLabel('Zählt mit:').selectOption('never');
  await expect(row.getByLabel('Zählt mit:')).toBeEnabled();
  await page.getByRole('link', { name: 'Zur persönlichen Inflation' }).click();
  await expect(page.getByTestId('pi-rate')).toHaveText('0 %');
  await inspectReport(page, info, 'inflation-basket-report');
});
