import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { join } from 'node:path';
import { MAIN_URL } from '../playwright.config';

test.use({ reducedMotion: 'reduce' });
async function fixture(request: APIRequestContext, info: TestInfo) {
  const tag = `${info.project.name}-${info.title.slice(0, 12)}-${info.retry}`;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`${MAIN_URL}/api${path}`, {
      headers: { origin: MAIN_URL },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const today = (await (await request.get(`${MAIN_URL}/api/accounts`)).json()).asOf as string;
  const security = (
    await post('/securities', { name: `Sparfonds ${tag}`, kind: 'fund', currency: 'CHF' })
  ).security;
  const depot = (
    await post('/accounts', {
      name: `CHF Depot ${tag}`,
      type: 'brokerage',
      currency: 'CHF',
      openingBalanceCents: 0,
      openingDate: today,
    })
  ).account;
  const source = (
    await post('/accounts', {
      name: `Giro Quelle ${tag}`,
      type: 'checking',
      currency: 'EUR',
      openingBalanceCents: 0,
      openingDate: today,
    })
  ).account;
  return { security, depot, source, today };
}
async function draft(page: Page, fixture: Awaited<ReturnType<typeof fixture>>) {
  await page.getByRole('button', { name: 'Sparplan anlegen', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Sparplan anlegen', exact: true });
  await panel.getByLabel('Instrument', { exact: true }).selectOption(fixture.security.id);
  await panel.getByLabel('Anlagekonto', { exact: true }).selectOption(fixture.depot.id);
  await panel.getByLabel('Monatliche Rate (CHF)', { exact: true }).fill('100');
  await panel.getByLabel('Ausführungstag', { exact: true }).fill('31');
  await panel.getByLabel('Quellkonto', { exact: true }).selectOption(fixture.source.id);
  return panel;
}
async function capture(page: Page, name: string, info: TestInfo) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  if (await page.locator('dialog[open] .bk-body').count())
    await page.locator('dialog[open] .bk-body').evaluate((el) => (el.scrollTop = 0));
  const scope = (await page.locator('dialog[open]').count()) ? 'dialog[open]' : 'main';
  expect((await new AxeBuilder({ page }).include(scope).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.screenshot({
    fullPage: true,
    animations: 'disabled',
    path: process.env['BUDGET_SAVINGS_EVIDENCE']
      ? join(process.env['BUDGET_SAVINGS_EVIDENCE'], `${name}-${info.project.name}.png`)
      : info.outputPath(`${name}.png`),
  });
}

test('native savings CRUD, future/current history, end, reload and audited undo', async ({
  page,
  request,
}, info) => {
  test.setTimeout(60000);
  const data = await fixture(request, info);
  await page.goto('/vermoegen/portfolio');
  const panel = await draft(page, data);
  await panel.getByLabel('Monatliche Rate (CHF)', { exact: true }).fill('0');
  await panel.getByRole('button', { name: 'Sparplan anlegen', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('positive Rate');
  await panel.getByLabel('Monatliche Rate (CHF)', { exact: true }).fill('100');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await capture(page, `savings-create-${theme}`, info);
  }
  await panel.getByRole('button', { name: 'Sparplan anlegen', exact: true }).click();
  await expect(panel).toHaveCount(0);
  const list = async () =>
    (await (await request.get(`${MAIN_URL}/api/savings-plans?ended=1`)).json()).plans.filter(
      (p: { securityId: string }) => p.securityId === data.security.id,
    );
  let rows = await list();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    amountCents: 10000,
    dayOfMonth: 31,
    sourceAccountId: data.source.id,
  });
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByRole('button', { name: data.security.name, exact: true })).toHaveCount(1); // instrument catalog remains
  expect(await list()).toEqual([]);
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect.poll(async () => (await list()).length).toBe(1);
  const section = page.getByRole('region', { name: 'Sparpläne', exact: true });
  const row = section
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: data.security.name, exact: true }) });
  await row.getByRole('button', { name: data.security.name, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Versionsverlauf' })).toBeVisible();
  await page.getByRole('button', { name: 'Sparplan bearbeiten', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Sparplan bearbeiten', exact: true });
  const future = `${Number(data.today.slice(0, 4)) + 1}-01-01`;
  await edit.getByLabel('Monatliche Rate (CHF)', { exact: true }).fill('200');
  await edit.getByLabel('Änderung ab', { exact: true }).fill(future);
  await edit.getByRole('button', { name: 'Änderung speichern', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await page.getByRole('link', { name: 'Zurück zum Portfolio' }).click();
  await expect(row.locator('td').nth(1)).toContainText('100,00');
  await expect(row.locator('td').nth(2)).toContainText('200,00');
  await expect(section).toContainText('CHF');
  rows = await list();
  expect(rows).toHaveLength(2);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(row.locator('td').nth(2)).not.toContainText('200,00');
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect(row.locator('td').nth(2)).toContainText('200,00');
  await page.reload();
  await row.getByRole('button', { name: data.security.name, exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Versionsverlauf' })
      .getByRole('link', { name: data.source.name }),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Sparplan bearbeiten', exact: true }).click();
  await expect(edit.getByLabel('Monatliche Rate (CHF)', { exact: true })).toHaveValue('200,00');
  await edit.getByRole('button', { name: 'Sparplan beenden', exact: true }).click();
  await expect(edit.getByLabel('Ende einschließlich', { exact: true })).toHaveValue(
    future.split('-').reverse().join('.'),
  );
  await edit.getByRole('button', { name: 'Ende speichern', exact: true }).click();
  await expect(edit).toHaveCount(0);
  expect((await list())[1].validTo).toBe(future);
  await page.getByRole('link', { name: 'Zurück zum Portfolio' }).click();
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect.poll(async () => (await list())[1].validTo).toBeNull();
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect.poll(async () => (await list())[1].validTo).toBe(future);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await section.scrollIntoViewIfNeeded();
    await capture(page, `savings-list-${theme}`, info);
  }
});

test('dirty close and actual Back while write is held preserve draft after failure', async ({
  page,
  request,
}, info) => {
  const data = await fixture(request, info);
  await page.goto('/vermoegen/portfolio');
  const panel = await draft(page, data);
  await page.keyboard.press('Escape');
  await expect(panel).toContainText('Ungespeicherte Angaben verwerfen?');
  await panel.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await page.evaluate(() => window.history.back());
  await expect(panel).toContainText('Ungespeicherte Angaben verwerfen?');
  await panel.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await expect(page).toHaveURL(/sparplan=neu/);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/savings-plans', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await gate;
    await route.fulfill({ status: 409, json: { error: 'conflict' } });
  });
  await panel.getByRole('button', { name: 'Sparplan anlegen', exact: true }).click();
  await expect(panel.getByLabel('Monatliche Rate (CHF)', { exact: true })).toBeDisabled();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.addEventListener('popstate', () => resolve(), { once: true });
        window.history.back();
      }),
  );
  await expect(page).toHaveURL(/sparplan=neu/);
  await page.keyboard.press('Escape');
  await panel
    .locator('xpath=.')
    .evaluate((dialog) => dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Ungespeicherte Angaben verwerfen?')).toHaveCount(0);
  release();
  await expect(panel.getByRole('alert')).toContainText('Ein offener Plan besteht bereits');
  await expect(panel.getByLabel('Monatliche Rate (CHF)', { exact: true })).toHaveValue('100');
  await expect(panel.getByLabel('Monatliche Rate (CHF)', { exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/sparplan=neu/);
  await page.evaluate(() => window.history.back());
  await expect(panel).toContainText('Ungespeicherte Angaben verwerfen?');
  await panel.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page).not.toHaveURL(/sparplan=/);
});

test('foreign plan URL and list failure are honest without blocking retry', async ({ page }) => {
  await page.route('**/api/savings-plans?ended=1', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  await page.goto('/vermoegen/portfolio?sparplan=foreign-id&produkt=neu');
  await expect(page.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.unroute('**/api/savings-plans?ended=1');
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.getByRole('alert')).toContainText('Dieser Sparplan ist nicht verfügbar');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Zurück zum Portfolio' }).click();
  await expect(page.getByRole('button', { name: 'Sparplan anlegen', exact: true })).toBeVisible();
});

test('successful held write discards pending Back and creates exactly one schedule', async ({
  page,
  request,
}, info) => {
  const data = await fixture(request, info);
  await page.goto('/vermoegen/portfolio');
  const panel = await draft(page, data);
  let release!: () => void;
  let sent = 0;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/savings-plans', async (route) => {
    if (route.request().method() === 'POST') {
      sent += 1;
      await gate;
    }
    await route.continue();
  });
  await panel.getByRole('button', { name: 'Sparplan anlegen', exact: true }).click();
  await expect(panel.getByLabel('Monatliche Rate (CHF)', { exact: true })).toBeDisabled();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.addEventListener('popstate', () => resolve(), { once: true });
        window.history.back();
      }),
  );
  await expect(page).toHaveURL(/sparplan=neu/);
  await panel.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(panel).toBeVisible();
  release();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/vermoegen\/portfolio$/);
  expect(sent).toBe(1);
  const plans = (await (await request.get(`${MAIN_URL}/api/savings-plans?ended=1`)).json()).plans;
  expect(
    plans.filter((p: { securityId: string }) => p.securityId === data.security.id),
  ).toHaveLength(1);
});

