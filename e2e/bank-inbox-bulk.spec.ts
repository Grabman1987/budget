import { controlBoxes } from './control-geometry';
import { redesignLoaded, inboxFilters, bankSelection } from './ledger-helpers';

import { randomUUID } from 'node:crypto';
import { createBooking, openDatabase, schema } from '@budget/db';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import type { InboxPage } from '../apps/web/src/inbox/api';
import { test } from './isolated-ledger';

test.use({ bankingConfigured: true });

test('visible safe candidate prepares its tick and bulk action without hover or focus', async ({
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
  const account = (
    await post('/accounts', { name: 'Account A', type: 'checking', openingDate: '2026-09-01' })
  ).account;
  const group = (await post('/categories/groups', { name: 'Group A' })).group;
  const category = (
    await post('/categories', { name: 'Category A', class: 'need', groupId: group.id })
  ).category;
  await post('/assignment-rules', {
    name: 'Synthetic safe rule',
    enabled: true,
    automatic: true,
    match: { mode: 'all', conditions: [{ type: 'contains', text: 'Synthetic shop' }] },
    actions: { categoryId: category.id },
  });
  const sourceId = randomUUID(),
    consentId = randomUUID(),
    candidateId = randomUUID();
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
        label: 'Account A',
        currency: 'EUR',
        accountId: account.id,
      })
      .run();
    staged.db
      .insert(schema.bankSyncCandidate)
      .values({
        id: candidateId,
        sourceId,
        accountId: account.id,
        dedupeKey: 'synthetic-visible',
        date: '2026-10-01',
        amountCents: -1201,
        currency: 'EUR',
        memo: 'Synthetic shop',
      })
      .run();
    staged.db
      .insert(schema.inboxItem)
      .values({
        id: candidateId,
        kind: 'import',
        title: 'Bankumsatz prüfen',
        refType: 'bank-sync-candidate',
        refId: candidateId,
        createdAt: '2026-10-02T00:00:00Z',
      })
      .run();
  } finally {
    staged.close();
  }
  const rowReads: string[] = [];
  page.on('request', (req) => {
    if (/\/matches|\/assignment-rules\/candidates\//.test(req.url())) rowReads.push(req.url());
  });
  await page.goto('/konten/posteingang?bankSource=' + sourceId);
  test.skip(!(await redesignLoaded(page)), 'Inline rows require the redesign.');
  const row = page.locator('.bank-editable-row');
  await expect(row.getByRole('button', { name: /^Vorschlag bestätigen/ })).toBeEnabled();
  expect(rowReads).toEqual([]);
  await page.getByRole('button', { name: 'Alle sicheren bestätigen (1)', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Bankauswahl prüfen' });
  await expect(preview).toContainText('1 ausgewählt · 1 bestätigen · 0 übersprungen');
  await preview.getByRole('button', { name: 'Auswahl jetzt ausführen' }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(row).toHaveCount(1);
});

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
  // Exercise a long list without server preparation; the other case covers the prepared path.
  await page.route('**/api/inbox?*', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as InboxPage;
    for (const entry of body.entries) {
      if (entry.type === 'stored' && entry.bankCandidate) delete entry.bankCandidate.preparation;
    }
    await route.fulfill({ response, json: body });
  });
  await page.goto('/konten/posteingang?bankSource=' + sourceId);
  await expect(page.locator('.bank-inbox-row')).toHaveCount(65);
  const redesign = await redesignLoaded(page);
  if (redesign) {
    // Visible candidates prepare without hover; offscreen rows remain lazy.
    // Booking rows load rule/merge lazily from their menu; candidate rows prepare on sight.
    await page
      .locator('.bank-editable-row:not(.bank-booking-row)')
      .first()
      .scrollIntoViewIfNeeded();
    await expect
      .poll(() => apiCalls.filter((url) => url.includes('/matches')).length)
      .toBeGreaterThan(0);
    expect(apiCalls.filter((url) => url.includes('/matches')).length).toBeLessThan(60);
  } else {
    expect(apiCalls.length).toBeLessThan(10);
    expect(
      apiCalls.some((url) => url.includes('/matches') || url.includes('/assignment-rules/')),
    ).toBe(false);
  }
  await expect(page.getByRole('link', { name: 'Kontostand prüfen', exact: true })).toHaveAttribute(
    'href',
    '/konten/' + account.id,
  );
  await bankSelection(page);
  await page.getByLabel('Alle auswählen', { exact: true }).check();
  if (redesign) await page.keyboard.press('Escape');
  for (const row of await page
    .locator('.bank-inbox-row')
    .filter({ hasText: redesign ? 'Shop A' : 'Shop A ·' })
    .all()) {
    // The rule suggestion sits in the row's "Weitere Aktionen" menu (both layouts).
    await row.locator('summary').click();
    if (redesign) {
      await expect(
        row.getByRole('button', { name: 'Vorschlag übernehmen', exact: true }),
      ).toBeVisible();
      await row.locator('summary').click();
    }
  }
  if (!redesign)
    await expect(
      page.getByRole('button', { name: 'Vorschlag übernehmen', exact: true }),
    ).toHaveCount(5);
  await bankSelection(page);
  // "Nicht übernehmen" never removes booked rows: they are listed as kept, not sent.
  await page.getByRole('button', { name: 'Auswahl nicht übernehmen', exact: true }).click();
  const dismissPreview = page.getByRole('dialog', { name: 'Bankauswahl prüfen' });
  await expect(dismissPreview).toContainText(
    '65 ausgewählt · 60 nicht übernehmen · 5 übersprungen',
  );
  await expect(dismissPreview).toContainText('5 bereits gebuchte Zeilen bleiben unverändert');
  await dismissPreview.getByRole('button', { name: 'Abbrechen' }).click();
  expect(bulkCalls).toHaveLength(0);
  await bankSelection(page);
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
  if (redesign && (page.viewportSize()?.width ?? 1440) < 768) await inboxFilters(page);
  await page.getByLabel('Datumssortierung').selectOption('oldest');
  await expect(page.locator('.bank-inbox-row').first()).toContainText('Shop B');
  await inboxFilters(page);
  await page.getByLabel('Ab Datum', { exact: true }).fill('2026-10-02');
  await expect(page.locator('.bank-inbox-row')).toHaveCount(5);
  if (redesign) await page.keyboard.press('Escape');
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
    const smallTargets = (
      await controlBoxes(
        page.locator(
          '.kinbox button, .kinbox summary, .kinbox .bank-select, .kinbox a.btn, .inbox-filters input, .inbox-filters select',
        ),
      )
    ).filter((box) => box.height > 0 && box.height < box.minimumHeight);
    expect(smallTargets).toEqual([]);
    expect((await new AxeBuilder({ page }).include('.kinbox').analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `test-results/bank-inbox-bulk-${info.project.name}-${theme}.png`,
      fullPage: true,
    });
  }
});

