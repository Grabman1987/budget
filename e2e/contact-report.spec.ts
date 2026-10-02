import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { join } from 'node:path';
import { MAIN_URL } from '../playwright.config';
test.use({ reducedMotion: 'reduce' });
async function fixture(request: APIRequestContext, info: TestInfo) {
  const tag = `${info.project.name}-${info.title.slice(0, 13)}-${info.retry}`;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`${MAIN_URL}/api${path}`, {
      headers: { origin: MAIN_URL },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const today = (await (await request.get(`${MAIN_URL}/api/accounts`)).json()).asOf;
  const contact = (
    await post('/contacts', { name: `Kontakt Report ${tag}`, note: 'Gemeinsame Haushaltsauslagen' })
  ).contact;
  const account = (
    await post('/accounts', {
      name: `Giro Report ${tag}`,
      type: 'checking',
      openingDate: '2026-09-01',
      openingBalanceCents: 100000,
    })
  ).account;
  const outlay = await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-09-01',
    amountCents: -10000,
    status: 'pending',
    splits: [
      {
        categoryId: 'e2e-auslagen',
        contactId: contact.id,
        amountCents: -10000,
        memo: 'Anteil Haushalt',
      },
    ],
  });
  const receipt = await post(`/contacts/${contact.id}/settlements`, {
    accountId: account.id,
    date: today,
    amountCents: 12000,
  });
  return { contact, account, today, outlay, receipt, post };
}
async function capture(page: Page, name: string, info: TestInfo) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).include('main').analyze();
  expect(results.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    fullPage: true,
    animations: 'disabled',
    path: process.env['BUDGET_CONTACT_REPORT_EVIDENCE']
      ? join(process.env['BUDGET_CONTACT_REPORT_EVIDENCE'], `${name}-${info.project.name}.png`)
      : info.outputPath(`${name}.png`),
  });
}

