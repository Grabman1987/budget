import { randomUUID } from 'node:crypto';
import { openDatabase, schema } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { toast } from './ledger-helpers';

test.use({ ledgerToday: '2026-09-17', bankingConfigured: true });

for (const theme of ['light', 'dark']) {
  test(`bank row choices, completeness, confirmation, rejection and Undo (${theme})`, async ({
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
    const { account } = await post('/accounts', {
      name: 'Synthetic checking',
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
    const { payee } = await post('/payees', {
      name: 'Synthetic merchant',
      defaultCategoryId: category.id,
    });
    const { payee: incomplete } = await post('/payees', {
      name: 'Synthetic recipient without category',
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
      for (const [memo, amountCents] of [
        ['Synthetic candidate A', -1201],
        ['Synthetic candidate B', -2302],
      ] as const) {
        const id = randomUUID();
        opened.db
          .insert(schema.bankSyncCandidate)
          .values({
            id,
            sourceId,
            accountId: account.id,
            dedupeKey: id,
            date: '2026-09-17',
            amountCents,
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
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    const a = page.locator('.bank-editable-row').filter({ hasText: 'Synthetic candidate A' });
    const b = page.locator('.bank-editable-row').filter({ hasText: 'Synthetic candidate B' });
    await expect(a).toBeVisible();
    const rows = page.locator('.bank-editable-row');
    await rows.first().focus();
    await rows.first().press('ArrowDown');
    await expect(rows.nth(1)).toBeFocused();
    await rows.nth(1).press('ArrowUp');
    await expect(rows.first()).toBeFocused();
    await a.getByRole('button', { name: /^Empfänger (ändern|wählen)/ }).click();
    await a.getByRole('combobox', { name: 'Empfänger', exact: true }).selectOption(incomplete.id);
    // Incomplete: no confirming pill, the cell offers "Kategorie wählen" with the reason.
    await expect(a.getByRole('button', { name: /^Vorschlag bestätigen/ })).toHaveCount(0);
    const chooseCategory = a.getByRole('button', { name: 'Kategorie wählen', exact: true });
    await expect(chooseCategory).toHaveAttribute('title', 'Kategorie fehlt.');
    await expect(chooseCategory).toHaveClass(/is-missing/);
    await a.getByRole('button', { name: /^Empfänger (ändern|wählen)/ }).click();
    await a.getByRole('combobox', { name: 'Empfänger', exact: true }).selectOption(payee.id);
    await expect(a.getByRole('button', { name: /^Vorschlag bestätigen/ })).toContainText(
      category.name,
    );
    await a.getByRole('button', { name: 'Vorschlag ändern', exact: true }).click();
    await a.getByRole('combobox', { name: 'Kategorie', exact: true }).press('Escape');
    await expect(a.getByRole('button', { name: /^Vorschlag bestätigen/ })).toBeVisible();
    await a.getByRole('button', { name: 'Vorschlag ändern', exact: true }).click();
    const categoryChoice = a.getByRole('option', {
      name: `${category.name} · Vorschlag`,
      exact: true,
    });
    await expect(categoryChoice).toBeVisible();
    expect(
      await categoryChoice.evaluate((option) => {
        const box = option.getBoundingClientRect();
        return option.contains(
          document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
        );
      }),
    ).toBe(true);
    await a.getByRole('option', { name: `${category.name} · Vorschlag`, exact: true }).click();
    await expect(a.getByRole('button', { name: /^Vorschlag bestätigen/ })).toContainText(
      category.name,
    );
    const bookings = async () =>
      (await (await request.get(`${origin}/api/bookings?accountId=${account.id}`)).json()).items;
    expect(await bookings()).toHaveLength(0);
    await a.focus();
    await a.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Buchung übernehmen', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: 'Empfänger', exact: true })).toHaveValue(
      payee.id,
    );
    await expect(dialog.getByRole('combobox', { name: 'Kategorie', exact: true })).toHaveValue(
      category.id,
    );
    await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(a).toBeFocused();
    await page.screenshot({ path: info.outputPath(`bank-row-${theme}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await a.getByRole('button', { name: /^Vorschlag bestätigen/ }).click();
    await expect(a).toHaveCount(0);
    const saved = await bookings();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      payeeId: payee.id,
      amountCents: -1201,
      splits: [{ categoryId: category.id, amountCents: -1201 }],
    });
    await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
    await expect(a).toBeVisible();
    expect(await bookings()).toHaveLength(0);
    await a.getByRole('button', { name: /^(Vorschlag ändern|Kategorie wählen)$/ }).click();
    const categorySelect = a.getByRole('combobox', { name: 'Kategorie', exact: true });
    await expect(categorySelect).toBeVisible();
    await expect(toast(page)).toBeVisible();
    if (info.project.name === 'mobile') {
      const pickerBox = await a.locator('.combo-list').boundingBox();
      const toastBox = await toast(page).boundingBox();
      expect(pickerBox!.y + pickerBox!.height).toBeLessThan(toastBox!.y);
    }
    expect(
      await categorySelect.evaluate((select) => {
        const box = select.getBoundingClientRect();
        return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === select;
      }),
    ).toBe(true);
    const restoredChoice = a.getByRole('option', { name: category.name, exact: true });
    await expect(restoredChoice).toBeVisible();
    expect(
      await restoredChoice.evaluate((option) => {
        const box = option.getBoundingClientRect();
        return option.contains(
          document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
        );
      }),
    ).toBe(true);
    await restoredChoice.click();
    await a.getByRole('button', { name: 'Nicht übernehmen', exact: true }).click();
    await expect(a).toHaveCount(0);
    expect(await bookings()).toHaveLength(0);
    await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
    await expect(a).toBeVisible();
    await expect(b).toBeVisible();
  });
}
