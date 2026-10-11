import { randomUUID } from 'node:crypto';
import { createBooking, openDatabase, schema } from '@budget/db';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('65 compact bank rows, prepared bulk confirmation, one undo, date controls and account warning', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  const { origin, databasePath } = isolatedLedger;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(origin + '/api' + path, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const account = (
    await post('/accounts', { name: 'Girokonto A', type: 'checking', openingDate: '2026-09-01' })
  ).account;
  const group = (await post('/categories/groups', { name: 'Gruppe A' })).group;
  const category = (
    await post('/categories', { name: 'Kategorie A', class: 'need', groupId: group.id })
  ).category;
  await post('/assignment-rules', {
    name: 'Shop A zuordnen',
    enabled: true,
    automatic: true,
    match: { mode: 'all', conditions: [{ type: 'contains', text: 'Shop A' }] },
    actions: { categoryId: category.id },
  });
  const sourceId = randomUUID(),
    consentId = randomUUID();
  const booked: string[] = [];
  const staged = openDatabase(databasePath);
  try {
    staged.db
      .insert(schema.bankSyncConsent)
      .values({
        id: consentId,
        initiator: 'synthetic',
        stateHash: randomUUID(),
        label: 'Bank A',
        expiresAt: '2027-01-01T00:00:00Z',
        nextRunAt: '2027-01-01T00:00:00Z',
      })
      .run();
    staged.db
      .insert(schema.bankSyncAccount)
      .values({
        id: sourceId,
        consentId,
        secret: 'synthetic-unused',
        label: 'Konto A',
        currency: 'EUR',
        accountId: account.id,
      })
      .run();
    for (let i = 0; i < 65; i++) {
      if (i < 5)
        booked.push(
          createBooking(
            staged.db,
            {
              accountId: account.id,
              date: '2026-10-02',
              amountCents: -1201,
              currency: 'EUR',
              memo: 'Shop A',
              bankRawText: 'Shop A',
              bankSourceId: sourceId,
              source: 'bank',
              importKey: `bank-sync:synthetic-${i}`,
              status: 'pending',
              splits: [{ amountCents: -1201 }],
            },
            { actor: 'test' },
          ),
        );
      else {
        const id = randomUUID();
        staged.db
          .insert(schema.bankSyncCandidate)
          .values({
            id,
            sourceId,
            accountId: account.id,
            dedupeKey: `synthetic-${i}`,
            date: '2026-10-01',
            amountCents: -1301,
            currency: 'EUR',
            memo: `Shop B ${i}`,
          })
          .run();
        staged.db
          .insert(schema.inboxItem)
          .values({
            id,
            kind: 'import',
            title: 'Bankumsatz prüfen',
            refType: 'bank-sync-candidate',
            refId: id,
            createdAt: '2026-10-02T00:00:00Z',
          })
          .run();
      }
    }
    staged.db
      .insert(schema.inboxItem)
      .values({
        id: 'bank-balance:' + account.id,
        kind: 'reconciliation',
        title: 'Bankstand weicht ab',
        detail: 'Kontostand prüfen.',
        refType: 'bank-sync',
        refId: account.id,
        createdAt: '2026-10-02T00:00:00Z',
      })
      .run();
  } finally {
    staged.close();
  }
  const apiCalls: string[] = [];
  const bulkCalls: unknown[] = [];
  page.on('request', (req) => {
    if (new URL(req.url()).pathname.startsWith('/api/')) apiCalls.push(req.url());
    if (new URL(req.url()).pathname === '/api/bank-sync/inbox/bulk')
      bulkCalls.push(req.postDataJSON());
  });
  await page.goto('/konten/posteingang?bankSource=' + sourceId);
  await expect(page.locator('.bank-inbox-row')).toHaveCount(65);
  expect(apiCalls.length).toBeLessThan(10);
  expect(
    apiCalls.some((url) => url.includes('/matches') || url.includes('/assignment-rules/')),
  ).toBe(false);
  await expect(page.getByRole('link', { name: 'Kontostand prüfen', exact: true })).toHaveAttribute(
    'href',
    '/konten/' + account.id,
  );
  await page.getByLabel('Alle auswählen', { exact: true }).check();
  for (const row of await page.locator('.bank-inbox-row').filter({ hasText: 'Shop A ·' }).all()) {
    await row.locator('summary').click();
  }
  await expect(page.getByRole('button', { name: 'Vorschlag übernehmen', exact: true })).toHaveCount(
    5,
  );
  // "Nicht übernehmen" never removes booked rows: they are listed as kept, not sent.
  await page.getByRole('button', { name: 'Auswahl nicht übernehmen', exact: true }).click();
  const dismissPreview = page.getByRole('dialog', { name: 'Bankauswahl prüfen' });
  await expect(dismissPreview).toContainText(
    '65 ausgewählt · 60 nicht übernehmen · 5 übersprungen',
  );
  await expect(dismissPreview).toContainText('5 bereits gebuchte Zeilen bleiben unverändert');
  await dismissPreview.getByRole('button', { name: 'Abbrechen' }).click();
  expect(bulkCalls).toHaveLength(0);
  await page
    .getByRole('button', { name: 'Auswahl mit vorbereitetem Vorschlag bestätigen', exact: true })
    .click();
  const preview = page.getByRole('dialog', { name: 'Bankauswahl prüfen' });
  await expect(preview).toContainText('65 ausgewählt · 5 bestätigen · 60 übersprungen');
  expect(bulkCalls).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await preview.getByRole('button', { name: 'Auswahl jetzt ausführen' }).click();
  await expect(
    page.getByText('5 Bankzeilen bestätigt · 60 übersprungen.', { exact: true }),
  ).toBeVisible();
  expect(bulkCalls).toHaveLength(1);
  expect(bulkCalls[0]).toMatchObject({ action: 'confirm', sourceId, expectedChanged: 5 });
  await expect(page.locator('.bank-inbox-row')).toHaveCount(60);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.locator('.bank-inbox-row')).toHaveCount(65);
  for (const id of booked) {
    const booking = (await (await request.get(origin + '/api/bookings/' + id)).json()).booking;
    expect(booking.status).toBe('pending');
    expect(booking.splits[0].categoryId).toBeNull();
  }
  await page.getByLabel('Datumssortierung').selectOption('oldest');
  await expect(page.locator('.bank-inbox-row').first()).toContainText('Shop B');
  await page.getByLabel('Ab Datum', { exact: true }).fill('2026-10-02');
  await expect(page.locator('.bank-inbox-row')).toHaveCount(5);
  await page.locator('.bank-inbox-row').first().locator('summary').click();
  await expect(
    page.getByRole('button', { name: 'Vorschlag übernehmen', exact: true }),
  ).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const smallTargets = await page
      .locator(
        '.kinbox button, .kinbox summary, .kinbox .bank-select, .kinbox a.btn, .inbox-filters input, .inbox-filters select',
      )
      .evaluateAll((nodes) =>
        nodes
          .filter(
            (node) =>
              node.getBoundingClientRect().height > 0 && node.getBoundingClientRect().height < 44,
          )
          .map((node) => node.textContent),
      );
    expect(smallTargets).toEqual([]);
    expect((await new AxeBuilder({ page }).include('.kinbox').analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `test-results/bank-inbox-bulk-${info.project.name}-${theme}.png`,
      fullPage: true,
    });
  }
});
