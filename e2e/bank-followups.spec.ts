import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { openDatabase, schema } from '@budget/db';
import { test } from './isolated-ledger';

test('bank merge, mirror transfer, selected pair and balance lock with undo', async ({
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
    await post('/accounts', {
      name: 'Girokonto A',
      type: 'checking',
      openingDate: '2026-09-01',
      openingBalanceCents: 100000,
    })
  ).account;
  const other = (
    await post('/accounts', { name: 'Sparkonto B', type: 'savings', openingDate: '2026-09-01' })
  ).account;
  const group = (await post('/categories/groups', { name: 'Gruppe A' })).group;
  const category = (
    await post('/categories', { name: 'Kategorie A', class: 'need', groupId: group.id })
  ).category;
  const manual = (
    await post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: '2026-09-30',
      amountCents: -1201,
      memo: 'Handnotiz',
      status: 'pending',
      splits: [
        { amountCents: -700, categoryId: category.id },
        { amountCents: -501, categoryId: category.id },
      ],
    })
  ).id;
  const bankId = randomUUID();
  const staged = openDatabase(databasePath);
  try {
    staged.db
      .insert(schema.bankSyncCandidate)
      .values({
        id: bankId,
        accountId: account.id,
        date: '2026-10-02',
        amountCents: -1201,
        currency: 'EUR',
        dedupeKey: 'entry-a',
        memo: 'Banktext',
      })
      .run();
    staged.db
      .insert(schema.inboxItem)
      .values({
        id: bankId,
        kind: 'import',
        title: 'Bankumsatz prüfen',
        detail: 'Girokonto A · Banktext',
        refType: 'bank-sync-candidate',
        refId: bankId,
      })
      .run();
  } finally {
    staged.close();
  }
  await page.goto('/konten/posteingang');
  await expect(page.getByRole('button', { name: /Mit Buchung .* zusammenführen/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.kinbox').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/bank-match-${info.project.name}-light.png`,
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.dataset['theme'] = 'dark';
  });
  expect((await new AxeBuilder({ page }).include('.kinbox').analyze()).violations).toEqual([]);
  await page.screenshot({
    path: `test-results/bank-match-${info.project.name}-dark.png`,
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.dataset['theme'] = 'light';
  });
  await page.getByRole('button', { name: /Mit Buchung .* zusammenführen/ }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Bankumsatz mit Buchung zusammengeführt.', { exact: true }),
  ).toBeVisible();
  let saved = (await (await request.get(origin + '/api/bookings/' + manual)).json()).booking;
  expect(saved).toMatchObject({
    date: '2026-10-02',
    memo: 'Handnotiz',
    status: 'confirmed',
    splits: [{ categoryId: category.id }, { categoryId: category.id }],
  });
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByRole('button', { name: /Mit Buchung .* zusammenführen/ })).toBeVisible();
  await page.getByRole('button', { name: /Mit Buchung .* zusammenführen/ }).click();
  await expect(
    page.getByText('Bankumsatz mit Buchung zusammengeführt.', { exact: true }),
  ).toBeVisible();
  const b = (
    await post('/bookings', {
      type: 'booking',
      accountId: other.id,
      date: '2026-10-01',
      amountCents: 1201,
      categoryId: category.id,
      memo: 'Gegenbuchung',
    })
  ).id;
  await page.goto('/konten/buchungen');
  for (const id of [manual, b])
    await page.locator(`[data-booking="${id}"] input[type=checkbox]`).check();
  await page.getByRole('button', { name: 'Als Umbuchung verbinden', exact: true }).click();
  await expect(
    page.getByText('Als Umbuchung verbunden; Kategorien entfernt.', { exact: true }),
  ).toBeVisible();
  saved = (await (await request.get(origin + '/api/bookings/' + b)).json()).booking;
  expect(saved.transferId).toBeTruthy();
  expect(saved.date).toBe('2026-10-01');
  expect(saved.splits[0].categoryId).toBeNull();
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByText('Rückgängig gemacht.', { exact: true })).toBeVisible();
  const mirrorId = randomUUID();
  const db = openDatabase(databasePath);
  try {
    db.db
      .insert(schema.bankSyncCandidate)
      .values({
        id: mirrorId,
        accountId: account.id,
        date: '2026-10-02',
        amountCents: -1201,
        currency: 'EUR',
        dedupeKey: 'entry-b',
        memo: 'Umbuchung A',
      })
      .run();
    db.db
      .insert(schema.inboxItem)
      .values({
        id: mirrorId,
        kind: 'import',
        title: 'Bankumsatz prüfen',
        detail: 'Umbuchung A',
        refType: 'bank-sync-candidate',
        refId: mirrorId,
      })
      .run();
  } finally {
    db.close();
  }
  await page.goto('/konten/posteingang');
  await page.getByRole('button', { name: 'Als Umbuchung verbinden', exact: true }).click();
  await expect(page.getByText('Als Umbuchung verbunden.', { exact: true })).toBeVisible();
  const balanceDb = openDatabase(databasePath);
  try {
    const consentId = randomUUID();
    balanceDb.db
      .insert(schema.bankSyncConsent)
      .values({
        id: consentId,
        initiator: 'synthetic',
        stateHash: consentId,
        expiresAt: '2027-01-01T00:00:00Z',
        nextRunAt: '2027-01-01T00:00:00Z',
        label: 'Bank A',
        status: 'paused',
      })
      .run();
    balanceDb.db
      .insert(schema.bankSyncAccount)
      .values({
        id: randomUUID(),
        consentId,
        secret: 'synthetic',
        label: 'Konto A',
        accountId: account.id,
        currency: 'EUR',
        balanceCents: 97598,
        balanceDate: '2026-10-02',
        balanceFetchedAt: '2026-10-02T10:00:00Z',
      })
      .run();
  } finally {
    balanceDb.close();
  }
  await page.goto('/konten');
  await expect(page.getByText('Bankstand: 975,98 €', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abgleich sperren bis heute' })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.kview').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/bank-followups-${info.project.name}-light.png`,
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.dataset['theme'] = 'dark';
  });
  expect((await new AxeBuilder({ page }).include('.kview').analyze()).violations).toEqual([]);
  await page.screenshot({
    path: `test-results/bank-followups-${info.project.name}-dark.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Abgleich sperren bis heute' }).click();
  await expect(page.getByText('Abgleich bis heute gesperrt.', { exact: true })).toBeVisible();
  await expect(page.getByText('Abgeglichen bis: 02.10.2026', { exact: false })).toBeVisible();
  const refused = await request.patch(origin + '/api/bookings/' + manual, {
    headers: { origin },
    data: { amountCents: -1202 },
  });
  expect(refused.status()).toBe(409);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByText('Abgeglichen bis: —', { exact: false })).toBeVisible();
});