test('collapsing an account prunes bulk selection and safe rows; visible dismiss has one Undo', async ({
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
  const accounts = [];
  for (const name of ['Synthetic account A', 'Synthetic account B'])
    accounts.push(
      (await post('/accounts', { name, type: 'checking', openingDate: '2026-09-01' })).account,
    );
  const { group } = await post('/categories/groups', { name: 'Synthetic group' });
  const { category } = await post('/categories', {
    name: 'Synthetic category',
    class: 'need',
    groupId: group.id,
  });
  await post('/assignment-rules', {
    name: 'Synthetic visible rule',
    enabled: true,
    automatic: true,
    match: { mode: 'all', conditions: [{ type: 'contains', text: 'Synthetic shop' }] },
    actions: { categoryId: category.id },
  });
  const consentId = randomUUID(),
    sourceId = randomUUID();
  const ids = Array.from({ length: 4 }, () => randomUUID());
  const staged = openDatabase(databasePath);
  try {
    staged.db
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
    staged.db
      .insert(schema.bankSyncAccount)
      .values({
        id: sourceId,
        consentId,
        secret: 'synthetic-unused',
        label: 'Synthetic account A',
        currency: 'EUR',
        accountId: accounts[0].id,
      })
      .run();
    for (const [index, id] of ids.entries()) {
      // One source queue can retain candidates with distinct stored account identities.
      staged.db
        .insert(schema.bankSyncCandidate)
        .values({
          id,
          sourceId,
          accountId: accounts[index < 3 ? 0 : 1].id,
          dedupeKey: id,
          date: '2026-10-01',
          amountCents: -1201,
          currency: 'EUR',
          memo: `Synthetic shop ${index}`,
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
  } finally {
    staged.close();
  }
  const bulkCalls: unknown[] = [];
  page.on('request', (req) => {
    if (new URL(req.url()).pathname === '/api/bank-sync/inbox/bulk')
      bulkCalls.push(req.postDataJSON());
  });
  await page.goto('/konten/pruefen?teil=umsaetze&bankSource=' + sourceId);
  test.skip(!(await redesignLoaded(page)), 'Account disclosure requires the redesign.');
  await expect(page.locator('.bank-editable-row')).toHaveCount(4);
  for (const id of ids)
    await expect(page.locator(`[data-bank-candidate-id="${id}"]`)).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Alle sicheren bestätigen (4)', exact: true }),
  ).toBeEnabled();
  await bankSelection(page);
  await page.getByLabel('Alle auswählen', { exact: true }).check();
  await expect(page.locator('.bank-selection-menu > summary')).toHaveAttribute(
    'aria-label',
    'Auswahl (4)',
  );
  await page.keyboard.press('Escape');
  const a = page.locator('.bank-account-header').filter({ hasText: 'Synthetic account A' });
  await a.getByRole('button').click();
  await expect(page.locator('.bank-editable-row')).toHaveCount(1);
  await expect(page.locator('.bank-selection-menu > summary')).toHaveAttribute(
    'aria-label',
    'Auswahl (1)',
  );
  await expect(
    page.getByRole('button', { name: 'Alle sicheren bestätigen (1)', exact: true }),
  ).toBeEnabled();
  // Reopening must not restore the previous selection.
  await a.getByRole('button').click();
  await expect(page.locator('.bank-selection-menu > summary')).toHaveAttribute(
    'aria-label',
    'Auswahl (1)',
  );
  await a.getByRole('button').click();
  await bankSelection(page);
  await page.getByLabel('Alle auswählen', { exact: true }).uncheck();
  await page.getByLabel('Alle auswählen', { exact: true }).check();
  await page.getByRole('button', { name: 'Auswahl nicht übernehmen', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Bankauswahl prüfen' });
  await expect(preview).toContainText('1 ausgewählt · 1 nicht übernehmen · 0 übersprungen');
  await preview.getByRole('button', { name: 'Auswahl jetzt ausführen' }).click();
  await expect(page.locator('.bank-editable-row')).toHaveCount(0);
  expect(bulkCalls).toEqual([
    { action: 'dismiss', sourceId, expectedChanged: 1, rows: [{ type: 'candidate', id: ids[3] }] },
  ]);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.locator('.bank-editable-row')).toHaveCount(1);
  await a.getByRole('button').click();
  for (const id of ids)
    await expect(page.locator(`[data-bank-candidate-id="${id}"]`)).toHaveCount(1);
});
