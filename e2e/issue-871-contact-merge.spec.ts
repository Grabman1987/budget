import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { MIN_TARGET_PX } from './ledger-helpers';

test.use({ ledgerToday: '2026-10-15' });

test('E2d merges a contact through preview and confirm, keeps booking facts and Undo restores it', async ({
  page,
  request,
  baseURL,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const post = async <T>(path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers: { origin: baseURL! }, data });
    expect(response.ok()).toBe(true);
    return response.json() as Promise<T>;
  };
  const { contact: source } = await post<{ contact: { id: string } }>('/contacts', {
    name: 'Synthetic merge source',
  });
  await post('/contacts', { name: 'Synthetic merge target' });
  const { account } = await post<{ account: { id: string } }>('/accounts', {
    name: 'Synthetic merge funds',
    type: 'checking',
    openingDate: '2026-09-01',
    openingBalanceCents: 10000,
  });
  const { group } = await post<{ group: { id: string } }>('/categories/groups', {
    name: 'Synthetic merge group',
  });
  const { category } = await post<{ category: { id: string } }>('/categories', {
    name: 'Synthetic merge advance',
    groupId: group.id,
    kind: 'advance',
    class: null,
  });
  const { bookings } = await post<{ bookings: { id: string }[] }>('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-09-01',
    amountCents: -2300,
    status: 'confirmed',
    splits: [{ categoryId: category.id, contactId: source.id, amountCents: -2300 }],
  });
  const readBooking = async () =>
    (await request.get(`/api/bookings/${bookings[0]!.id}`)).json() as Promise<unknown>;
  const before = await readBooking();

  await page.goto('/einstellungen/kontakte');
  const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  test.skip(!on, 'Merge lives in the redesigned contact settings only.');
  const trigger = page.getByRole('button', {
    name: 'Synthetic merge source zusammenführen',
    exact: true,
  });
  expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Kontakte zusammenführen', exact: true });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Zusammenführen bestätigen', exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole('combobox', { name: 'Zusammenführen mit', exact: true })
    .selectOption({ label: 'Synthetic merge target' });
  await dialog.getByRole('button', { name: 'Vorschau anzeigen', exact: true }).click();
  const preview = dialog.getByRole('region', { name: 'Vorschau der Zusammenführung', exact: true });
  await expect(preview).toContainText('wird ein Alias des Ziels');
  expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Zusammenführen bestätigen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Kontakte zusammengeführt.')).toBeVisible();
  expect(await readBooking()).toEqual(before);
  await expect(trigger).toHaveCount(0);

  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(trigger).toBeVisible();
  expect(await readBooking()).toEqual(before);
});
