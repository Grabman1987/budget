import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { openDatabase, schema } from '@budget/db';
import { test } from './isolated-ledger';

test.setTimeout(120_000);
test('takes an undated bank balance, captures the missing booking and locks only through yesterday', async ({
  page,
  request,
  isolatedLedger,
}) => {
  const { origin, databasePath } = isolatedLedger;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(origin + '/api' + path, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Giro Muster',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 10000,
  });
  const { group } = await post('/categories/groups', { name: 'Gruppe Muster' });
  const { category } = await post('/categories', {
    name: 'Kategorie Muster',
    class: 'need',
    groupId: group.id,
  });
  const staged = openDatabase(databasePath);
  try {
    const id = randomUUID();
    staged.db
      .insert(schema.bankSyncConsent)
      .values({
        id,
        initiator: 'synthetic',
        stateHash: id,
        expiresAt: '2027-01-01T00:00:00Z',
        nextRunAt: '2027-01-01T00:00:00Z',
        label: 'Bank Muster',
        status: 'paused',
      })
      .run();
    staged.db
      .insert(schema.bankSyncAccount)
      .values({
        id: randomUUID(),
        consentId: id,
        secret: 'synthetic',
        label: 'Konto Muster',
        accountId: account.id,
        currency: 'XXX',
        balanceCents: 8766,
        balanceDate: null,
        balanceFetchedAt: '2026-10-01T10:00:00Z',
      })
      .run();
  } finally {
    staged.close();
  }
  await page.goto(`/konten/${account.id}`);
  await page
    .getByRole('button', { name: 'Nie geprüft – jetzt prüfen · Kontostand prüfen', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Kontostand prüfen · Giro Muster', exact: true });
  await dialog.getByRole('button', { name: /Bankstand übernehmen/ }).click();
  await expect(dialog.getByLabel('Stichtag')).toHaveValue('01.10.2026');
  await expect(dialog.getByLabel('Saldo laut Bank', { exact: true })).toHaveValue('87,66');
  await expect(dialog.getByRole('button', { name: 'Fehlende Buchung erfassen' })).toBeVisible();
  const getBookings = async () =>
    (await (await request.get(origin + '/api/bookings?accountId=' + account.id)).json()).items;
  expect(await getBookings()).toEqual([]);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset['theme'] = theme;
    }, theme);
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (page.viewportSize()!.width === 390) {
      const buttons = await dialog.locator('button:visible').all();
      for (const button of buttons)
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: test.info().outputPath(`reconcile-${theme}.png`) });
  }
  await dialog.getByRole('button', { name: 'Fehlende Buchung erfassen' }).click();
  const booking = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
  await expect(booking.getByLabel('Betrag', { exact: true })).toHaveValue('12,34');
  await expect(booking.getByLabel('Datum', { exact: true })).toHaveValue('01.10.2026');
  await booking.getByLabel('Empfänger', { exact: true }).fill('Laden Muster');
  await booking.getByLabel('Kategorie', { exact: true }).fill('Kategorie Muster');
  await booking.getByRole('option', { name: /Kategorie Muster/ }).click();
  await booking.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(booking).not.toBeVisible();
  await expect(dialog.getByRole('button', { name: /Festschreiben/ })).toBeVisible();
  expect(await getBookings()).toMatchObject([
    { accountId: account.id, date: '2026-10-01', amountCents: -1234, status: 'confirmed' },
  ]);
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-02',
    amountCents: -50,
    categoryId: category.id,
    status: 'pending',
  });
  await page.reload();
  await page.getByRole('button', { name: 'Abgleich sperren bis heute' }).click();
  await expect(page.getByText('Abgeglichen bis: 01.10.2026', { exact: false })).toBeVisible();
  const rows = await getBookings();
  expect(rows.find((b: { date: string }) => b.date === '2026-10-02').status).toBe('pending');
  expect(rows.find((b: { date: string }) => b.date === '2026-10-01').status).toBe('reconciled');
});

test('custom adjustment date/category creates one reviewed booking and supports undo', async ({
  page,
  request,
  isolatedLedger,
}) => {
  const { origin } = isolatedLedger;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(origin + '/api' + path, { headers: { origin }, data });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Giro Ausgleich',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 10000,
  });
  const { group } = await post('/categories/groups', { name: 'Gruppe Ausgleich' });
  const { category } = await post('/categories', {
    name: 'Kategorie Ausgleich',
    class: 'need',
    groupId: group.id,
  });
  await page.goto(`/konten/${account.id}`);
  await page
    .getByRole('button', { name: 'Nie geprüft – jetzt prüfen · Kontostand prüfen', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: /Kontostand prüfen/ });
  await dialog.getByLabel('Stichtag').fill('01.10.2026');
  await dialog.getByLabel('Saldo laut Bank', { exact: true }).fill('99');
  await dialog.getByLabel('Ausgleichsdatum').fill('25.09.2026');
  await dialog.getByLabel('Kategorie für den Ausgleich').selectOption(category.id);
  await expect(
    dialog.getByText(/Eine echte Buchung.*25.09.2026.*Kategorie Ausgleich/),
  ).toBeVisible();
  await dialog.getByRole('button', { name: /Differenz ausgleichen/ }).click();
  await expect(dialog).not.toBeVisible();
  const rows = (await (await request.get(origin + '/api/bookings?accountId=' + account.id)).json())
    .items;
  expect(rows).toMatchObject([
    {
      date: '2026-09-25',
      amountCents: -100,
      status: 'reconciled',
      splits: [{ categoryId: category.id }],
    },
  ]);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByTestId('account-balance')).toHaveText('100,00 €');
});