test('overlapping schedules preserve both rates and missing account makes totals unavailable', async ({
  page,
  request,
}, info) => {
  const data = await fixture(request, info);
  const post = async (path: string, body: unknown) => {
    const response = await request.post(`${MAIN_URL}/api${path}`, {
      headers: { origin: MAIN_URL },
      data: body,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const input = {
    securityId: data.security.id,
    accountId: data.depot.id,
    amountCents: 10000,
    dayOfMonth: 5,
    validFrom: data.today,
  };
  const first = (await post('/savings-plans', input)).plan;
  await post(`/savings-plans/${first.id}/end`, {
    to: `${Number(data.today.slice(0, 4)) + 1}-12-31`,
  });
  await post('/savings-plans', { ...input, amountCents: 20000 });
  await page.goto('/vermoegen/portfolio');
  const section = page.getByRole('region', { name: 'Sparpläne', exact: true });
  const row = section
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: data.security.name, exact: true }) });
  await expect(section).toContainText('Mehrere Versionen gelten gleichzeitig');
  await expect(section.locator('.aside')).toContainText('CHF: Summe nicht verfügbar');
  await expect(row.locator('td').nth(1)).toContainText('Nicht eindeutig');
  await expect(row.locator('td').nth(1)).toContainText('100,00');
  await expect(row.locator('td').nth(1)).toContainText('200,00');
  await row.getByRole('button', { name: data.security.name, exact: true }).click();
  const panel = page.getByRole('region', { name: 'Sparplandetails', exact: true });
  await expect(panel.getByRole('region', { name: 'Versionsverlauf' })).toContainText('100,00');
  await expect(panel.getByRole('region', { name: 'Versionsverlauf' })).toContainText('200,00');
  await page.getByRole('link', { name: 'Zurück zum Portfolio' }).click();
  await expect(page).toHaveURL(/\/vermoegen\/portfolio$/);
  // A deliberately incomplete lookup response verifies honest projection without deleting data.
  await page.route('**/api/accounts', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.accounts = body.accounts.filter((a: { id: string }) => a.id !== data.depot.id);
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(section).toContainText(
    'Währung und vollständige Monatssummen können nicht bestimmt werden',
  );
  await expect(row).toContainText('Nicht verfügbares Konto');
  await expect(section.locator('.aside')).toContainText('Währung unbekannt: Summe nicht verfügbar');
});