test('fixed EUR report preserves credit, running history, source links and receipt undo', async ({
  page,
  request,
}, info) => {
  test.setTimeout(60000);
  const data = await fixture(request, info);
  const reads: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'GET' && req.url().includes('/api/contacts')) reads.push(req.url());
  });
  await page.goto(`/reports/kontakte?kontakt=${data.contact.id}`);
  const sheet = page.getByRole('region', { name: `Kontoblatt ${data.contact.name}`, exact: true });
  await expect(sheet).toContainText('−20,00 €');
  await expect(sheet).toContainText('Guthaben des Kontakts: 20,00 €');
  await expect(sheet).toContainText('vorgemerkt · EUR');
  await expect(sheet.getByRole('table').getByRole('row')).toHaveCount(3);
  const rows = sheet.getByRole('table').getByRole('row');
  await expect(rows.nth(1).locator('td').nth(2)).toHaveText('+100,00 €');
  await expect(rows.nth(1).locator('td').nth(3)).toHaveText('100,00 €');
  await expect(rows.nth(2).locator('td').nth(2)).toHaveText('−120,00 €');
  await expect(rows.nth(2).locator('td').nth(3)).toHaveText('−20,00 €');
  await expect(sheet.getByRole('img')).toHaveAccessibleName(/Ende −20,00 €/);
  await expect(
    sheet
      .getByRole('img')
      .locator('text')
      .filter({ hasText: /^[-−]0$/u }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /Abrechnung senden|Ausgleich buchen|Rückzahlung buchen/ }),
  ).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /Monat|Zeitraum/ })).toHaveCount(0);
  expect(reads.filter((url) => url.includes('/api/contacts?history=1'))).toHaveLength(1);
  expect(
    reads.filter((url) => url.includes(`/api/contacts/${data.contact.id}?asOf=`)),
  ).toHaveLength(1);
  const overview = await (await request.get(`${MAIN_URL}/api/contacts?history=1`)).json();
  expect(overview.totals.balanceCents).toBe(
    overview.totals.receivableCents - overview.totals.payableCents,
  );
  const historyLink = page
    .locator('.kt-jump')
    .getByRole('link', { name: new RegExp(data.contact.name) });
  await historyLink.focus();
  await historyLink.press('Enter');
  await expect(sheet.getByRole('heading')).toBeFocused();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await capture(page, `contact-report-${theme}`, info);
  }
  await sheet.getByRole('link', { name: 'Auslage öffnen', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`buchung=${data.outlay.bookings[0].id}`));
  await expect(page.getByRole('table', { name: 'Alle Buchungen nach Tag' })).toContainText(
    data.account.name,
  );
  await page.getByRole('button', { name: 'Buchung am 01.09. bearbeiten', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goto(`/reports/kontakte?kontakt=${data.contact.id}`);
  await sheet.getByRole('link', { name: 'Kontakt in Konten öffnen', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/konten/kontakte\\?kontakt=${data.contact.id}`));
  await expect(page.getByRole('dialog', { name: data.contact.name, exact: true })).toContainText(
    '−20,00 €',
  );
  const undone = await data.post('/undo', { groupId: data.receipt.groupId });
  await page.goto(`/reports/kontakte?kontakt=${data.contact.id}`);
  await expect(sheet.getByRole('table').getByRole('row')).toHaveCount(2);
  await expect(sheet.locator('.kt-sum')).toContainText('100,00 €');
  await data.post('/undo', { groupId: undone.groupId });
  await page.reload();
  await expect(sheet.getByRole('table').getByRole('row')).toHaveCount(3);
  await expect(sheet.locator('.kt-sum')).toContainText('−20,00 €');
});

test('balanced contacts stay hidden by default and retain deep-linked full history', async ({
  page,
  request,
}, info) => {
  const data = await fixture(request, info);
  const undone = await data.post('/undo', { groupId: data.receipt.groupId });
  expect(undone.groupId).toBeTruthy();
  await data.post(`/contacts/${data.contact.id}/settlements`, {
    accountId: data.account.id,
    date: data.today,
    amountCents: 10000,
  });
  await page.goto('/reports/kontakte');
  await expect(
    page.locator('.kt-jump').getByRole('link', { name: new RegExp(data.contact.name) }),
  ).toHaveCount(0);
  await page.getByLabel('Auch ausgeglichene Kontakte').check();
  await page
    .locator('.kt-jump')
    .getByRole('link', { name: new RegExp(data.contact.name) })
    .click();
  const sheet = page.getByRole('region', { name: `Kontoblatt ${data.contact.name}`, exact: true });
  await expect(sheet.locator('.kt-sum')).toHaveText('0,00 € · Ausgeglichen');
  await expect(sheet.getByRole('table').getByRole('row')).toHaveCount(3);
  await page.reload();
  await expect(page.getByLabel('Auch ausgeglichene Kontakte')).not.toBeChecked();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('table').getByRole('row')).toHaveCount(3);
  await expect(
    page.locator('.kt-jump').getByRole('link', { name: new RegExp(data.contact.name) }),
  ).toHaveCount(0);
});

test('mixed-currency failure hides every figure and person ledger, with usable retry and unknown ID', async ({
  page,
}) => {
  await page.route('**/api/contacts?history=1', (route) =>
    route.fulfill({
      status: 422,
      json: { error: 'booking_invariant', message: 'Contact statements require EUR movements' },
    }),
  );
  await page.goto('/reports/kontakte?kontakt=foreign-contact');
  await expect(
    page.getByText('Der Report ist nicht verfügbar. Es wird kein Teilsaldo gezeigt.'),
  ).toBeVisible();
  await expect(page.getByText(/Diese Abrechnung unterstützt nur EUR/)).toBeVisible();
  await expect(page.getByTestId('contact-report-balance')).toHaveCount(0);
  await expect(page.locator('.kt-sheet')).toHaveCount(0);
  await page.unroute('**/api/contacts?history=1');
  await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  await expect(page.getByTestId('contact-report-balance')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Kontoblatt konnten nicht geladen werden');
  await expect(page.locator('.kt-sheet')).toHaveCount(0);
  // A selected person's unsupported data invalidates the complete report too.
  await page.route('**/api/contacts/foreign-contact?asOf=*', (route) =>
    route.fulfill({
      status: 422,
      json: { error: 'booking_invariant', message: 'Contact statements require EUR movements' },
    }),
  );
  await page.reload();
  await expect(page.getByText(/Diese Abrechnung unterstützt nur EUR/)).toBeVisible();
  await expect(page.getByTestId('contact-report-balance')).toHaveCount(0);
  await expect(page.locator('.kt-sheet')).toHaveCount(0);
  // Known unsupported detail must stay unavailable while a retry is still in flight.
  let releaseRetry!: () => void;
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  await page.route('**/api/contacts/foreign-contact?asOf=*', async (route) => {
    await retryGate;
    await route.fulfill({
      status: 422,
      json: { error: 'booking_invariant', message: 'Contact statements require EUR movements' },
    });
  });
  const retryRequest = page.waitForRequest((request) =>
    request.url().includes('/api/contacts/foreign-contact?'),
  );
  await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  await retryRequest;
  try {
    await expect(page.getByTestId('contact-report-balance')).toHaveCount(0);
    await expect(page.locator('.kt-sheet')).toHaveCount(0);
  } finally {
    releaseRetry();
  }
  await expect(page.getByText(/Diese Abrechnung unterstützt nur EUR/)).toBeVisible();
  await page.route('**/api/contacts/foreign-contact?asOf=*', (route) =>
    route.fulfill({
      json: {
        contact: { id: 'foreign-contact', name: 'Wieder verfügbare Historie', note: null },
        asOf: new URL(route.request().url()).searchParams.get('asOf'),
        currency: 'EUR',
        balanceCents: 0,
        creditCents: 0,
        movements: [],
        outlays: [],
        receipts: [],
      },
    }),
  );
  await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  await expect(page.getByTestId('contact-report-balance')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Kontoblatt Wieder verfügbare Historie/ }),
  ).toBeVisible();
  // A loaded summary is also hidden after a failed refresh, rather than left as a stale success.
  await page.route('**/api/contacts?history=1', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  await page.reload();
  await expect(page.getByTestId('contact-report-balance')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Erneut versuchen', exact: true })).toBeVisible();
});
