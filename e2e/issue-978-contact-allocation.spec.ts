import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-02', reducedMotion: 'reduce' });

test('targeted repayments and consumed credit choices preserve cash and support Undo', async ({
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
  const contactPath = `/contacts/${contact.id}`;
  const statement = async () => (await request.get(`/api${contactPath}`)).json();
  const cash = async () => {
    const data = await (await request.get('/api/accounts')).json();
    return {
      netWorth: data.netWorthEurCents,
      balance: data.accounts.find((item: { id: string }) => item.id === account.id).balanceCents,
    };
  };
  const purchase = (date: string, amountCents: number, memo: string) =>
    post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date,
      amountCents: -amountCents,
      splits: [{ categoryId: category.id, contactId: contact.id, amountCents: -amountCents, memo }],
    });
  const undo = async () =>
    page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await purchase('2026-09-01', 1001, 'Frühere Beispielauslage');
  await purchase('2026-10-01', 2002, 'Spätere Beispielauslage');
  await page.goto(`/konten/kontakte/${contact.id}`);
  const sheet = page.getByRole('region', { name: 'Kontaktkontoauszug' });
  await sheet.getByRole('button', { name: 'Rückzahlung buchen', exact: true }).click();
  await sheet.getByRole('checkbox', { name: /Spätere Beispielauslage.*ausgleichen/ }).check();
  await expect(sheet.getByRole('textbox', { name: 'Rückzahlung' })).toHaveValue('20,02');
  await sheet.getByRole('button', { name: 'Rückzahlung speichern' }).click();
  await expect(page.locator('.toast.is-open')).toContainText('Rückzahlung gebucht.');
  let current = await statement();
  expect(
    current.outlays.map((outlay: { remainingCents: number }) => outlay.remainingCents),
  ).toEqual([1001, 0]);
  const afterReceipt = await cash();
  expect(afterReceipt).toEqual({ netWorth: 498999, balance: 498999 });
  await sheet.getByText('Zuordnung', { exact: true }).click();
  await sheet.getByRole('button', { name: 'Zuordnung ändern' }).click();
  const allocation = page.getByRole('dialog', { name: 'Rückzahlung neu zuordnen' });
  await allocation.getByRole('textbox', { name: /Zuordnung Auslage 1/ }).fill('10,01');
  await allocation.getByRole('textbox', { name: /Zuordnung Auslage 2/ }).fill('10,01');
  await allocation.getByRole('button', { name: 'Zuordnung speichern' }).click();
  await expect(page.locator('.toast.is-open')).toContainText('Rückzahlung neu zugeordnet.');
  current = await statement();
  expect(
    current.outlays.map((outlay: { remainingCents: number }) => outlay.remainingCents),
  ).toEqual([0, 1001]);
  expect(await cash()).toEqual(afterReceipt);
  await undo();
  await expect(page.locator('.toast.is-open')).toContainText('Rückgängig gemacht.');
  current = await statement();
  expect(
    current.outlays.map((outlay: { remainingCents: number }) => outlay.remainingCents),
  ).toEqual([1001, 0]);
  expect(await cash()).toEqual(afterReceipt);

  await post(`${contactPath}/settlements`, {
    accountId: account.id,
    date: '2026-10-02',
    amountCents: 2002,
  });
  await purchase('2026-10-02', 1001, 'Mit Guthaben bezahlte Beispielauslage');
  const beforeChoice = await cash();
  expect(beforeChoice).toEqual({ netWorth: 500000, balance: 500000 });
  current = await statement();
  expect(current.creditCents).toBe(0);
  expect(
    current.outlays.every((outlay: { remainingCents: number }) => outlay.remainingCents === 0),
  ).toBe(true);
  await page.reload();
  const credit = sheet.getByRole('region', { name: 'Kontaktguthaben' });
  await expect(credit).toContainText('automatisch verrechnet: 10,01');
  await credit.getByRole('button', { name: 'Guthaben ändern' }).click();
  const choice = page.getByRole('dialog', { name: 'Kontaktguthaben verwenden' });
  await choice.getByRole('textbox', { name: 'Guthabenbetrag' }).fill('6,01');
  await choice.getByLabel('Guthaben verwenden', { exact: true }).selectOption('gift');
  await choice.getByLabel('Konto für Zuordnung').selectOption(account.id);
  await expect(choice).toContainText('die betroffenen Auslagen werden wieder offen');
  await choice.getByRole('button', { name: 'Entscheidung speichern' }).click();
  await expect(page.locator('.toast.is-open')).toContainText('Guthaben geändert.');
  current = await statement();
  expect(
    current.outlays.find(
      (outlay: { memo: string }) => outlay.memo === 'Mit Guthaben bezahlte Beispielauslage',
    ).remainingCents,
  ).toBe(601);
  expect(await cash()).toEqual(beforeChoice);
  await undo();
  await expect(page.locator('.toast.is-open')).toContainText('Rückgängig gemacht.');
  current = await statement();
  expect(current.creditCents).toBe(0);
  expect(
    current.outlays.every((outlay: { remainingCents: number }) => outlay.remainingCents === 0),
  ).toBe(true);
  expect(await cash()).toEqual(beforeChoice);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('owner confirms locked reallocation, keeps credit and waives an exact contact share', async ({
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
      name: 'Beispiel Haushalt',
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
  const contactPath = `/contacts/${contact.id}`;
  const statement = async () => (await request.get(`/api${contactPath}`)).json();
  const purchase = (date: string, amountCents: number, memo: string) =>
    post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date,
      amountCents: -amountCents,
      splits: [{ categoryId: category.id, contactId: contact.id, amountCents: -amountCents, memo }],
    });
  const first = await purchase('2026-09-01', 1001, 'Abgeglichene Beispielauslage');
  await post(`${contactPath}/settlements`, {
    accountId: account.id,
    date: '2026-09-02',
    amountCents: 701,
  });
  await purchase('2026-10-01', 501, 'Weitere Beispielauslage');
  await post(`/accounts/${account.id}/reconciliation`, {
    date: '2026-09-01',
    statementBalanceCents: 498999,
  });
  const bankBefore = (await (await request.get(`/api/bookings/${first.id}`)).json()).booking;
  const accountsBefore = await (await request.get('/api/accounts')).json();
  expect(accountsBefore.netWorthEurCents).toBe(499199);
  expect(
    accountsBefore.accounts.find((item: { id: string }) => item.id === account.id).balanceCents,
  ).toBe(499199);
  await page.goto(`/konten/kontakte/${contact.id}`);
  const sheet = page.getByRole('region', { name: 'Kontaktkontoauszug' });
  await sheet.getByText('Zuordnung', { exact: true }).click();
  await sheet.getByRole('button', { name: 'Zuordnung ändern' }).click();
  const allocation = page.getByRole('dialog', { name: 'Rückzahlung neu zuordnen' });
  await allocation.getByRole('textbox', { name: /Zuordnung Auslage 1/ }).fill('0');
  await expect(allocation).toContainText('Verbleibendes Kontaktguthaben: 7,01');
  await expect(allocation.getByRole('button', { name: 'Zuordnung speichern' })).toBeDisabled();
  await allocation.getByRole('checkbox', { name: /Zuordnung auch bei abgeglichenen/ }).check();
  await allocation.getByRole('button', { name: 'Zuordnung speichern' }).click();
  await expect(page.locator('.toast.is-open')).toContainText('Rückzahlung neu zugeordnet.');
  let current = await statement();
  expect(
    current.outlays.map((outlay: { remainingCents: number }) => outlay.remainingCents),
  ).toEqual([1001, 501]);
  expect(current.creditCents).toBe(701);
  await sheet
    .getByRole('button', { name: 'Abgeglichene Beispielauslage als Geschenk übernehmen' })
    .click();
  const gift = page.getByRole('dialog', { name: 'Auslage als Geschenk übernehmen' });
  await expect(gift.getByRole('heading', { name: 'Geschenk an Kontakt' })).toBeVisible();
  await gift.getByRole('textbox', { name: 'Geschenkbetrag' }).fill('5,01');
  await expect(gift.getByLabel('Eigene Geschenkkategorie')).toHaveValue(category.id);
  await expect(gift.getByLabel('Eigene Geschenkkategorie')).toBeDisabled();
  await expect(gift.getByRole('button', { name: 'Als Geschenk übernehmen' })).toBeDisabled();
  await gift.getByRole('checkbox', { name: /Zuordnung auch bei abgeglichenen/ }).check();
  await gift.getByRole('button', { name: 'Als Geschenk übernehmen' }).click();
  await expect(page.locator('.toast.is-open')).toContainText(
    'Auslage als eigenes Geschenk übernommen.',
  );
  current = await statement();
  expect(
    current.outlays.map((outlay: { remainingCents: number }) => outlay.remainingCents),
  ).toEqual([500, 501]);
  expect(current.creditCents).toBe(701);
  expect((await (await request.get(`/api/bookings/${first.id}`)).json()).booking).toEqual(
    bankBefore,
  );
  const accountsAfter = await (await request.get('/api/accounts')).json();
  expect(accountsAfter.netWorthEurCents).toBe(499199);
  expect(
    accountsAfter.accounts.find((item: { id: string }) => item.id === account.id).balanceCents,
  ).toBe(499199);
  await page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true })
    .click();
  await expect(page.locator('.toast.is-open')).toContainText('Rückgängig gemacht.');
  expect(
    (await statement()).outlays.map((outlay: { remainingCents: number }) => outlay.remainingCents),
  ).toEqual([1001, 501]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
