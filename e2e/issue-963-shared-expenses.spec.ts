import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-02', reducedMotion: 'reduce' });
test('shared repayment shows its category and offers undoable credit choices', async ({
  page,
  request,
  isolatedLedger,
}) => {
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, {
      data,
      headers: { origin: isolatedLedger.origin },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const group = (await post('/categories/groups', { name: 'Beispielgruppe' })).group;
  const category = (
    await post('/categories', {
      name: 'Beispiel Möbel',
      groupId: group.id,
      class: 'want',
      kind: 'variable',
    })
  ).category;
  const account = (
    await post('/accounts', {
      name: 'Beispielkonto',
      type: 'checking',
      onBudget: true,
      openingDate: '2026-09-01',
      openingBalanceCents: 500000,
    })
  ).account;
  const contact = (await post('/contacts', { name: 'Beispielkontakt' })).contact;
  await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-01',
    amountCents: -4000,
    splits: [
      { categoryId: category.id, amountCents: -2000 },
      { categoryId: category.id, contactId: contact.id, amountCents: -2000 },
    ],
  });
  await post(`/contacts/${contact.id}/settlements`, {
    accountId: account.id,
    date: '2026-10-02',
    amountCents: 3000,
  });
  await page.goto(`/reports/kontakte?kontakt=${contact.id}`);
  const sheet = page.getByRole('region', { name: 'Kontaktkontoauszug' });
  await sheet.getByText('Alle Bewegungen und Zuordnungen', { exact: true }).click();
  await sheet.getByText('Zuordnung', { exact: true }).click();
  await expect(sheet.locator('.contact-allocation-details')).toContainText(
    'Beispiel Möbel: 20,00 €',
  );
  await expect(sheet.getByRole('region', { name: 'Kontaktguthaben' })).toContainText(
    'Freies Kontaktguthaben',
  );
  await sheet.getByRole('button', { name: 'Guthaben ändern' }).click();
  let dialog = page.getByRole('dialog', { name: 'Kontaktguthaben verwenden' });
  await dialog.getByLabel('Guthaben verwenden', { exact: true }).selectOption('category');
  await dialog.getByLabel('Kategorie für Guthaben').selectOption(category.id);
  await dialog.getByRole('button', { name: 'Entscheidung speichern' }).click();
  await expect(sheet.getByRole('region', { name: 'Kontaktguthaben' })).toContainText(
    'Vorgemerkt: Beispiel Möbel',
  );
  await sheet.getByRole('button', { name: 'Guthaben ändern' }).click();
  dialog = page.getByRole('dialog', { name: 'Kontaktguthaben verwenden' });
  await dialog.getByLabel('Guthaben verwenden', { exact: true }).selectOption('gift');
  await dialog.getByLabel('Konto für Zuordnung').selectOption(account.id);
  await dialog.getByRole('button', { name: 'Entscheidung speichern' }).click();
  await expect(sheet.getByRole('region', { name: 'Kontaktguthaben' })).toHaveCount(0);
  await page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true })
    .click();
  await expect(sheet.getByRole('region', { name: 'Kontaktguthaben' })).toContainText('10,00 €');
});
