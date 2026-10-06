import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('contacts: cashless credit adoption from list and partial debt forgiveness from detail', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  const origin = isolatedLedger.origin;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`${origin}/api${path}`, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const group = (await post('/categories/groups', { name: 'Kontakt Testgruppe' })).group;
  const advance = (
    await post('/categories', { name: 'Auslagen', groupId: group.id, class: null, kind: 'advance' })
  ).category;
  const gifts = (
    await post('/categories', {
      name: 'Geschenke',
      groupId: group.id,
      class: 'want',
      kind: 'variable',
    })
  ).category;
  const account = (
    await post('/accounts', {
      name: 'Giro Muster',
      type: 'checking',
      onBudget: true,
      openingDate: '2026-09-01',
      openingBalanceCents: 100000,
    })
  ).account;
  const credit = (await post('/contacts', { name: 'Kontakt Guthaben' })).contact;
  const debt = (await post('/contacts', { name: 'Kontakt Forderung' })).contact;
  await post(`/contacts/${credit.id}/settlements`, {
    accountId: account.id,
    date: '2026-09-02',
    amountCents: 42765,
  });
  await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-09-03',
    amountCents: -8400,
    splits: [{ categoryId: advance.id, contactId: debt.id, amountCents: -8400 }],
  });
  const read = async (path: string) => (await request.get(`${origin}/api${path}`)).json();
  const cashBefore = (await read('/accounts')).accounts[0].balanceCents;
  const planBefore = (await read('/budget/2026-10')).summary.toBeAssignedCents;
  await page.goto('/konten/kontakte');
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: credit.name, exact: true }) });
  await row.getByRole('button', { name: 'Ausgleichen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Kontakt ausgleichen', exact: true });
  await expect(dialog.getByLabel('Betrag', { exact: true })).toHaveValue('427,65');
  await expect(dialog.getByLabel('Einnahmenart')).toHaveValue('income-other');
  await expect(dialog.getByLabel('Datum')).toHaveValue('02.10.2026');
  await expect(dialog).toContainText(
    '427,65 € werden ins Budget übernommen; der Kontakt steht danach auf 0,00 €. Kein Geld bewegt sich.',
  );
  await dialog.getByLabel('Betrag', { exact: true }).fill('500');
  await expect(dialog.getByRole('button', { name: 'Ausgleich speichern' })).toBeDisabled();
  await dialog.getByLabel('Betrag', { exact: true }).fill('427,65');
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    ),
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath(`contact-write-off-${info.project.name}.png`),
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    ),
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath(`contact-write-off-${info.project.name}-dark.png`),
    fullPage: true,
  });
  await dialog.getByRole('button', { name: 'Ausgleich speichern' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toHaveCount(0);
  expect((await read(`/contacts/${credit.id}`)).balanceCents).toBe(0);
  expect((await read('/accounts')).accounts[0].balanceCents).toBe(cashBefore);
  expect((await read('/budget/2026-10')).summary.toBeAssignedCents).toBe(planBefore + 42765);
  await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(row).toHaveCount(1);
  expect((await read(`/contacts/${credit.id}`)).balanceCents).toBe(-42765);
  await page.getByRole('button', { name: debt.name, exact: true }).click();
  const detail = page.getByRole('dialog', { name: debt.name, exact: true });
  await detail.getByRole('button', { name: 'Ausgleichen', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Ausgleich speichern' })).toBeDisabled();
  await dialog.getByLabel('Betrag', { exact: true }).fill('23');
  await dialog.getByLabel('Kategorie', { exact: true }).selectOption(gifts.id);
  await expect(dialog).toContainText(
    '23,00 € werden als Ausgabe gebucht; der Kontakt steht danach auf 61,00 €. Kein Geld bewegt sich.',
  );
  await dialog.getByRole('button', { name: 'Ausgleich speichern' }).click();
  await expect(dialog).toBeHidden();
  await expect(detail.locator('.contacts-balance')).toContainText('61,00 €');
  await expect(detail).toContainText('Ausgleich Kontakt');
  expect((await read('/accounts')).accounts[0].balanceCents).toBe(cashBefore);
  const plan = await read('/budget/2026-10');
  expect(
    plan.summary.envelopes.find((e: { categoryId: string }) => e.categoryId === gifts.id)
      .activityCents,
  ).toBe(-2300);
});
