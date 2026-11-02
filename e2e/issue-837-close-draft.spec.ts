import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-15' });
test('close draft uses its original basis, refreshes conflicts and guards leave/stay without progress writes', async ({
  page,
  request,
  baseURL,
}) => {
  const send = async (method: string, path: string, data: unknown) => {
    const response = await request.fetch(`/api${path}`, {
      method,
      data,
      headers: { origin: baseURL! },
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  await send('POST', '/accounts', {
    name: 'Synthetic close funds',
    type: 'checking',
    openingDate: '2026-09-01',
    openingBalanceCents: 20_000,
  });
  const { group } = await send('POST', '/categories/groups', { name: 'Synthetic close group' });
  const { category } = await send('POST', '/categories', {
    name: 'Synthetic close category',
    groupId: group.id,
    kind: 'variable',
    class: 'need',
    stage: 2,
  });
  await send('PUT', '/budget/2026-10/assigned', {
    items: [{ categoryId: category.id, assignedCents: 1_000 }],
  });
  await page.goto('/monatsabschluss/2026-09');
  await expect(page.locator('.month-close')).toBeVisible();
  const inspect = page.getByRole('combobox', { name: /Schritt nur ansehen/ });
  if ((await page.locator('.app').getAttribute('data-budget-redesign')) !== '1') {
    await expect(inspect).toHaveCount(0);
    return;
  }
  const writes: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(r.method()))
      writes.push(r.method());
  });
  await inspect.selectOption('4');
  const field = page.getByRole('textbox', {
    name: 'Plan für Synthetic close category',
    exact: true,
  });
  await field.fill('50,00');
  expect(writes).toEqual([]);
  await send('PUT', '/budget/2026-10/assigned', {
    items: [{ categoryId: category.id, assignedCents: 8_000 }],
  });
  const apply = page.getByRole('button', { name: 'Plan übernehmen · alle', exact: true });
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/budget/2026-10/assigned') && r.request().method() === 'PUT',
  );
  await apply.click();
  expect((await response).status()).toBe(409);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Dein Entwurf bleibt erhalten' }),
  ).toBeVisible();
  await expect(field).toHaveValue('50,00');
  await expect(apply).toBeEnabled();
  await apply.click();
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(field).toHaveValue('80,00');
  await field.fill('60,00');
  const back = page.getByRole('link', { name: 'Plan › September 2026', exact: true });
  await back.click();
  const guard = page.getByRole('dialog', { name: 'Entwurf behalten?', exact: true });
  await expect(guard).toBeVisible();
  await guard.getByRole('button', { name: 'Hier bleiben', exact: true }).click();
  await expect(field).toHaveValue('60,00');
  await back.click();
  await guard.getByRole('button', { name: 'Entwurf verwerfen und verlassen', exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-09$/);
  expect(writes).toEqual(['PUT', 'PUT', 'POST']);
});
