import AxeBuilder from '@axe-core/playwright';
import { openDatabase, schema } from '@budget/db';
import { expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { PNG, PDF } from '../apps/server/src/receipts/testing';
import { test } from './isolated-ledger';
import { MIN_TARGET_PX, toast } from './ledger-helpers';
import { openPruefenSource } from './pruefen-part';

test.use({ ledgerToday: '2026-10-02', bankingConfigured: true });

// Use real reads, uploads, confirmation and Undo. Only the bank-provider ingestion is staged.
async function prepare(
  request: APIRequestContext,
  ledger: { origin: string; databasePath: string },
  currency = 'EUR',
) {
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`${ledger.origin}/api${path}`, {
      headers: { origin: ledger.origin },
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Synthetic bank account 1048',
    type: 'checking',
    currency,
    onBudget: currency === 'EUR',
    openingDate: '2026-09-01',
    openingBalanceCents: 10000,
  });
  const { group } = await post('/categories/groups', { name: 'Synthetic group 1048' });
  const categories = [];
  for (const name of ['Synthetic category A', 'Synthetic category B']) {
    categories.push(
      (await post('/categories', { name, class: 'need', groupId: group.id })).category,
    );
  }
  const { project } = await post('/projects', { name: 'Synthetic project 1048' });
  await post('/assignment-rules', {
    name: 'Synthetic split rule 1048',
    enabled: true,
    automatic: true,
    match: { mode: 'all', conditions: [{ type: 'contains', text: 'Synthetic candidate 1048' }] },
    actions: {
      memo: 'Synthetic rule note',
      splits: categories.map((category) => ({ categoryId: category.id, weightBp: 5000 })),
    },
  });
  const id = randomUUID();
  const staged = openDatabase(ledger.databasePath);
  try {
    staged.db
      .insert(schema.bankSyncCandidate)
      .values({
        id,
        accountId: account.id,
        dedupeKey: id,
        date: '2026-09-30',
        amountCents: -1201,
        currency,
        memo: 'Synthetic candidate 1048',
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
      })
      .run();
  } finally {
    staged.close();
  }
  return { account, categories, project, id };
}

