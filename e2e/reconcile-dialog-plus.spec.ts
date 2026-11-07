import { accountBankReview, redesignLoaded, MIN_TARGET_PX } from './ledger-helpers';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { openDatabase, schema } from '@budget/db';
import { test } from './isolated-ledger';

test.setTimeout(120_000);
test('adjusts today from an undated bank balance and retains historical API bank locking', async ({
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
  await (
    (await redesignLoaded(page))
      ? page.getByTestId('account-review-badge')
      : page.getByRole('button', {
          name: 'Nie geprüft – jetzt prüfen · Kontostand prüfen',
          exact: true,
        })
  ).click();
  const dialog = page.getByRole('dialog', { name: 'Kontostand prüfen · Giro Muster', exact: true });
  const close = dialog.getByRole('button', { name: 'Schließen', exact: true });
  expect((await close.innerText()).trim()).toBe('');
  expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  await close.press('Escape');
  await expect(dialog).toBeHidden();
  await page.goto(`/konten/${account.id}?pruefen=reconcile`);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Bankstand übernehmen/ }).click();
  await expect(dialog.getByLabel('Stichtag')).toHaveCount(0);
  await expect(dialog.getByText('Stichtag und Ausgleich: heute, 02.10.2026.')).toBeVisible();
  await expect(dialog.getByLabel('Saldo laut Bank', { exact: true })).toHaveValue('87,66');
  await expect(
    dialog.getByRole('button', { name: 'Differenz ausgleichen', exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Fehlende Buchung erfassen' })).toHaveCount(0);
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
  await dialog.getByRole('button', { name: 'Differenz ausgleichen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await getBookings()).toMatchObject([
    {
      accountId: account.id,
      date: '2026-10-02',
      amountCents: -1234,
      status: 'reconciled',
      splits: [{ categoryId: null }],
    },
  ]);
  // Today's UI correction cannot make yesterday's ledger match a historical bank balance.
  // Undo it, then retain the existing API-only historical check for the separate bank-lock proof.
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByTestId('account-balance')).toHaveText('100,00 €');
  expect(await getBookings()).toEqual([]);
  await post(`/accounts/${account.id}/reconciliation`, {
    date: '2026-10-01',
    statementBalanceCents: 8766,
    adjust: true,
  });
  await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-02',
    amountCents: -50,
    categoryId: category.id,
    status: 'pending',
  });
  await page.reload();
  await accountBankReview(page);
  await page.getByRole('button', { name: 'Abgleich sperren bis heute' }).click();
  await expect(page.getByText('Abgeglichen bis: 01.10.2026', { exact: false })).toBeVisible();
  const rows = await getBookings();
  expect(rows.find((b: { amountCents: number }) => b.amountCents === -50).status).toBe('pending');
  expect(rows.find((b: { date: string }) => b.date === '2026-10-01')).toMatchObject({
    amountCents: -1234,
    status: 'reconciled',
  });
});

test('today adjustment defaults to ready to assign and one Undo restores bookings and reconciliation', async ({
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
  await page.goto(`/konten/${account.id}`);
  await (
    (await redesignLoaded(page))
      ? page.getByTestId('account-review-badge')
      : page.getByRole('button', {
          name: 'Nie geprüft – jetzt prüfen · Kontostand prüfen',
          exact: true,
        })
  ).click();
  const dialog = page.getByRole('dialog', { name: /Kontostand prüfen/ });
  await expect(dialog.getByLabel('Stichtag')).toHaveCount(0);
  await expect(dialog.getByLabel('Saldo laut Bank', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Saldo laut Bank', { exact: true })).toHaveAttribute(
    'placeholder',
    '100,00',
  );
  await expect(dialog.getByRole('button', { name: 'Kontostand stimmt' })).toHaveCount(0);
  await dialog.getByLabel('Saldo laut Bank', { exact: true }).fill('99');
  await expect(dialog.getByLabel('Ausgleichsdatum')).toHaveCount(0);
  await expect(dialog.getByText(/Eine echte Buchung.*02.10.2026.*Zu verteilen/)).toBeVisible();
  await dialog.getByRole('button', { name: /Differenz ausgleichen/ }).click();
  await expect(dialog).not.toBeVisible();
  const rows = (await (await request.get(origin + '/api/bookings?accountId=' + account.id)).json())
    .items;
  expect(rows).toMatchObject([
    {
      date: '2026-10-02',
      amountCents: -100,
      status: 'reconciled',
      splits: [{ categoryId: null }],
    },
  ]);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByTestId('account-balance')).toHaveText('100,00 €');
  expect(
    (await (await request.get(origin + '/api/bookings?accountId=' + account.id)).json()).items,
  ).toEqual([]);
  const restored = (await (await request.get(origin + '/api/accounts')).json()).accounts.find(
    (row: { id: string }) => row.id === account.id,
  );
  expect(restored.lastReconciledOn).toBeNull();
  expect(restored.balanceCents).toBe(10000);
});
