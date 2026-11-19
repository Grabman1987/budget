import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('capture keeps visible categories and payee defaults consistent across consecutive bookings', async ({
  page,
  request,
  baseURL,
}) => {
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers: { origin: baseURL! }, data });
    expect(response.status()).toBe(201);
    return response.json();
  };
  const { group } = await post('/categories/groups', { name: 'Gruppe Muster' });
  const categories = [];
  const accounts = [];
  const payees = [];
  for (const suffix of ['Alpha', 'Beta']) {
    const { category } = await post('/categories', {
      name: `Kategorie ${suffix}`,
      class: 'need',
      kind: 'variable',
      groupId: group.id,
    });
    const { account } = await post('/accounts', {
      name: `Konto ${suffix}`,
      type: 'checking',
      openingDate: '2026-01-01',
      openingBalanceCents: 100000,
    });
    const { payee } = await post('/payees', { name: `Musterladen ${suffix}` });
    await post('/bookings', {
      type: 'booking',
      accountId: account.id,
      payeeId: payee.id,
      date: '2026-10-01',
      amountCents: -100,
      status: 'pending',
      splits: [{ categoryId: category.id, amountCents: -100 }],
    });
    categories.push(category);
    accounts.push(account);
    payees.push(payee);
  }
  await page.goto('/?panel=buchung');
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await expect(dialog.locator('.bkform-redesign')).toBeVisible();
  const category = dialog.getByRole('combobox', { name: 'Kategorie', exact: true });
  const payee = dialog.getByLabel('Empfänger', { exact: true });
  const account = dialog.getByLabel('Bezahlt von', { exact: true });
  const amount = dialog.getByLabel('Betrag', { exact: true });
  await expect(dialog.getByText('Jede Zeile einer Ausgabe braucht eine Kategorie.')).toHaveCount(0);
  await amount.fill('10,00');
  await expect(dialog.getByText('Jede Zeile einer Ausgabe braucht eine Kategorie.')).toHaveCount(0);
  for (const index of [0, 1]) {
    await payee.fill(payees[index].name);
    await dialog.getByRole('option', { name: payees[index].name, exact: true }).click();
    await expect(category).toHaveValue(categories[index].name);
    await expect(account).toHaveValue(accounts[index].id);
    await amount.fill('10,00');
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/bookings',
    );
    await dialog.getByRole('button', { name: 'Speichern und neu' }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const sent = response.request().postDataJSON();
    expect(sent.accountId).toBe(accounts[index].id);
    expect(sent.splits[0].categoryId).toBe(categories[index].id);
    const result = await response.json();
    expect(result.bookings[0].accountId).toBe(accounts[index].id);
    expect(result.bookings[0].splits[0].categoryId).toBe(categories[index].id);
    await expect(amount).toHaveValue('');
  }
  await payee.fill('Neuer Musterladen');
  await amount.focus();
  await expect(category).toHaveValue('');
  await expect(account).toHaveValue('');
  await account.selectOption(accounts[0].id);
  for (const method of ['typed', 'clicked', 'keyboard']) {
    await amount.fill('10,00');
    await category.fill('');
    await category.fill(categories[0].name);
    if (method === 'clicked')
      await dialog.getByRole('option', { name: new RegExp(`^${categories[0].name}`) }).click();
    else if (method === 'keyboard') await category.press('Enter');
    else await amount.focus();
    await expect(category).toHaveValue(categories[0].name);
    if (method === 'typed') {
      await category.fill('Suchtext ohne Treffer');
      await amount.focus();
      await expect(category).toHaveValue('Suchtext ohne Treffer');
      await expect(category).toHaveAttribute('aria-invalid', 'true');
      await expect(dialog.getByText('Bitte eine Kategorie aus der Liste wählen.')).toBeVisible();
      await category.press('Control+Enter');
      await expect(amount).toHaveValue('10,00');
      await expect(dialog).toBeVisible();
      const bookings = await request.get(`/api/bookings?accountId=${accounts[0].id}`);
      expect((await bookings.json()).items).toHaveLength(2);
      await category.fill(categories[0].name);
      await amount.focus();
    }
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/bookings',
    );
    await dialog.getByRole('button', { name: 'Speichern und neu' }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    expect(response.request().postDataJSON().splits[0].categoryId).toBe(categories[0].id);
    const result = await response.json();
    expect(result.bookings[0].splits[0].categoryId).toBe(categories[0].id);
    await expect(amount).toHaveValue('');
  }
  await category.fill('Suchtext ohne Treffer');
  await amount.focus();
  await expect(category).toHaveValue('Suchtext ohne Treffer');
  await expect(category).toHaveAttribute('aria-invalid', 'true');
  await amount.fill('10,00');
  await category.fill(categories[1].name.toLocaleLowerCase('de-AT'));
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/bookings',
  );
  await category.press('Control+Enter');
  const response = await saved;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON().accountId).toBe(accounts[0].id);
  expect(response.request().postDataJSON().splits[0].categoryId).toBe(categories[1].id);
  expect((await response.json()).bookings[0].splits[0].categoryId).toBe(categories[1].id);
});
