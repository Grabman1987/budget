import { createBooking, openDatabase } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { openPruefenPart } from './pruefen-part';

test.use({ ledgerToday: '2026-10-20' });

test('Prüfen suggests provider funding and links both legs only after confirmation', async ({
  page,
  request,
  isolatedLedger,
}) => {
  const { origin, databasePath } = isolatedLedger;
  async function account(name: string) {
    const response = await request.post(`${origin}/api/accounts`, {
      headers: { origin },
      data: { name, type: 'checking', openingDate: '2026-10-01' },
    });
    expect(response.ok()).toBe(true);
    return ((await response.json()).account as { id: string }).id;
  }
  const giro = await account('Giro A');
  const provider = await account('Zahlungsdienst B');
  const opened = openDatabase(databasePath);
  let debit: string;
  let credit: string;
  try {
    debit = createBooking(
      opened.db,
      {
        accountId: giro,
        date: '2026-10-19',
        amountCents: -1703,
        memo: 'Zahlungsdienst Aufladung',
        status: 'pending',
        source: 'bank',
        importKey: 'bank-sync:synthetic-1290',
        splits: [{ amountCents: -1703 }],
      },
      { actor: 'tester' },
    );
    credit = createBooking(
      opened.db,
      {
        accountId: provider,
        date: '2026-10-20',
        amountCents: 1703,
        memo: 'Aufladung Eingang',
        status: 'confirmed',
        splits: [{ amountCents: 1703 }],
      },
      { actor: 'tester' },
    );
  } finally {
    opened.close();
  }
  const booking = async (id: string) => {
    const response = await request.get(`${origin}/api/bookings/${id}`);
    expect(response.ok()).toBe(true);
    return (await response.json()).booking as { transferId: string | null; amountCents: number };
  };
  await page.goto('/konten/pruefen?von=%2F');
  await openPruefenPart(page, 'Umsätze');
  const row = page.getByTestId('inbox-row').filter({ hasText: 'Zahlungsdienst Aufladung' });
  // Counterpart choices sit in the row's "Weitere Aktionen" menu.
  await row.locator('summary').click();
  const dialog = row;
  await expect(dialog.getByLabel('Vorgeschlagene Gegenbuchung')).toHaveValue(credit);
  expect(await booking(debit)).toMatchObject({ transferId: null, amountCents: -1703 });
  expect(await booking(credit)).toMatchObject({ transferId: null, amountCents: 1703 });

  await dialog.getByRole('button', { name: 'Als Umbuchung verbinden' }).click();
  await expect(page.getByText('Als Umbuchung verbunden; Kategorien entfernt.')).toBeVisible();
  const transferId = (await booking(debit)).transferId;
  expect(transferId).toBeTruthy();
  expect(await booking(credit)).toMatchObject({ transferId, amountCents: 1703 });
  await expect(dialog.getByLabel('Vorgeschlagene Gegenbuchung')).toHaveCount(0);

  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByText('Rückgängig gemacht.', { exact: true })).toBeVisible();
  expect(await booking(debit)).toMatchObject({ transferId: null, amountCents: -1703 });
  expect(await booking(credit)).toMatchObject({ transferId: null, amountCents: 1703 });
});