test('integrated portfolio pages keep input dialogs exclusive and restore form opener focus', async ({
  page,
  request,
}, info) => {
  const data = await fixture(request, info);
  const response = await request.post(`${MAIN_URL}/api/savings-plans`, {
    headers: { origin: MAIN_URL },
    data: {
      securityId: data.security.id,
      accountId: data.depot.id,
      amountCents: 10000,
      dayOfMonth: 5,
      validFrom: data.today,
    },
  });
  expect(response.ok()).toBe(true);
  const plan = (await response.json()).plan;
  await page.goto('/vermoegen/portfolio');
  await page.getByRole('button', { name: 'Sollquoten bearbeiten', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Sollquoten bearbeiten', exact: true }),
  ).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Handel erfassen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Handel erfassen', exact: true })).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  // The unheld-instrument catalog is a native details element that starts closed.
  await page.locator('.instrument-catalog > summary').click();
  await page
    .locator('.instrument-catalog')
    .getByRole('button', { name: data.security.name, exact: true })
    .click();
  const instrument = page.getByRole('region', { name: data.security.name, exact: true });
  await expect(instrument).toBeVisible();
  await instrument.getByRole('button', { name: 'Handel erfassen', exact: true }).click();
  const trade = page.getByRole('dialog', { name: 'Handel erfassen', exact: true });
  await expect(trade).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(instrument).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Zurück zum Portfolio' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const opener = page
    .getByRole('region', { name: 'Sparpläne', exact: true })
    .getByRole('button', { name: data.security.name, exact: true });
  await opener.focus();
  await opener.press('Enter');
  await expect(page.getByRole('region', { name: 'Versionsverlauf' })).toBeVisible();
  const editTrigger = page.getByRole('button', { name: 'Sparplan bearbeiten', exact: true });
  await editTrigger.click();
  const savings = page.getByRole('dialog', { name: 'Sparplan bearbeiten', exact: true });
  await expect(savings).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(editTrigger).toBeFocused();
  expect(await editTrigger.evaluate((el) => el.isConnected)).toBe(true);
  await page.getByRole('link', { name: 'Zurück zum Portfolio' }).click();
  const create = page.getByRole('button', { name: 'Sparplan anlegen', exact: true });
  await create.focus();
  await create.press('Enter');
  const creating = page.getByRole('dialog', { name: 'Sparplan anlegen', exact: true });
  await expect(creating).toBeVisible();
  await creating.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(create).toBeFocused();
  expect(await create.evaluate((el) => el.isConnected)).toBe(true);
  // Legacy bookmarks retain savings priority and become a read-only sub-page.
  await page.goto(
    `/vermoegen/portfolio?sparplan=${plan.id}&produkt=${data.security.id}&handel=neu&allokation=ziele`,
  );
  await expect(page).toHaveURL(new RegExp(`/sparplan/${plan.id}$`));
  await expect(page.getByRole('region', { name: 'Versionsverlauf' })).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Zurück zum Portfolio' }).click();
  await expect(page).toHaveURL(/\/vermoegen\/portfolio$/);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(opener).toBeVisible();
});
test('schedule details have a URL, version history and separate guarded input dialogs', async ({
  page,
  request,
}, info) => {
  const data = await fixture(request, info);
  const response = await request.post(`${MAIN_URL}/api/savings-plans`, {
    headers: { origin: MAIN_URL },
    data: {
      securityId: data.security.id,
      accountId: data.depot.id,
      amountCents: 12345,
      dayOfMonth: 5,
      validFrom: data.today,
    },
  });
  expect(response.ok()).toBe(true);
  const plan = (await response.json()).plan;
  await page.goto('/vermoegen/portfolio?zeitraum=3J');
  await page.locator(`[data-savings-plan="${plan.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/sparplan/${plan.id}\\?zeitraum=3J$`));
  const url = page.url();
  await expect(page.getByRole('navigation', { name: 'Brotkrumen' })).toContainText('Sparplan');
  await expect(page.getByRole('region', { name: 'Versionsverlauf' })).toContainText('123,45');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await capture(page, 'savings-detail', info);
  await page.getByRole('button', { name: 'Sparplan bearbeiten', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Sparplan bearbeiten', exact: true });
  await expect(page.locator('dialog.panel[open]')).toHaveCount(0);
  await form.getByLabel('Monatliche Rate (CHF)', { exact: true }).fill('200');
  await page.evaluate(() => window.history.back());
  await expect(form).toContainText('Ungespeicherte Angaben verwerfen?');
  await form.getByRole('button', { name: 'Weiter bearbeiten', exact: true }).click();
  await expect(page).toHaveURL(url);
  await page.keyboard.press('Escape');
  await form.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Sparplan bearbeiten', exact: true }),
  ).toBeFocused();
  await page.getByRole('link', { name: 'Zurück zum Portfolio' }).click();
  await expect(page).toHaveURL(/\/vermoegen\/portfolio\?zeitraum=3J$/);
  await page.goto(url);
  await page.getByRole('button', { name: 'Sparplan beenden', exact: true }).click();
  await expect(form.getByLabel('Ende einschließlich')).toHaveValue(
    data.today.split('-').reverse().join('.'),
  );
  await page.keyboard.press('Escape');
  await form.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await page.getByRole('link', { name: 'Zurück zum Portfolio' }).click();
  await expect(page).toHaveURL(/\/vermoegen\/portfolio\?zeitraum=3J$/);
});
