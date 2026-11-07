import { randomUUID } from 'node:crypto';
import { openDatabase, schema } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { bankPreviewControl } from './ledger-helpers';

test.use({ ledgerToday: '2026-10-27', bankingConfigured: true });

test('bank matching explains ambiguous fifth-day suggestions before any write', async ({
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
    name: 'Synthetic matching account',
    type: 'checking',
    openingDate: '2026-10-01',
    openingBalanceCents: 10000,
  });
  for (const date of ['2026-10-22', '2026-11-01']) {
    await post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date,
      amountCents: -1250,
      status: 'confirmed',
      memo: 'Synthetic matching target',
      splits: [{ amountCents: -1250, categoryId: null }],
    });
  }
  const candidateId = randomUUID();
  const opened = openDatabase(databasePath);
  try {
    opened.db
      .insert(schema.bankSyncCandidate)
      .values({
        id: candidateId,
        accountId: account.id,
        dedupeKey: 'synthetic-516',
        date: '2026-10-27',
        amountCents: -1250,
        currency: 'EUR',
        memo: 'Synthetic bank source',
      })
      .run();
    opened.db
      .insert(schema.inboxItem)
      .values({
        id: candidateId,
        kind: 'import',
        title: 'Bankumsatz prüfen',
        refType: 'bank-sync-candidate',
        refId: candidateId,
        createdAt: '2026-10-27T12:00:00Z',
      })
      .run();
  } finally {
    opened.close();
  }
  const writes: string[] = [];
  page.on('request', (req) => {
    if (['POST', 'PATCH', 'DELETE'].includes(req.method()))
      writes.push(new URL(req.url()).pathname);
  });
  await page.goto('/konten/pruefen');
  const row = page.getByTestId('inbox-row').filter({ hasText: 'Synthetic bank source' });
  await (await bankPreviewControl(row)).click();
  const dialog = page.getByRole('dialog', { name: 'Buchung übernehmen' });
  const select = dialog.getByRole('combobox', {
    name: 'Passende Buchung (geringster Datumsabstand zuerst)',
  });
  await expect(select.locator('option')).toHaveCount(2);
  await expect(dialog.getByText(/Quelle: Bankumsatz/)).toContainText(
    'höchstens fünf Kalendertagen',
  );
  await expect(dialog.getByText(/Quelle: Bankumsatz/)).toContainText(
    'Erst das Zusammenführen übernimmt die Bankreferenz.',
  );
  await expect(dialog.getByText(/Quelle: Bankumsatz/)).toContainText('keine eindeutige Zuordnung');
  await select.selectOption({ index: 1 });
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  expect(writes).toEqual([]);
});
