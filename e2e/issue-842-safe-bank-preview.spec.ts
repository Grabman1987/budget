import { randomUUID } from 'node:crypto';
import { openDatabase, schema } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { toast } from './ledger-helpers';

test.use({ ledgerToday: '2026-09-17' });

test('K5: safe source-backed rule preview is read-only until confirmation and uses one Undo', async ({
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
    name: 'Synthetic Account',
    type: 'checking',
    openingDate: '2026-09-01',
    openingBalanceCents: 10000,
  });
  const { group } = await post('/categories/groups', { name: 'Synthetic group' });
  const { category } = await post('/categories', {
    name: 'Synthetic category',
    class: 'need',
    groupId: group.id,
  });
  await post('/assignment-rules', {
    name: 'Synthetic explicit rule',
    enabled: true,
    automatic: true,
    match: { mode: 'all', conditions: [{ type: 'contains', text: 'Synthetic safe' }] },
    actions: { categoryId: category.id },
  });
  const consentId = randomUUID(),
    sourceId = randomUUID();
  const opened = openDatabase(databasePath);
  try {
    opened.db
      .insert(schema.bankSyncConsent)
      .values({
        id: consentId,
        initiator: 'synthetic',
        stateHash: randomUUID(),
        label: 'Synthetic source',
        expiresAt: '2027-01-01T00:00:00Z',
        nextRunAt: '2027-01-01T00:00:00Z',
      })
      .run();
    opened.db
      .insert(schema.bankSyncAccount)
      .values({
        id: sourceId,
        consentId,
        secret: 'synthetic-unused',
        label: 'Synthetic source account',
        currency: 'EUR',
        accountId: account.id,
      })
      .run();
    for (const memo of ['Synthetic safe', 'Synthetic ambiguous']) {
      const id = randomUUID();
      opened.db
        .insert(schema.bankSyncCandidate)
        .values({
          id,
          sourceId,
          accountId: account.id,
          dedupeKey: id,
          date: '2026-09-17',
          amountCents: -1201,
          currency: 'EUR',
          memo,
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
          createdAt: '2026-09-17T12:00:00Z',
        })
        .run();
    }
  } finally {
    opened.close();
  }
  await page.goto(`/konten/pruefen?bankSource=${sourceId}`);
  await expect(page.locator('.bank-inbox-row')).toHaveCount(2);
  const redesign = (await page.locator('[data-budget-redesign="1"]').count()) > 0;
  const shortcut = page.getByRole('button', { name: /Sichere Vorschläge prüfen/ });
  await expect(shortcut).toHaveCount(redesign ? 1 : 0);
  if (!redesign) return;
  await expect(shortcut).toHaveText('Sichere Vorschläge prüfen (0)');
  const writes: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST') writes.push(new URL(req.url()).pathname);
  });
  const safe = page.locator('.bank-inbox-row').filter({ hasText: 'Synthetic safe' });
  await safe.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  const candidate = page.getByRole('dialog', { name: 'Buchung übernehmen' });
  await expect(candidate.getByText('Synthetic explicit rule', { exact: true })).toBeVisible();
  await candidate.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(shortcut).toHaveText('Sichere Vorschläge prüfen (1)');
  await shortcut.click();
  const preview = page.getByRole('dialog', { name: 'Bankauswahl prüfen' });
  await expect(preview).toContainText('1 ausgewählt · 1 bestätigen · 0 übersprungen');
  await expect(
    preview.getByRole('list', { name: 'Auswirkung der sicheren Vorschläge' }),
  ).toContainText('−12,01 €');
  await preview.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  expect(writes).toEqual([]);
  await shortcut.click();
  await preview.getByRole('button', { name: 'Auswahl jetzt ausführen' }).click();
  await expect(page.locator('.bank-inbox-row')).toHaveCount(1);
  await expect(toast(page)).toContainText('1 Bankzeilen bestätigt · 0 übersprungen.');
  await expect(toast(page).getByRole('button', { name: 'Rückgängig' })).toHaveCount(1);
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.locator('.bank-inbox-row')).toHaveCount(2);
  expect(writes).toEqual(['/api/bank-sync/inbox/bulk', '/api/undo']);
  const accounts = await (await request.get(origin + '/api/accounts')).json();
  expect(accounts.accounts.find((row: { id: string }) => row.id === account.id).balanceCents).toBe(
    10000,
  );
});
