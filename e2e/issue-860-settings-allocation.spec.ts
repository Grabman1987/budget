import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('one settings editor saves exact quotas and stage bounds, reloads and undoes', async ({
  page,
  request,
  baseURL,
}) => {
  const headers = { origin: baseURL! };
  const ids: string[] = [];
  for (const name of ['Synthetic class A', 'Synthetic class B']) {
    const response = await request.post('/api/asset-classes', { headers, data: { name } });
    expect(response.status()).toBe(201);
    ids.push((await response.json()).assetClass.id as string);
  }
  await page.goto('/einstellungen/anlageklassen?ansicht=stufen');
  const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  if (!on) {
    await page.getByRole('link', { name: 'Sollquoten bearbeiten', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Sollquoten bearbeiten' })).toBeVisible();
    return;
  }
  await expect(page.locator('#settings-target-form')).toHaveCount(1);
  await expect(page.getByText('Unverwaltet', { exact: true })).toHaveCount(2);
  for (const name of ['Synthetic class A', 'Synthetic class B'])
    await page.getByRole('checkbox', { name: `${name} im Sollmodell berücksichtigen` }).check();
  const shareA = page.getByLabel('Synthetic class A · Soll (%)', { exact: true });
  await shareA.fill('1000');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(shareA).toHaveAttribute('aria-invalid', 'true');
  await expect(shareA).toBeFocused();
  expect((await (await request.get('/api/asset-classes/targets')).json()).versions).toEqual([]);
  await shareA.fill('80');
  await page.getByLabel('Synthetic class B · Soll (%)', { exact: true }).fill('20');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.locator('.toast.is-open')).toContainText('Sollversion gespeichert.');
  const read = async () =>
    (await (await request.get('/api/asset-classes/targets')).json()).versions as {
      targets: { assetClassId: string; targetShareBp: number }[];
      tiers: { upToCents: number | null }[];
    }[];
  expect((await read())[0]!.targets).toMatchObject([
    { assetClassId: ids[0], targetShareBp: 8000 },
    { assetClassId: ids[1], targetShareBp: 2000 },
  ]);
  await page.reload();
  await expect(page.getByLabel('Synthetic class A · Soll (%)', { exact: true })).toHaveValue(
    '80,00',
  );
  await page.getByText('Dynamische Stufen nach Anlagesumme', { exact: true }).click();
  await page.getByLabel('Stufe 2 · Ab Vermögen (€)', { exact: true }).fill('2500');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.locator('.toast.is-open')).toContainText('Sollversion gespeichert.');
  expect((await read())[0]!.tiers.map((tier) => tier.upToCents)).toEqual([
    249999,
    1999999,
    4999999,
    null,
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
  await expect.poll(async () => (await read())[0]!.tiers).toEqual([]);
  await expect(
    page.getByRole('checkbox', { name: 'Dynamische Stufen nach Anlagesumme' }),
  ).not.toBeChecked();
  expect((await read())[0]!.targets).toMatchObject([
    { assetClassId: ids[0], targetShareBp: 8000 },
    { assetClassId: ids[1], targetShareBp: 2000 },
  ]);
});
