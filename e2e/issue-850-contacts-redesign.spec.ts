import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { redesignReportsOn } from './report-frame';

test.use({ ledgerToday: '2026-10-02', reducedMotion: 'reduce' });
test('961/962 contacts: zero net retains credit and movement source context', async ({
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
  const advance = (
    await post('/categories', {
      name: 'Beispielauslagen',
      groupId: group.id,
      class: null,
      kind: 'advance',
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
  const payee = (await post('/payees', { name: 'Beispielmarkt' })).payee;
  const credit = (await post('/contacts', { name: 'Beispiel Vorauszahlung' })).contact;
  const owed = (await post('/contacts', { name: 'Beispiel Forderung' })).contact;
  const settled = (await post('/contacts', { name: 'Beispiel Ausgeglichen' })).contact;
  const note =
    'Gemeinsamer Beispieleinkauf mit einer langen Buchungsnotiz für die vollständige Anzeige bei Tastaturfokus und beim Zeigen mit der Maus.';
  await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-01',
    amountCents: -123456,
    payeeId: payee.id,
    memo: note,
    splits: [
      {
        categoryId: advance.id,
        contactId: owed.id,
        amountCents: -123456,
        memo: 'Anteil Beispielkontakt',
      },
    ],
  });
  await post(`/contacts/${credit.id}/settlements`, {
    accountId: account.id,
    date: '2026-10-01',
    amountCents: 123456,
    memo: 'Vorauszahlung für einen gemeinsamen Einkauf',
  });
  await page.goto(`/reports/kontakte?kontakt=${credit.id}`);
  if (!(await redesignReportsOn(page))) return;
  const list = page.getByRole('region', { name: 'Kontaktsalden' });
  const sheet = page.getByRole('region', { name: 'Kontaktkontoauszug' });
  await expect(page.getByTestId('report-frame-result')).toHaveText('0,00 €');
  const chain = page.getByRole('group', { name: 'Maßkette Kontakte' });
  await expect(chain).toContainText('Wir bekommen');
  await expect(chain).toContainText('Wir schulden');
  await expect(chain.locator('.ct-val')).toHaveText(['1.234,56 €', '1.234,56 €']);
  await expect(list.getByRole('link', { name: new RegExp(credit.name) })).toContainText(
    'Guthaben: 1.234,56 €',
  );
  await expect(sheet.locator('.r4-contact-summary')).toHaveText(
    'Offene Forderung: 0,00 € · Guthaben des Kontakts: 1.234,56 €',
  );
  await expect(sheet.locator('.contacts-balance')).toHaveText('Guthaben · 1.234,56 €');
  const showAll = page.getByRole('checkbox', { name: 'Auch ausgeglichene Kontakte' });
  await expect(showAll).not.toBeChecked();
  await expect(list.getByRole('link', { name: new RegExp(settled.name) })).toHaveCount(0);
  await showAll.check();
  await expect(list.getByRole('link', { name: new RegExp(settled.name) })).toBeVisible();
  await showAll.uncheck();
  await expect(list.getByRole('link', { name: new RegExp(credit.name) })).toBeVisible();
  await list.getByRole('link', { name: new RegExp(owed.name) }).click();
  await sheet.locator('[data-r8-detail="contact-history"] > summary').click();
  const source = sheet.getByRole('button', { name: /Ursprungsbuchung öffnen/ });
  await expect(source).toContainText(payee.name);
  await expect(source).toContainText(`Kategorie: ${advance.name}`);
  const bookingNote = source.getByTitle(note);
  await expect(bookingNote).toHaveText(note);
  await page.mouse.move(0, 0);
  await expect(bookingNote).toHaveCSS('text-overflow', 'ellipsis');
  await expect(bookingNote).toHaveCSS('white-space', 'nowrap');
  await source.focus();
  await expect(bookingNote).toHaveCSS('white-space', 'normal');
  await expect(source).toHaveAccessibleName(
    new RegExp(note.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('850 contacts: 5000-cent debt forgiveness, exact shortfall, cash unchanged, stale denial and Undo', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  const origin = isolatedLedger.origin;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { data, headers: { origin } });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const read = async (path: string) => {
    const response = await request.get(`/api${path}`);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const group = (await post('/categories/groups', { name: 'Synthetic contacts' })).group;
  const advance = (
    await post('/categories', {
      name: 'Synthetic outlays',
      groupId: group.id,
      class: null,
      kind: 'advance',
    })
  ).category;
  const gifts = (
    await post('/categories', {
      name: 'Synthetic chosen gift',
      groupId: group.id,
      class: 'want',
      kind: 'variable',
    })
  ).category;
  const account = (
    await post('/accounts', {
      name: 'Synthetic cash',
      type: 'checking',
      onBudget: true,
      openingDate: '2026-10-01',
      openingBalanceCents: 100000,
    })
  ).account;
  const owed = (await post('/contacts', { name: 'Synthetic owed' })).contact;
  const credit = (await post('/contacts', { name: 'Synthetic credit' })).contact;
  const balanced = (await post('/contacts', { name: 'Synthetic settled' })).contact;
  await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-01',
    amountCents: -5000,
    splits: [{ categoryId: advance.id, contactId: owed.id, amountCents: -5000 }],
  });
  await post(`/contacts/${credit.id}/settlements`, {
    accountId: account.id,
    date: '2026-10-01',
    amountCents: 2000,
  });
  const assigned = await request.put('/api/budget/2026-10/assigned', {
    headers: { origin },
    data: { items: [{ categoryId: gifts.id, assignedCents: 2000 }] },
  });
  expect(assigned.ok()).toBe(true);
  const cash = (await read('/accounts')).accounts[0].balanceCents;
  expect(cash).toBe(97000);
  await page.goto(`/reports/kontakte?kontakt=${owed.id}&verlauf=1#details`);
  if (!(await redesignReportsOn(page))) {
    await expect(page.getByRole('region', { name: 'Kontaktkontoauszug' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Schulden erlassen', exact: true })).toHaveCount(
      0,
    );
    return;
  }
  await expect.poll(() => new URL(page.url()).pathname).toBe('/reports/kontakte');
  expect(new URL(page.url()).searchParams.get('kontakt')).toBe(owed.id);
  expect(new URL(page.url()).hash).toBe('#details');
  const body = page.locator('.r4-contact-report');
  await expect(body.getByRole('link', { name: new RegExp(balanced.name) })).toBeVisible();
  await expect(page.getByTestId('report-frame-result')).toContainText('30,00 €');
  await body.getByRole('link', { name: new RegExp(credit.name) }).click();
  await expect(page.getByRole('heading', { name: `Kontoblatt ${credit.name}` })).toBeFocused();
  await expect(body.getByRole('button', { name: 'Schulden erlassen', exact: true })).toHaveCount(0);
  await expect(
    body.getByRole('button', { name: /Rückzahlung|Ausgleichen|Kontakt anlegen|Umbenennen/ }),
  ).toHaveCount(0);
  await body.getByRole('link', { name: new RegExp(balanced.name) }).click();
  await expect(body).toContainText('Noch keine Kontaktbuchungen. Der Saldo ist ausgeglichen.');
  await expect(body.getByRole('button', { name: 'Schulden erlassen', exact: true })).toHaveCount(0);
  const showAll = page.getByRole('checkbox', { name: 'Auch ausgeglichene Kontakte' });
  await showAll.uncheck();
  await expect(page).not.toHaveURL(/verlauf=/);
  await page.reload();
  await expect(showAll).not.toBeChecked();
  await showAll.check();
  await expect(page).toHaveURL(/verlauf=1/);
  await page.goBack();
  await expect(showAll).not.toBeChecked();
  await page.goForward();
  await expect(showAll).toBeChecked();
  await body.getByRole('link', { name: new RegExp(owed.name) }).click();
  const history = body.locator('[data-r8-detail="contact-history"]');
  await history.locator(':scope > summary').click();
  const source = history.getByRole('button', { name: /Ursprungsbuchung öffnen/ }).first();
  await source.click();
  await expect(page.getByRole('dialog', { name: 'Buchung bearbeiten' })).toBeVisible();
  const sourceOverviewUrl = '**/api/contacts?history=1';
  await page.route(sourceOverviewUrl, (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  const sourceReadFailure = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/contacts' && response.status() === 503,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await sourceReadFailure;
  await expect(page.getByRole('dialog', { name: 'Buchung bearbeiten' })).toBeVisible();
  await page.unroute(sourceOverviewUrl);
  const sourceRecovered = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/contacts' && response.status() === 200,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await sourceRecovered;
  await expect(page.locator('[data-r4-forgive]')).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(source).toBeFocused();
  await history.locator(':scope > summary').click();
  const calculation = page.getByTestId('report-calculation');
  await expect(calculation.getByText('Wir bekommen', { exact: true })).toBeVisible();
  await expect(calculation).toContainText('50,00 €');
  await expect(calculation).toContainText('20,00 €');
  const evidence = 'docs/evidence/redesign-reports-20261103-a';
  await mkdir(evidence, { recursive: true });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
    return document.fonts.ready;
  });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `${evidence}/r4-contacts-${info.project.name}-${theme}.png`,
      fullPage: true,
    });
  }
  await page.getByRole('combobox', { name: 'Darstellung der Kontakte' }).selectOption('offen');
  await expect(body.locator('.r4-open-items')).toContainText('50,00 €');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    await page.screenshot({
      path: `${evidence}/r4-open-items-${info.project.name}-${theme}.png`,
      fullPage: true,
    });
  }
  await body.getByRole('button', { name: 'Schulden erlassen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Schulden erlassen', exact: true });
  const submit = dialog.getByRole('button', { name: 'Schulden erlassen', exact: true });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('Kategorie', { exact: true }).selectOption(gifts.id);
  await expect(dialog).toContainText('verfügbar 20,00 € → −30,00 €. Fehlbetrag danach: 30,00 €');
  await expect(dialog).toContainText('Kontaktschuld danach: 0,00 €. Kontogeld bleibt unverändert.');
  await dialog.getByLabel('Betrag', { exact: true }).fill('50,01');
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('Betrag', { exact: true }).fill('50');
  await expect(submit).toBeEnabled();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `${evidence}/r4-forgive-${info.project.name}-${theme}.png`,
      fullPage: true,
    });
  }
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const button of await dialog.getByRole('button').all()) {
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  await page.setViewportSize(viewport);
  // A failed balance refresh preserves the named category and local draft, while denying a write.
  await dialog.getByLabel('Notiz', { exact: true }).fill('Synthetic forgiveness draft');
  const overviewUrl = '**/api/contacts?history=1';
  await page.route(overviewUrl, (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  const failedRead = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/contacts' &&
      new URL(response.url()).searchParams.get('history') === '1',
  );
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  expect((await failedRead).status()).toBe(503);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Notiz', { exact: true })).toHaveValue(
    'Synthetic forgiveness draft',
  );
  await expect(dialog.getByLabel('Kategorie', { exact: true })).toHaveValue(gifts.id);
  await expect(submit).toBeDisabled();
  await page.unroute(overviewUrl);
  await dialog.getByRole('button', { name: 'Saldo erneut prüfen', exact: true }).click();
  await expect(submit).toBeEnabled();
  page.once('dialog', (confirm) => confirm.dismiss());
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(dialog).toBeVisible();
  const committed = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/contacts/${owed.id}/write-offs`) &&
      response.request().method() === 'POST',
  );
  await submit.click();
  expect((await committed).ok()).toBe(true);
  await expect(dialog).toBeHidden();
  expect((await read(`/contacts/${owed.id}`)).balanceCents).toBe(0);
  expect((await read('/accounts')).accounts[0].balanceCents).toBe(cash);
  expect(
    (await read('/budget/2026-10')).summary.envelopes.find(
      (envelope: { categoryId: string }) => envelope.categoryId === gifts.id,
    ),
  ).toMatchObject({ activityCents: -5000, availableCents: -3000 });
  const repeat = await request.post(`/api/contacts/${owed.id}/write-offs`, {
    headers: { origin },
    data: { accountId: account.id, date: '2026-10-02', amountCents: 5000, categoryId: gifts.id },
  });
  expect(repeat.status()).toBe(422);
  expect((await read('/accounts')).accounts[0].balanceCents).toBe(cash);
  await page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true })
    .click();
  await expect.poll(async () => (await read(`/contacts/${owed.id}`)).balanceCents).toBe(5000);
  expect((await read('/accounts')).accounts[0].balanceCents).toBe(cash);
  expect(
    (await read('/budget/2026-10')).summary.envelopes.find(
      (envelope: { categoryId: string }) => envelope.categoryId === gifts.id,
    ),
  ).toMatchObject({ activityCents: 0, availableCents: 2000 });
  // A real concurrent repayment lowers the maximum while this browser retains its draft.
  await body.getByRole('button', { name: 'Schulden erlassen', exact: true }).click();
  await dialog.getByLabel('Kategorie', { exact: true }).selectOption(gifts.id);
  await expect(submit).toBeEnabled();
  const payment = await post(`/contacts/${owed.id}/settlements`, {
    accountId: account.id,
    date: '2026-10-02',
    amountCents: 1000,
  });
  const refused = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/contacts/${owed.id}/write-offs`) &&
      response.request().method() === 'POST',
  );
  await submit.click();
  expect((await refused).status()).toBe(422);
  await expect(dialog).toBeVisible();
  await expect(submit).toBeDisabled();
  expect((await read(`/contacts/${owed.id}`)).balanceCents).toBe(4000);
  expect((await read('/accounts')).accounts[0].balanceCents).toBe(cash + 1000);
  expect(
    (await read('/budget/2026-10')).summary.envelopes.find(
      (envelope: { categoryId: string }) => envelope.categoryId === gifts.id,
    ).activityCents,
  ).toBe(0);
  page.once('dialog', (confirm) => confirm.accept());
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await post('/undo', { groupId: payment.groupId });
  expect((await read(`/contacts/${owed.id}`)).balanceCents).toBe(5000);
  expect((await read('/accounts')).accounts[0].balanceCents).toBe(cash);
  await page.reload();
  await expect(body.locator('.contacts-balance')).toContainText('50,00 €');
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
