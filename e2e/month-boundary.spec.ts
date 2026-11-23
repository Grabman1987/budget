import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { captureSaveControl, toast } from './ledger-helpers';

test.use({ ledgerToday: '2024-03-01' });

test('confirming a split booking across leap day preserves both categories with one Undo', async ({
  page,
  request,
  baseURL,
}) => {
  const post = async (path: string, data: unknown) => {
    const response = await request.post('/api' + path, { headers: { origin: baseURL! }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Konto Muster',
    type: 'checking',
    openingDate: '2024-02-01',
    openingBalanceCents: 10_003,
  });
  const { group } = await post('/categories/groups', { name: 'Alltag Muster' });
  const splits = [];
  for (const [name, amountCents] of [
    ['Bedarf Muster', -301],
    ['Freizeit Muster', -200],
  ] as const) {
    const { category } = await post('/categories', {
      name,
      groupId: group.id,
      class: 'need',
      kind: 'variable',
    });
    splits.push({ categoryId: category.id, amountCents });
  }
  const { id } = await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2024-02-29',
    amountCents: -501,
    payeeName: 'Laden Muster',
    status: 'pending',
    splits,
  });
  await page.goto(`/konten/${account.id}`);
  if (process.env['A2_EXPECT_REDESIGN'] === '1')
    await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
  const row = page.locator(`[data-booking="${id}"]`);
  await expect(row.getByRole('button', { name: 'vorgemerkt', exact: true })).toBeVisible();
  await row.getByRole('button', { name: /bearbeiten/ }).click();
  const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  const date = edit.getByLabel('Datum', { exact: true });
  await expect(date).toHaveValue('29.02.2024');
  await date.fill('01.03.2024');
  await edit.getByRole('button', { name: 'Vorgemerkt', exact: true }).click();
  await expect(edit.getByRole('button', { name: 'Bestätigt', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await captureSaveControl(edit).click();
  await expect(edit).toBeHidden();
  await expect(row.getByRole('button', { name: 'bestätigt', exact: true })).toBeVisible();

  const booking = async () => {
    const response = await request.get('/api/bookings/' + id);
    expect(response.ok()).toBe(true);
    return (await response.json()).booking;
  };
  expect(await booking()).toMatchObject({ date: '2024-03-01', status: 'confirmed', splits });
  await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(row.getByRole('button', { name: 'vorgemerkt', exact: true })).toBeVisible();
  expect(await booking()).toMatchObject({ date: '2024-02-29', status: 'pending', splits });
});
