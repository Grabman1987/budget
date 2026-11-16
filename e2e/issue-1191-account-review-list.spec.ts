import { randomUUID } from 'node:crypto';
import { openDatabase, schema } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { toast } from './ledger-helpers';

test.use({ ledgerToday: '2026-09-17', bankingConfigured: true });
for (const theme of ['light', 'dark']) {
  test(`account groups start open, inline acceptance and cover remain explicit (${theme})`, async ({
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
    const accounts = [];
    for (const name of ['Synthetic account A', 'Synthetic account B']) {
      const { account } = await post('/accounts', {
        name,
        type: 'checking',
        openingDate: '2026-09-01',
        openingBalanceCents: 10000,
      });
      accounts.push(account);
    }
    const { group } = await post('/categories/groups', { name: 'Synthetic group' });
    const { category } = await post('/categories', {
      name: 'Synthetic category',
      class: 'need',
      groupId: group.id,
    });
    const { payee } = await post('/payees', {
      name: 'Synthetic merchant',
      defaultCategoryId: category.id,
    });
    await post('/bookings', {
      date: '2026-09-17',
      accountId: accounts[0].id,
      payeeId: payee.id,
      amountCents: -1234,
      status: 'confirmed',
      splits: [{ categoryId: category.id, amountCents: -1234 }],
    });
    const opened = openDatabase(databasePath);
    try {
      const consentId = randomUUID();
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
      for (const [index, account] of accounts.entries()) {
        const sourceId = randomUUID(),
          id = randomUUID();
        opened.db
          .insert(schema.bankSyncAccount)
          .values({
            id: sourceId,
            consentId,
            secret: 'synthetic-unused',
            label: `Synthetic source ${index}`,
            currency: 'EUR',
            accountId: account.id,
          })
          .run();
        opened.db
          .insert(schema.bankSyncCandidate)
          .values({
            id,
            sourceId,
            accountId: account.id,
            dedupeKey: id,
            date: '2026-09-17',
            amountCents: -2302,
            currency: 'EUR',
            memo: `Synthetic candidate ${index}`,
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
    await page.goto('/konten/pruefen?teil=umsaetze');
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    const a = page.locator('.bank-account-header').filter({ hasText: 'Synthetic account A' });
    const b = page.locator('.bank-account-header').filter({ hasText: 'Synthetic account B' });
    await expect(a.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    await expect(b.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    const row = page.locator('.bank-editable-row').filter({ hasText: 'Synthetic candidate 0' });
    await expect(page.locator('.bank-editable-row')).toHaveCount(2);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /^Empfänger bearbeiten/ }).click();
    await row.getByRole('combobox', { name: 'Empfänger', exact: true }).selectOption(payee.id);
    await row.getByRole('button', { name: /^Kategorie bearbeiten/ }).click();
    await row.getByRole('option', { name: `${category.name} · Vorschlag`, exact: true }).click();
    await row.getByRole('button', { name: 'Übernehmen', exact: true }).click();
    await expect(row).toHaveCount(0);
    const bookings = await (
      await request.get(`${origin}/api/bookings?accountId=${accounts[0].id}`)
    ).json();
    expect(bookings.items).toHaveLength(2);
    expect(
      bookings.items.find((booking: { amountCents: number }) => booking.amountCents === -2302),
    ).toMatchObject({
      accountId: accounts[0].id,
      amountCents: -2302,
      payeeId: payee.id,
    });
    const accepted = bookings.items.find(
      (booking: { amountCents: number }) => booking.amountCents === -2302,
    );
    const detail = await (await request.get(`${origin}/api/bookings/${accepted.id}`)).json();
    expect(detail.booking.splits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ categoryId: category.id, amountCents: -2302 }),
      ]),
    );

    await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
    await expect(row).toBeVisible();
    const over = page.getByRole('region', { name: 'Überzogene Kategorien', exact: true });
    await expect(over).toContainText('Synthetic category');
    await expect(over).toContainText('Synthetic group');
    await over.getByRole('button', { name: 'Decken', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Synthetic category', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Decken · 12,34/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
    await b.getByRole('button').click();
    await expect(b.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    await page.reload();
    await expect(a.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    await expect(b.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    await expect(row).toBeVisible();
    await page.screenshot({ path: info.outputPath(`account-review-${theme}.png`), fullPage: true });
  });
}
