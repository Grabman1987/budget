import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './isolated-ledger';
import { captureSaveControl, openAccountCapture, toast } from './ledger-helpers';

async function prepare(request: APIRequestContext, origin: string) {
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Musterkonto',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 100000,
  });
  const { group } = await post('/categories/groups', { name: 'Mustergruppe' });
  return { account, group, post };
}

async function create(page: Page, name: string, groupId: string) {
  const dialog = page.getByRole('dialog', { name: 'Kategorie anlegen', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByLabel('Gruppe', { exact: true }).selectOption(groupId);
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  return dialog;
}

async function openCreate(page: Page) {
  await page
    .getByRole('dialog', { name: /Buchung (erfassen|bearbeiten)/ })
    .getByRole('combobox', { name: 'Kategorie', exact: true })
    .fill('Fehlende Kategorie');
  await page.getByRole('option', { name: 'Neue Kategorie …', exact: true }).click();
}

test('capture rejects duplicates and undoes an unused category without losing the draft', async ({
  page,
  request,
  baseURL,
}) => {
  const { account, group, post } = await prepare(request, baseURL!);
  await post('/categories', { name: 'Musterposten', groupId: group.id, class: 'need' });
  const names = async () =>
    (await (await request.get('/api/categories')).json()).categories.map(
      (c: { name: string }) => c.name,
    );
  await page.goto(`/konten/${account.id}`);
  await openAccountCapture(page);
  const capture = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
  await capture.getByLabel('Betrag', { exact: true }).fill('12,34');
  await openCreate(page);
  const duplicate = await create(page, ' musterPOSTEN ', group.id);
  await expect(duplicate.getByRole('alert')).toHaveText('Dieser Name wird schon verwendet.');
  page.once('dialog', (dialog) => dialog.accept());
  await duplicate.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(capture.getByLabel('Betrag', { exact: true })).toHaveValue('12,34');
  await openCreate(page);
  await create(page, 'Unbenutzter Posten', group.id);
  await expect(capture.getByRole('combobox', { name: 'Kategorie', exact: true })).toHaveValue(
    'Unbenutzter Posten',
  );
  await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect.poll(names).not.toContain('Unbenutzter Posten');
  await expect(capture.getByRole('combobox', { name: 'Kategorie', exact: true })).toHaveValue('');
  await expect(capture.getByLabel('Betrag', { exact: true })).toHaveValue('12,34');
});

test('capture saves the created category and desktop inline editing reuses the form', async ({
  page,
  request,
  baseURL,
}, info) => {
  const { account, group } = await prepare(request, baseURL!);
  await page.goto(`/konten/${account.id}`);
  await openAccountCapture(page);
  const capture = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
  await capture.getByLabel('Betrag', { exact: true }).fill('12,34');
  await capture.getByLabel('Empfänger', { exact: true }).fill('Musterladen');
  await openCreate(page);
  await create(page, 'Erfasster Posten', group.id);
  await expect(capture.getByRole('combobox', { name: 'Kategorie', exact: true })).toHaveValue(
    'Erfasster Posten',
  );
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/bookings') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
    ),
    captureSaveControl(capture).click(),
  ]);
  await expect(capture).toBeHidden();
  const bookings = await (await request.get(`/api/bookings?accountId=${account.id}`)).json();
  const booking = bookings.items.find((b: { amountCents: number }) => b.amountCents === -1234);
  expect(booking).toBeTruthy();
  const read = async () =>
    (await (await request.get(`/api/bookings/${booking.id}`)).json()).booking;
  expect(await read()).toMatchObject({ amountCents: -1234, status: 'pending' });
  if (info.project.name === 'desktop') {
    const row = page.locator(`[data-booking="${booking.id}"]`);
    await row.getByRole('button', { name: /^Kategorie ändern/ }).click();
    await row.getByRole('combobox').selectOption({ label: 'Neue Kategorie …' });
    await page
      .getByRole('dialog', { name: 'Kategorie anlegen', exact: true })
      .getByRole('heading', { name: 'Kategorie anlegen', exact: true })
      .last()
      .click();
    await expect(page.getByRole('dialog', { name: 'Buchung bearbeiten', exact: true })).toHaveCount(
      0,
    );
    await create(page, 'Inline Posten', group.id);
    await expect(row).toContainText('Inline Posten');
    await expect(row.getByRole('button', { name: /^Kategorie ändern/ })).toBeFocused();
    expect(await read()).toMatchObject({ amountCents: -1234, status: 'pending' });
  }
});

test('Prüfen selects a created category and preserves the bank amount and status', async ({
  page,
  request,
  baseURL,
}, info) => {
  const { account, group, post } = await prepare(request, baseURL!);
  const { id } = await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-02',
    amountCents: -1234,
    status: 'pending',
    memo: 'Musterumsatz',
  });
  await page.goto('/konten/pruefen?modus=gefuehrt');
  await page
    .locator('.guided-card')
    .getByRole('button', { name: 'Bearbeiten', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await openCreate(page);
  await create(page, 'Geprüfter Posten', group.id);
  const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten', exact: true });
  await expect(edit.getByRole('combobox', { name: 'Kategorie', exact: true })).toHaveValue(
    'Geprüfter Posten',
  );
  const screenshot = info.outputPath('category-selected.png');
  await page.screenshot({ path: screenshot });
  await info.attach('picker-category-selected', {
    path: screenshot,
    contentType: 'image/png',
  });
  await captureSaveControl(edit).click();
  await expect(edit).toBeHidden();
  const tree = await (await request.get('/api/categories')).json();
  const category = tree.categories.find((c: { name: string }) => c.name === 'Geprüfter Posten');
  const read = async () => (await (await request.get(`/api/bookings/${id}`)).json()).booking;
  await expect.poll(read).toMatchObject({
    amountCents: -1234,
    status: 'pending',
    splits: [{ categoryId: category.id, amountCents: -1234 }],
  });
});