for (const theme of ['light', 'dark']) {
  test(`all bank fields persist together and one Undo restores candidate and receipts (${theme})`, async ({
    page,
    request,
    isolatedLedger,
  }, info) => {
    const { origin } = isolatedLedger;
    const { account, categories, project, id } = await prepare(request, isolatedLedger);
    const read = async (path: string) => {
      const response = await request.get(`${origin}/api${path}`);
      expect(response.ok(), await response.text()).toBe(true);
      return response.json();
    };
    await page.goto('/konten/pruefen');
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    const row = page.locator(`[data-bank-candidate-id="${id}"]`);
    await expect(row).toBeVisible();
    await row.focus();
    await row.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Buchung übernehmen', exact: true });
    const details = dialog.getByTestId('bank-all-fields');
    const summary = details.locator('summary');
    await expect(details).not.toHaveAttribute('open');
    await expect(dialog.getByLabel('Notiz', { exact: true })).toBeHidden();
    await summary.focus();
    await summary.press('Enter');
    await expect(details).toHaveAttribute('open');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    const facts = details.locator('.bank-all-fields-facts');
    await expect(facts).toContainText('−12,01 €');
    await expect(facts).toContainText('30.09.2026');
    await expect(facts).toContainText('Bestätigt, sobald du die Buchung bestätigst');
    await expect(facts.locator('input, select, textarea, [contenteditable]')).toHaveCount(0);
    await summary.press('Tab');
    await expect(details.getByLabel('Notiz', { exact: true })).toBeFocused();
    await page.keyboard.type('Synthetic manual note');
    await page.keyboard.press('Tab');
    await expect(details.getByLabel('Projekt', { exact: true })).toBeFocused();
    await details.getByLabel('Projekt', { exact: true }).selectOption(project.id);
    const rule = dialog.getByLabel('Regelvorschlag', { exact: true });
    await expect(rule).not.toHaveValue('');
    await details.getByRole('button', { name: 'Selbst aufteilen', exact: true }).click();
    await expect(rule).toHaveValue('');
    await details.getByLabel('Kategorie 1', { exact: true }).selectOption(categories[0].id);
    await details.getByLabel('Betrag 1', { exact: true }).fill('10,00');
    await details.getByLabel('Kategorie 2', { exact: true }).selectOption(categories[1].id);
    await details.getByLabel('Betrag 2', { exact: true }).fill('2,00');
    const confirm = dialog.getByRole('button', { name: 'Als Buchung bestätigen', exact: true });
    await expect(details.locator('.bank-split-rest')).toContainText('Rest: 0,01 €');
    await expect(confirm).toBeDisabled();
    await details.getByRole('button', { name: 'Rest in Zeile 2 übernehmen', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(details.getByLabel('Betrag 2', { exact: true })).toHaveValue('2,01');
    await expect(details.locator('.bank-split-rest')).toHaveText('Rest: 0,00 €');

    // Both native pickers actually upload through the real receipt endpoint.
    await expect(details.getByLabel('Beleg fotografieren')).toHaveAttribute(
      'capture',
      'environment',
    );
    for (const [label, name, mimeType, buffer] of [
      ['Belegdatei auswählen', 'synthetic-receipt.pdf', 'application/pdf', PDF],
      ['Beleg fotografieren', 'synthetic-photo.png', 'image/png', PNG],
    ] as const) {
      await details.getByLabel(label).setInputFiles({ name, mimeType, buffer });
      await expect(details.getByTestId('attached-receipt').filter({ hasText: name })).toBeVisible();
    }
    const receipts = (await read('/receipts')).receipts;
    expect(receipts).toHaveLength(2);
    await expect(confirm).toBeEnabled();
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
      [],
    );
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (page.viewportSize()!.width === 390) {
      for (const line of await details.getByTestId('bank-split-line').all()) {
        const category = await line.getByRole('combobox').boundingBox();
        const amount = await line.getByRole('textbox').boundingBox();
        expect(amount!.y).toBeGreaterThanOrEqual(category!.y + category!.height);
      }
      for (const button of await details.getByRole('button').all()) {
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      }
    }
    await page.screenshot({ path: info.outputPath(`all-fields-${theme}.png`), fullPage: true });
    const confirmed = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/candidates/${id}/confirm`) &&
        response.request().method() === 'POST',
    );
    await confirm.focus();
    await page.keyboard.press('Enter');
    const response = await confirmed;
    expect(response.ok(), await response.text()).toBe(true);
    const result = await response.json();
    const payload = response.request().postDataJSON();
    expect(payload.ruleId).toBeUndefined();
    expect(payload.receiptIds.sort()).toEqual(receipts.map((r: { id: string }) => r.id).sort());
    await expect(dialog).toBeHidden();
    await expect(row).toHaveCount(0);
    const bookings = (await read(`/bookings?accountId=${account.id}`)).items;
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({
      id: result.bookingId,
      accountId: account.id,
      date: '2026-09-30',
      amountCents: -1201,
      status: 'confirmed',
      memo: 'Synthetic manual note',
      projectId: project.id,
      splits: [
        { categoryId: categories[0].id, amountCents: -1000 },
        { categoryId: categories[1].id, amountCents: -201 },
      ],
    });
    expect((await read(`/receipts?bookingId=${result.bookingId}`)).receipts).toHaveLength(2);
    expect((await read('/receipts')).receipts).toHaveLength(0);
    const undone = page.waitForRequest(
      (r) => r.url().endsWith('/api/undo') && r.method() === 'POST',
    );
    await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
    expect((await undone).postDataJSON()).toEqual({ groupId: result.groupId });
    await expect(row).toBeVisible();
    expect((await read(`/bookings?accountId=${account.id}`)).items).toHaveLength(0);
    expect((await read('/receipts')).receipts.map((r: { id: string }) => r.id).sort()).toEqual(
      receipts.map((r: { id: string }) => r.id).sort(),
    );
    await openPruefenSource(page, 'Belege ohne Buchung');
    for (const name of ['synthetic-receipt.pdf', 'synthetic-photo.png']) {
      await expect(page.getByTestId('receipt-row').filter({ hasText: name })).toBeVisible();
    }
  });
}

test('native bank currency is retained in facts, split inputs and remainder', async ({
  page,
  request,
  isolatedLedger,
}) => {
  const { id } = await prepare(request, isolatedLedger, 'USD');
  await page.goto('/konten/pruefen');
  const row = page.locator(`[data-bank-candidate-id="${id}"]`);
  await row.focus();
  await row.press('Enter');
  const details = page.getByTestId('bank-all-fields');
  await details.locator('summary').click();
  await expect(details.locator('.bank-all-fields-facts')).toContainText('−USD 12,01');
  await details.getByRole('button', { name: 'Selbst aufteilen', exact: true }).click();
  await details.getByLabel('Betrag 1', { exact: true }).fill('10,00');
  await expect(details.locator('.bank-split-rest')).toContainText('Rest: USD 2,01');
  await expect(details.locator('.amount-cur')).toHaveText(['USD', 'USD']);
  await expect(details.locator('.bank-all-fields-facts')).not.toContainText('€');
});
