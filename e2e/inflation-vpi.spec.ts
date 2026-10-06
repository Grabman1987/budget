import { expect } from '@playwright/test';
import { openDatabase, storeCpi } from '@budget/db';
import { monthsBetween } from '@budget/domain';
import { test } from './isolated-ledger';
import { inspectReport } from './spending-helpers';

test('CPI method and searchable two-class mapping persist and show index units', async ({
  page,
  request,
  baseURL,
  isolatedLedger,
}, info) => {
  test.setTimeout(120_000);
  const headers = { origin: baseURL! };
  const post = async (path: string, data: unknown) => {
    const response = await request.post('/api' + path, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Giro Beispiel',
    type: 'checking',
    openingDate: '2024-09-01',
  });
  const { group } = await post('/categories/groups', { name: 'Alltag Beispiel' });
  const { category } = await post('/categories', {
    name: 'Lebensmittel Beispiel',
    groupId: group.id,
    class: 'need',
    kind: 'variable',
  });
  for (const m of monthsBetween('2024-09', '2026-09'))
    await post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: `${m}-03`,
      amountCents: -1000,
      splits: [{ categoryId: category.id, amountCents: -1000 }],
    });
  const opened = openDatabase(isolatedLedger.databasePath);
  for (const [series, change] of [
    ['vpi', 5],
    ['vpi:01.1', 10],
    ['vpi:12.1.3', 20],
  ] as const)
    storeCpi(
      opened.db,
      series,
      monthsBetween('2024-09', '2026-09').map((month) => ({
        month,
        indexMicro: (month < '2026-01' ? 100 : 100 + change) * 1_000_000,
      })),
      '2026-10-01',
      'fixture',
    );
  opened.close();
  await page.goto('/einstellungen/warenkorb');
  const row = page.getByTestId('basket-category-' + category.id);
  await row.getByLabel('Im Warenkorb:').selectOption('always');
  await expect(row.getByLabel('Im Warenkorb:')).toHaveValue('always');
  await row.getByLabel('Methode:').selectOption('cpi');
  await row.getByRole('combobox', { name: 'COICOP-Klasse 1' }).fill('Nahrung');
  await row.getByRole('option', { name: '01.1 Nahrungsmittel', exact: true }).click();
  await row.getByRole('combobox', { name: 'COICOP-Klasse 2' }).fill('Körper');
  await row.getByRole('option', { name: '12.1.3 Körperpflegeartikel', exact: true }).click();
  await row.getByLabel('Anteil Klasse 1 (%)').fill('80');
  await row.getByRole('button', { name: 'Zuordnung speichern' }).click();
  await expect(row.getByText('Zuordnung gespeichert')).toBeVisible();
  await page.reload();
  await expect(row.getByLabel('Methode:')).toHaveValue('cpi');
  await expect(row.getByRole('combobox', { name: 'COICOP-Klasse 1' })).toHaveValue(
    '01.1 Nahrungsmittel',
  );
  await expect(row.getByLabel('Anteil Klasse 1 (%)')).toHaveValue('80');
  await inspectReport(page, info, 'vpi-settings');
  await page.getByRole('link', { name: 'Zur persönlichen Inflation' }).click();
  await expect(page.getByTestId('pi-rate')).toHaveText('+12 %');
  const basket = page.getByTestId('inflation-basket');
  await expect(basket).toContainText('VPI-Teilindex 01.1');
  await expect(basket).toContainText('mit deinem Gewicht');
  await expect(basket).toContainText('112,0');
  await expect(basket).not.toContainText('€');
  await inspectReport(page, info, 'vpi-report');
  await page.getByRole('button', { name: 'Je Jahr', exact: true }).click();
  await expect(page.getByTestId('inflation-basket-yearly')).toContainText('VPI-Teilindex');
  await expect(page.getByTestId('inflation-basket-yearly')).not.toContainText('€');
});
