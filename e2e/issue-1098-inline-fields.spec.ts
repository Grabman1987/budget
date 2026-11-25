import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { captureCloseControl, redesignLoaded } from './ledger-helpers';

test.use({ ledgerToday: '2026-10-18' });

test('inline payee and category retain cents, undo, locks and selection in both registers', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'Phone rows have no inline payee pencil: a tap opens the edit panel (#1328).',
  );
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers: { origin: baseURL! }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Inline Musterkonto',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 100000,
  });
  const { group } = await post('/categories/groups', { name: 'Inline Mustergruppe' });
  const { category } = await post('/categories', {
    groupId: group.id,
    name: 'Inline Musterkategorie',
    kind: 'variable',
    class: 'need',
  });
  const { payee } = await post('/payees', {
    name: 'Inline Musterladen mit einem langen synthetischen Empfängernamen',
    defaultCategoryId: category.id,
  });
  const { id } = await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-17',
    amountCents: -1234,
    status: 'confirmed',
  });
  const read = async () => (await (await request.get(`/api/bookings/${id}`)).json()).booking;
  const original = {
    payeeId: null,
    amountCents: -1234,
    status: 'confirmed',
    splits: [{ categoryId: null, amountCents: -1234 }],
  };
  const undo = async () => {
    await page
      .locator('.toast.is-open')
      .getByRole('button', { name: 'Rückgängig', exact: true })
      .click();
    await expect.poll(read).toMatchObject(original);
  };
  for (const route of [`/konten/${account.id}`, '/konten/buchungen']) {
    await page.goto(route);
    expect(await redesignLoaded(page)).toBe(true);
    const row = page.locator(`[data-booking="${id}"]`);
    const trigger = row.getByRole('button', { name: /^Empfänger ändern:/ });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await row.getByRole('combobox', { name: 'Empfänger bearbeiten' }).selectOption(payee.id);
    await row.getByRole('combobox').press('Escape');
    await expect(trigger).toBeFocused();
    expect(await read()).toMatchObject(original);

    await trigger.click();
    await row.getByRole('combobox').selectOption(payee.id);
    await row.getByRole('combobox').press('Enter');
    // The payee's default category must not silently recategorize this booking.
    await expect.poll(read).toMatchObject({ ...original, payeeId: payee.id });
    await expect(row.locator('.kname-btn')).toContainText(payee.name);
    const nameBox = (await row.locator('.kname-btn').boundingBox())!;
    const pencilBox = (await trigger.boundingBox())!;
    expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(pencilBox.x + 1);
    await info.attach(route.endsWith('/buchungen') ? 'inline-payee-all' : 'inline-payee-account', {
      body: await row.screenshot(),
      contentType: 'image/png',
    });
    await undo();
    if (info.project.name === 'desktop') {
      const checkbox = row.getByRole('checkbox');
      if (route.endsWith('/buchungen')) await checkbox.check();
      await row.getByRole('button', { name: /^Kategorie ändern/ }).click();
      await row.getByRole('combobox').press('Escape');
      expect(await read()).toMatchObject(original);
      await row.getByRole('button', { name: /^Kategorie ändern/ }).click();
      await row.getByRole('combobox').selectOption(category.id);
      await expect.poll(read).toMatchObject({
        ...original,
        splits: [{ categoryId: category.id, amountCents: -1234 }],
      });
      if (route.endsWith('/buchungen')) await expect(checkbox).toBeChecked();
      await undo();
      if (route.endsWith('/buchungen')) await checkbox.uncheck();
    }
    if (route.endsWith('/buchungen') && info.project.name !== 'desktop') {
      await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
      await expect(trigger).toHaveCount(0);
      await row.getByRole('checkbox').check();
      await expect(row.getByRole('checkbox')).toBeChecked();
      await page.getByRole('button', { name: 'Auswahl beenden', exact: true }).click();
      await expect(trigger).toBeVisible();
    }
  }
  await post(`/accounts/${account.id}/reconciliation`, {
    date: '2026-10-17',
    statementBalanceCents: 98766,
  });
  await page.reload();
  const row = page.locator(`[data-booking="${id}"]`);
  await expect(row.getByRole('button', { name: /^Empfänger ändern:/ })).toHaveAttribute(
    'title',
    'Geprüft: im Dialog freigeben',
  );
  await row.getByRole('button', { name: /^Empfänger ändern:/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  if (await redesignLoaded(page))
    await page.getByRole('button', { name: 'Bearbeitung freigeben', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(row.getByRole('combobox')).toHaveCount(0);
  await captureCloseControl(dialog).click();
  expect(await read()).toMatchObject({ ...original, status: 'reconciled' });
});

test('split and transfer payees explain the dialog-only editing path', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Phone rows have no inline payee pencil (#1328).');
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers: { origin: baseURL! }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const account = async (name: string) =>
    (await post('/accounts', { name, type: 'checking', openingDate: '2026-01-01' })).account;
  const source = await account('Inline Quelle Muster');
  const target = await account('Inline Ziel Muster');
  const split = await post('/bookings', {
    type: 'booking',
    accountId: source.id,
    date: '2026-10-17',
    amountCents: -1001,
    splits: [
      { categoryId: null, amountCents: -700 },
      { categoryId: null, amountCents: -301 },
    ],
  });
  await post('/bookings', {
    type: 'transfer',
    fromAccountId: source.id,
    toAccountId: target.id,
    date: '2026-10-17',
    amountCents: 500,
  });
  await page.goto(`/konten/${source.id}`);
  const splitRow = page.locator(`[data-booking="${split.id}"]`);
  await expect(splitRow.getByRole('button', { name: /^Empfänger ändern:/ })).toHaveAttribute(
    'title',
    /Aufgeteilte Buchung/,
  );
  await expect(splitRow.locator('.kx-cat > span')).toHaveAttribute('title', /Aufgeteilte Buchung/);
  await splitRow.getByRole('button', { name: /^Empfänger ändern:/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await expect(dialog).toBeVisible();
  await captureCloseControl(dialog).click();
  const transfer = page.locator('tr[data-booking]').filter({ hasText: 'Umbuchung auf' });
  await expect(transfer.getByRole('button', { name: /^Empfänger ändern:/ })).toHaveAttribute(
    'title',
    /Umbuchung/,
  );
  await expect(transfer.locator('.kx-cat > span')).toHaveAttribute('title', /Umbuchung/);
  await transfer.getByRole('button', { name: /^Empfänger ändern:/ }).click();
  await expect(dialog).toBeVisible();
  await expect(transfer.getByRole('combobox')).toHaveCount(0);
});
