import { randomUUID } from 'node:crypto';
import { openDatabase, schema } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { toast } from './ledger-helpers';

test('explicit inline counter-account suggestion links a transfer and Undo restores both sides', async ({
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
  const { account: source } = await post('/accounts', {
    name: 'Synthetic source',
    type: 'checking',
    openingDate: '2026-09-01',
  });
  const { account: destination } = await post('/accounts', {
    name: 'Synthetic destination',
    type: 'savings',
    openingDate: '2026-09-01',
  });
  const { id: bookingId } = await post('/bookings', {
    type: 'booking',
    accountId: destination.id,
    date: '2026-10-02',
    amountCents: 1201,
    status: 'pending',
    memo: 'Synthetic counterpart',
    splits: [{ amountCents: 1201, categoryId: null }],
  });
  const id = randomUUID();
  const opened = openDatabase(databasePath);
  try {
    opened.db
      .insert(schema.bankSyncCandidate)
      .values({
        id,
        accountId: source.id,
        dedupeKey: id,
        date: '2026-10-02',
        amountCents: -1201,
        currency: 'EUR',
        memo: 'Synthetic transfer candidate',
      })
      .run();
    opened.db
      .insert(schema.inboxItem)
      .values({
        id,
        kind: 'import',
        title: 'Bankumsatz prüfen',
        refType: 'bank-sync-candidate',
        refId: id,
        createdAt: '2026-10-02T12:00:00Z',
      })
      .run();
  } finally {
    opened.close();
  }
  await page.goto('/konten/pruefen');
  const row = page
    .locator('.bank-editable-row')
    .filter({ hasText: 'Synthetic transfer candidate' });
  // The blocked row has one button in the suggestion cell: it opens the choice list.
  await row.locator('.bank-v1-suggestion button').first().click();
  await expect(row.getByRole('option', { name: /Umbuchung: Synthetic destination/ })).toHaveCount(
    1,
  );
  await row
    .getByRole('combobox', { name: 'Vorschlag', exact: true })
    .selectOption(`transfer:${bookingId}`);
  await expect(
    row.getByRole('button', {
      name: 'Vorschlag bestätigen: Überweisung an Synthetic destination',
    }),
  ).toBeVisible();
  await expect(row.getByRole('button', { name: 'Kategorie wählen' })).toHaveCount(0);
  const counterpart = async () =>
    (await (await request.get(`${origin}/api/bookings/${bookingId}`)).json()).booking;
  expect((await counterpart()).transferId).toBeNull();
  await row.getByRole('button', { name: /^Vorschlag bestätigen/ }).click();
  await expect(row).toHaveCount(0);
  const linked = await counterpart();
  expect(linked.transferId).toBeTruthy();
  expect(linked.amountCents).toBe(1201);
  const sourceRows = (
    await (await request.get(`${origin}/api/bookings?accountId=${source.id}`)).json()
  ).items;
  expect(sourceRows).toHaveLength(1);
  expect(sourceRows[0]).toMatchObject({ amountCents: -1201, transferId: linked.transferId });
  await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(row).toBeVisible();
  expect((await counterpart()).transferId).toBeNull();
  expect(
    (await (await request.get(`${origin}/api/bookings?accountId=${source.id}`)).json()).items,
  ).toHaveLength(0);
});
