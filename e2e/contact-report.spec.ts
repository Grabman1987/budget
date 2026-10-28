import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { join } from 'node:path';
import { MAIN_URL } from '../playwright.config';
test.use({ reducedMotion: 'reduce' });
async function fixture(request: APIRequestContext, info: TestInfo) {
  const tag = `${info.project.name}-${info.title.slice(0, 13)}-${info.retry}-${info.repeatEachIndex}`;
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

// The retired chart/jump-list is replaced by the live contact statement. Running cents and
// pending provenance remain real API assertions; the current statement renders signed shares.
test('fixed EUR report preserves credit, running history, source links and receipt undo', async ({ page, request }, info) => {
  test.setTimeout(60000);
  const data = await fixture(request, info);
  const writes: string[] = [];
  page.on('request', (r) => { if (new URL(r.url()).pathname.startsWith('/api/') && r.method() !== 'GET') writes.push(r.url()); });
  const statement = async () => {
    const response = await request.get(`${MAIN_URL}/api/contacts/${data.contact.id}`);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const actual = await statement();
  expect(actual).toMatchObject({ currency: 'EUR', balanceCents: -2000, creditCents: 2000 });
  expect(actual.movements.map((m: { amountCents: number; balanceCents: number; status: string; accountId: string; bookingId: string; date: string }) => [m.amountCents, m.balanceCents, m.status, m.accountId, m.bookingId, m.date])).toEqual([
    [-10000, 10000, 'pending', data.account.id, data.outlay.bookings[0].id, '2026-09-01'], [12000, -2000, 'confirmed', data.account.id, data.receipt.bookingId, data.today],
  ]);
  await page.goto(`/reports/kontakte?kontakt=${data.contact.id}`);
  await expect(page).toHaveURL(new RegExp(`/konten/kontakte/${data.contact.id}$`));
  const sheet = page.getByRole('region', { name: 'Kontaktkontoauszug' });
  await expect(sheet.locator('.contacts-balance')).toContainText('Du schuldest 20,00 €');
  const movements = sheet.locator('.contact-movements tbody tr');
  await expect(movements).toHaveCount(2);
  const outlay = movements.filter({ has: page.getByRole('button', { name: /Ursprungsbuchung öffnen · Anteil Haushalt/ }) });
  const receipt = movements.filter({ hasText: '−120,00 €' });
  await expect(outlay.locator('td').nth(1)).toHaveText('+100,00 €');
  await expect(outlay).toContainText('01.09.2026');
  await expect(receipt.locator('td').nth(1)).toHaveText('−120,00 €');
  await expect(sheet.getByRole('heading', { name: data.contact.name, exact: true })).toBeFocused();
  await receipt.locator('.contact-allocation-details > summary').click();
  await expect(receipt.locator('.contact-allocation-details')).toContainText('Guthaben: 20,00 €');
  await expect(page.getByRole('combobox', { name: /Monat|Zeitraum/ })).toHaveCount(0);
  const overview = await (await request.get(`${MAIN_URL}/api/contacts?history=1`)).json();
  expect(overview.totals.balanceCents).toBe(overview.totals.receivableCents - overview.totals.payableCents);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await capture(page, `contact-report-${theme}`, info);
  }
  const source = outlay.getByRole('button', { name: /Ursprungsbuchung öffnen · Anteil Haushalt/ });
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse), (max-width: 767px)').matches);
  // The existing contact source is compact on desktop; the shared touch floor remains 44px.
  if (touch) expect((await source.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  else expect((await source.boundingBox())!.height).toBe(34);
  await source.focus();
  const sourceRead = page.waitForRequest((r) => new URL(r.url()).pathname === `/api/bookings/${data.outlay.bookings[0].id}`);
  await page.keyboard.press('Enter');
  await sourceRead;
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText(data.account.name);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes).toEqual([]);
  const undone = await data.post('/undo', { groupId: data.receipt.groupId });
  await page.reload();
  await expect(movements).toHaveCount(1);
  await expect(sheet.locator('.contacts-balance')).toContainText('100,00 €');
  expect((await statement()).movements.map((m: { balanceCents: number }) => m.balanceCents)).toEqual([10000]);
  await data.post('/undo', { groupId: undone.groupId });
  await page.reload();
  await expect(movements).toHaveCount(2);
  await expect(sheet.locator('.contacts-balance')).toContainText('Du schuldest 20,00 €');
  expect((await statement()).movements.map((m: { balanceCents: number }) => m.balanceCents)).toEqual([10000, -2000]);
});

test('balanced contacts stay hidden by default and retain deep-linked full history', async ({ page, request }, info) => {
  const data = await fixture(request, info);
  const undone = await data.post('/undo', { groupId: data.receipt.groupId });
  expect(undone.groupId).toBeTruthy();
  await data.post(`/contacts/${data.contact.id}/settlements`, { accountId: data.account.id, date: data.today, amountCents: 10000 });
  await page.goto('/reports/kontakte');
  await expect(page.locator('.contacts-table').getByRole('link', { name: data.contact.name, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Alle', exact: true }).click();
  await page.locator('.contacts-table').getByRole('link', { name: data.contact.name, exact: true }).click();
  const sheet = page.getByRole('region', { name: 'Kontaktkontoauszug' });
  await expect(sheet.locator('.contacts-balance')).toContainText('Ausgeglichen');
  await expect(sheet.locator('.contacts-balance')).toContainText('0,00 €');
  const closed = sheet.locator('.contacts-closed-history > summary');
  if (await closed.count()) await closed.click();
  await expect(sheet.locator('.contact-movements tbody tr')).toHaveCount(2);
  await expect(sheet.getByRole('button', { name: /Ursprungsbuchung öffnen · Anteil Haushalt/ })).toBeVisible();
  await page.reload();
  await expect(sheet).toBeVisible();
  if (await closed.count()) await closed.click();
  await expect(sheet.locator('.contact-movements tbody tr')).toHaveCount(2);
  await expect(sheet.getByRole('button', { name: /Ursprungsbuchung öffnen · Anteil Haushalt/ })).toBeVisible();
  // Source context is now explicitly the area's retained-history filter.
  await page.getByRole('link', { name: 'Zurück zu Kontakte', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Alle', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Offen', exact: true }).click();
  await expect(page.locator('.contacts-table').getByRole('link', { name: data.contact.name, exact: true })).toHaveCount(0);
});

test('mixed-currency failure hides every figure and person ledger, with usable retry and unknown ID', async ({ page }) => {
  const path = '**/api/contacts/foreign-contact';
  await page.route(path, (route) => route.fulfill({ status: 422, json: { error: 'booking_invariant', message: 'Contact statements require EUR movements' } }));
  await page.goto('/reports/kontakte?kontakt=foreign-contact');
  const sheet = page.getByRole('region', { name: 'Kontaktkontoauszug' });
  await expect(page.getByRole('alert')).toContainText('Kontoblatt konnten nicht geladen werden');
  await expect(sheet.locator('.contacts-balance')).toHaveCount(0);
  await expect(sheet.getByRole('table')).toHaveCount(0);
  let releaseRetry!: () => void;
  const retryGate = new Promise<void>((resolve) => { releaseRetry = resolve; });
  await page.route(path, async (route) => { await retryGate; await route.fulfill({ status: 422, json: { error: 'booking_invariant' } }); });
  const retryRequest = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/contacts/foreign-contact');
  await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  await retryRequest;
  try {
    await expect(sheet.locator('.contacts-balance')).toHaveCount(0);
    await expect(sheet.getByRole('table')).toHaveCount(0);
  } finally { releaseRetry(); }
  await expect(page.getByRole('alert')).toBeVisible();
  await page.route(path, (route) => route.fulfill({ json: {
    contact: { id: 'foreign-contact', name: 'Wieder verfügbare Historie', note: null }, asOf: '2026-09-17', currency: 'EUR',
    balanceCents: 0, creditCents: 0, movements: [], outlays: [], receipts: [], closedThroughSplitId: null,
  } }));
  await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  await expect(sheet.getByRole('heading', { name: 'Wieder verfügbare Historie', exact: true })).toBeVisible();
  await expect(sheet.locator('.contacts-balance')).toContainText('Ausgeglichen');
  await page.route(path, (route) => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(sheet.locator('.contacts-balance')).toHaveCount(0);
  await expect(sheet.getByRole('table')).toHaveCount(0);
});
