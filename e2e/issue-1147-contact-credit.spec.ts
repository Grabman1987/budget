import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { captureSaveControl, contactShareControl, pickCategory } from './ledger-helpers';

test('a shared purchase can retain contact credit and leave the share open', async ({
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
  const { account } = await post('/accounts', {
    name: 'Beispielkonto',
    type: 'checking',
    onBudget: true,
    openingDate: '2026-10-01',
    openingBalanceCents: 10000,
  });
  const { group } = await post('/categories/groups', { name: 'Beispielgruppe' });
  await post('/categories', {
    name: 'Beispielkategorie',
    groupId: group.id,
    class: 'need',
    kind: 'variable',
  });
  const { contact } = await post('/contacts', { name: 'Beispielkontakt' });
  await post(`/contacts/${contact.id}/settlements`, {
    accountId: account.id,
    date: '2026-10-01',
    amountCents: 301,
  });
  const statement = async () => (await request.get(`/api/contacts/${contact.id}`)).json();

  await page.goto(`/konten/${account.id}?panel=buchung`);
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await dialog.getByLabel('Betrag', { exact: true }).fill('8,02');
  await dialog.getByLabel('Empfänger').fill('Beispieleinkauf');
  await pickCategory(dialog, 'Beispielkategorie');
  await (await contactShareControl(dialog)).click();
  const share = dialog.getByRole('group', { name: 'Kontaktanteil 1.1' });
  await share.getByLabel('Kontakt 1.1', { exact: true }).selectOption(contact.id);
  // owner 26.11.2026: euro only (50 % of 8,02 = 4,01).
  await share.getByLabel('Anteil 1.1 (€)').fill('4,01');
  const choice = share.getByRole('checkbox', { name: 'Mit Guthaben verrechnen' });
  await expect(choice).toBeChecked();
  await expect(share).toContainText('1,00 € bleiben offen');
  await expect(share).toContainText('Danach 0,00 € Guthaben.');
  await choice.uncheck();
  await expect(share).toContainText('vorher und danach 3,01 €');
  await expect(share).toContainText('Der Anteil bleibt bis zur Rückzahlung offen.');
  await captureSaveControl(dialog).click();
  await expect(dialog).toBeHidden();
  expect(await statement()).toMatchObject({
    balanceCents: 100,
    creditCents: 301,
    creditUses: [],
    outlays: [{ remainingCents: 401 }],
  });
  await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
  await expect.poll(statement).toMatchObject({ balanceCents: -301, creditCents: 301, outlays: [] });
});
