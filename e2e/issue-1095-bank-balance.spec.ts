import { randomUUID } from 'node:crypto';
import { openDatabase, schema } from '@budget/db';
import { eq } from 'drizzle-orm';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('bank balances prefill checks, expose differences and confirm with grouped Undo', async ({
  page,
  isolatedLedger,
}) => {
  const { origin, databasePath } = isolatedLedger;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`${origin}/api${path}`, {
      headers: { origin },
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const readAccounts = async () =>
    (await (await page.request.get(`${origin}/api/accounts`)).json()).accounts;
  const { group } = await post('/categories/groups', { name: 'Gruppe Muster' });
  const { category } = await post('/categories', {
    name: 'Bedarf Muster',
    class: 'need',
    groupId: group.id,
  });
  const ids: string[] = [];
  for (const name of ['Giro Gleich', 'Giro Differenz', 'Giro Manuell']) {
    const { account } = await post('/accounts', {
      name,
      type: 'checking',
      openingDate: '2026-09-01',
      openingBalanceCents: 10000,
    });
    ids.push(account.id);
    await post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: '2026-09-15',
      amountCents: -100,
      categoryId: category.id,
      status: 'confirmed',
    });
  }
  const staged = openDatabase(databasePath);
  try {
    const consentId = randomUUID();
    staged.db
      .insert(schema.bankSyncConsent)
      .values({
        id: consentId,
        initiator: 'synthetic',
        stateHash: consentId,
        expiresAt: '2027-01-01T00:00:00Z',
        nextRunAt: '2027-01-01T00:00:00Z',
        label: 'Bank Muster',
        status: 'paused',
      })
      .run();
    for (const [index, balanceCents] of [9900, 9800].entries()) {
      staged.db
        .insert(schema.bankSyncAccount)
        .values({
          id: randomUUID(),
          consentId,
          secret: 'synthetic',
          label: 'Konto Muster',
          accountId: ids[index]!,
          currency: 'EUR',
          balanceCents,
          balanceDate: '2026-09-30',
          balanceFetchedAt: '2026-09-30T10:00:00Z',
        })
        .run();
    }
  } finally {
    staged.close();
  }
  await page.goto('/monatsabschluss/2026-09');
  await expect(page.getByRole('heading', { name: '2. Konten abgleichen' })).toBeVisible();
  const row = (name: string) =>
    page.locator('.close-row').filter({ has: page.getByRole('heading', { name, exact: true }) });
  const matching = row('Giro Gleich');
  await expect(
    matching.getByText(/Bankstand vom 30.09.2026: 99,00 €.*Differenz:.*0,00 €/),
  ).toBeVisible();
  const difference = row('Giro Differenz');
  await page.screenshot({
    path: test.info().outputPath('month-close-bank-balances.png'),
    fullPage: true,
  });
  await expect(
    difference.getByText(/Bankstand vom 30.09.2026: 98,00 €.*Differenz:.*1,00 €/),
  ).toBeVisible();
  await expect(difference.getByRole('button', { name: 'Abgleich sperren bis heute' })).toHaveCount(
    0,
  );
  expect(
    (await readAccounts()).every(
      (a: { lastReconciledOn: string | null }) => a.lastReconciledOn === null,
    ),
  ).toBe(true);
  await matching.getByRole('button', { name: 'Abgleich sperren bis heute' }).click();
  await expect(matching.getByText('erledigt', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(matching.getByText('offen', { exact: true })).toBeVisible();
  expect((await readAccounts()).find((a: { id: string }) => a.id === ids[0])).toMatchObject({
    balanceCents: 9900,
    lastReconciledOn: null,
  });
  await difference.getByRole('button', { name: 'Kontostand prüfen', exact: true }).click();
  await expect(difference.getByLabel('Saldo laut Bank', { exact: true })).toHaveValue('98,00');
  await expect(
    difference.getByRole('button', { name: 'Differenz ausgleichen', exact: true }),
  ).toBeDisabled();
  expect((await readAccounts()).find((a: { id: string }) => a.id === ids[1])).toMatchObject({
    balanceCents: 9900,
    lastReconciledOn: null,
  });
  await difference.getByRole('button', { name: 'Einklappen', exact: true }).click();
  const manual = row('Giro Manuell');
  await manual.getByRole('button', { name: 'Kontostand prüfen', exact: true }).click();
  await expect(manual.getByLabel('Saldo laut Bank', { exact: true })).toHaveValue('');

  // A historical close uses the September snapshot; today's dialog needs today's bank day.
  const refreshed = openDatabase(databasePath);
  try {
    refreshed.db
      .update(schema.bankSyncAccount)
      .set({
        balanceDate: '2026-10-02',
        balanceFetchedAt: '2026-10-02T10:00:00Z',
      })
      .where(eq(schema.bankSyncAccount.accountId, ids[0]!))
      .run();
  } finally {
    refreshed.close();
  }
  await page.goto(`/konten/${ids[0]}?pruefen=reconcile`);
  const dialog = page.getByRole('dialog', { name: 'Kontostand prüfen · Giro Gleich', exact: true });
  await expect(dialog.getByLabel('Saldo laut Bank', { exact: true })).toHaveValue('99,00');
  await page.screenshot({
    path: test.info().outputPath('prefilled-bank-dialog.png'),
    fullPage: true,
  });
  await dialog.getByRole('button', { name: 'Abgleich sperren bis heute' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await readAccounts()).find((a: { id: string }) => a.id === ids[0]).lastReconciledOn,
    )
    .toBeNull();
  const bookings = (
    await (await page.request.get(`${origin}/api/bookings?accountId=${ids[0]}`)).json()
  ).items;
  expect(bookings).toMatchObject([{ amountCents: -100, status: 'confirmed' }]);
  expect(bookings).toHaveLength(1);
});
