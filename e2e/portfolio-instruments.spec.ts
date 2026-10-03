import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { join } from 'node:path';
import { MAIN_URL } from '../playwright.config';
import { again } from './ledger-helpers';

test.use({ reducedMotion: 'reduce' });
async function capture(page: Page, name: string, info: TestInfo, fullPage = false) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.evaluate(() => document.fonts.ready);
  if (await page.locator('dialog[open] .panel-body').count())
    await page.locator('dialog[open] .panel-body').evaluate((element) => (element.scrollTop = 0));
  const shell = await new AxeBuilder({ page }).analyze();
  expect(shell.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );
  const scope = (await page.locator('dialog[open]').count()) ? 'dialog[open]' : 'main';
  expect((await new AxeBuilder({ page }).include(scope).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    fullPage,
    animations: 'disabled',
    path: process.env['BUDGET_INSTRUMENT_EVIDENCE']
      ? join(process.env['BUDGET_INSTRUMENT_EVIDENCE'], `${name}-${info.project.name}.png`)
      : info.outputPath(`${name}.png`),
  });
}

test('empty portfolio creates reachable metadata with validation, reload, creation undo and redo', async ({
  page,
  request,
}, info) => {
  const tag = `${info.project.name}${again(info)}`;
  const name = `Metadateninstrument ${tag}`;
  const attempt = info.retry + info.repeatEachIndex;
  const isin = `XX${String(attempt * 2 + (info.project.name === 'desktop' ? 1 : 2)).padStart(10, '0')}`;
  const duplicate = await request.post(`${MAIN_URL}/api/securities`, {
    headers: { origin: MAIN_URL },
    data: { name: `ISIN Vorlage ${tag}`, kind: 'other', isin },
  });
  expect(duplicate.ok()).toBe(true);
  await page.route('**/api/portfolio/positions', (route) =>
    route.fulfill({
      json: {
        asOf: '2026-10-01',
        costMethod: 'average',
        valueCents: 0,
        costCents: 0,
        gainCents: 0,
        chain: null,
        classes: [],
      },
    }),
  );
  await page.goto('/vermoegen/portfolio');
  await expect(page.getByText(/Keine Positionen zum/)).toBeVisible();
  await page.unroute('**/api/portfolio/positions');
  // Controlled synthetic empty state; concurrent cases own separate instruments on this server.
  // The actual securities API and all writes remain connected throughout.
  await expect(page.getByRole('button', { name: 'Instrument anlegen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Instrument anlegen', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Instrument anlegen', exact: true });
  await form.getByLabel('Name', { exact: true }).fill(name);
  await form.getByLabel('Art', { exact: true }).selectOption('fund');
  await form.getByLabel('Währung', { exact: true }).fill('usd');
  await form.getByLabel('ISIN', { exact: true }).fill('bad');
  await form.getByRole('button', { name: 'Instrument anlegen', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('ISIN mit zwölf Zeichen');
  await form.getByLabel('ISIN', { exact: true }).fill(isin);
  await form.getByRole('button', { name: 'Instrument anlegen', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Diese ISIN gehört bereits');
  await form.getByLabel('ISIN', { exact: true }).fill('');
  await form.getByLabel('Symbol', { exact: true }).fill(`SYN-${tag}`);
  await page.keyboard.press('Escape');
  await expect(form).toContainText('Ungespeicherte Angaben verwerfen?');
  await form.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await capture(page, `instrument-create-${theme}`, info);
  }
  await form.getByRole('button', { name: 'Instrument anlegen', exact: true }).click();
  const detail = page.getByRole('dialog', { name, exact: true });
  await expect(detail).toContainText('Dieses Instrument hat keinen aktuellen Bestand.');
  await expect(detail).toContainText('USD');
  await expect(detail.getByRole('heading', { name: 'Kurs', exact: true })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: 'Kurs speichern', exact: true })).toHaveCount(0);
  const id = new URL(page.url()).searchParams.get('produkt')!;
  const record = (await (await request.get(`${MAIN_URL}/api/securities/${id}`)).json()).security;
  expect(record).toMatchObject({
    name,
    kind: 'fund',
    currency: 'USD',
    isin: null,
    symbol: `SYN-${tag}`,
    assetClassId: null,
  });
  await detail.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page).not.toHaveURL(/produkt=/);
  await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`produkt=${id}`));
  await page.reload();
  await expect(page.getByRole('dialog', { name, exact: true })).toContainText('USD');
  // Capture after the action checks: screenshots must not consume the Undo toast lifetime.
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await capture(page, `instrument-unheld-${theme}`, info);
  }
  await page.keyboard.press('Escape');
  await expect(
    page.locator('.instrument-catalog').getByRole('button', { name, exact: true }),
  ).toBeVisible();
  await capture(page, 'instrument-catalog', info, true);
});

test('held instrument editing preserves shared value and quote while undo and redo restore metadata', async ({
  page,
  request,
}, info) => {
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`${MAIN_URL}/api${path}`, {
      headers: { origin: MAIN_URL },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const name = `Bestandsinstrument ${info.project.name}`;
  const account = (
    await post('/accounts', {
      name: `Metadatendepot ${info.project.name}`,
      type: 'brokerage',
      openingDate: '2026-01-01',
    })
  ).account;
  const cls = (await post('/asset-classes', { name: `Musterklasse ${info.project.name}` }))
    .assetClass;
  const security = (
    await post('/securities', {
      name,
      kind: 'stock',
      currency: 'EUR',
      pricesEnabled: false,
      terBp: 17,
      quoteAdjusted: true,
      fallbackQuoteId: 'SYN-UNCHANGED',
    })
  ).security;
  await post('/trades', {
    accountId: account.id,
    securityId: security.id,
    date: '2026-09-01',
    kind: 'buy',
    units: '2',
    amountCents: 6000,
  });
  const date = (await (await request.get(`${MAIN_URL}/api/portfolio/positions`)).json()).asOf;
  expect(
    (
      await request.put(`${MAIN_URL}/api/securities/${security.id}/prices/${date}`, {
        headers: { origin: MAIN_URL },
        data: { price: '50' },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('/vermoegen/portfolio');
  await page.getByRole('button', { name, exact: true }).click();
  const readonly = page.getByRole('dialog', { name, exact: true });
  let finishQuote!: () => void;
  const quotePending = new Promise<void>((resolve) => {
    finishQuote = resolve;
  });
  await page.route(`**/api/securities/${security.id}/prices/*`, async (route) => {
    await quotePending;
    await route.continue();
  });
  await readonly.getByLabel('Kurs (EUR)', { exact: true }).fill('60');
  await readonly.getByRole('button', { name: 'Kurs speichern', exact: true }).click();
  await expect(
    readonly.getByRole('button', { name: 'Stammdaten bearbeiten', exact: true }),
  ).toBeDisabled();
  await expect(readonly.getByLabel('Kurs (EUR)', { exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(readonly).toBeVisible();
  finishQuote();
  await expect(readonly.locator('.instrument-quote')).toContainText('60,00 €');
  await readonly.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(readonly.locator('.instrument-quote')).toContainText('50,00 €');
  await page.unroute(`**/api/securities/${security.id}/prices/*`);
  await readonly.getByLabel('Kurs (EUR)', { exact: true }).fill('60');
  await readonly.getByRole('button', { name: 'Stammdaten bearbeiten', exact: true }).click();
  await expect(readonly).toContainText('Ungespeicherten Kurs verwerfen?');
  await readonly.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await expect(readonly.getByLabel('Kurs (EUR)', { exact: true })).toHaveValue('60');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Stammdaten bearbeiten', exact: true })
    .click();
  await readonly.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Stammdaten bearbeiten', exact: true });
  await expect(form.getByRole('button', { name: 'Stammdaten speichern' })).toBeDisabled();
  const newName = `${name} neu`;
  await expect(form.getByLabel('TER (%)', { exact: true })).toHaveValue('0,17');
  await expect(form.getByLabel('Hebelfaktor', { exact: true })).toHaveValue('1');
  await form.getByLabel('Name', { exact: true }).fill(newName);
  await form.getByLabel('TER (%)', { exact: true }).fill('0,25');
  await form.getByLabel('Hebelfaktor', { exact: true }).fill('2');
  await form.getByLabel('Art', { exact: true }).selectOption('fund');
  await form.getByLabel('Anlageklasse', { exact: true }).selectOption(cls.id);
  await page.keyboard.press('Escape');
  await expect(form).toContainText('Ungespeicherte Angaben verwerfen?');
  await form.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await capture(page, `instrument-edit-${theme}`, info);
  }
  await form.getByRole('button', { name: 'Stammdaten speichern', exact: true }).click();
  const detail = page.getByRole('dialog', { name: newName, exact: true });
  await expect(detail.locator('.instrument-quote')).toContainText('50,00 €');
  await expect(detail.locator('.instrument-accounts')).toContainText('100,00 €');
  const record = (await (await request.get(`${MAIN_URL}/api/securities/${security.id}`)).json())
    .security;
  expect(record).toMatchObject({
    name: newName,
    kind: 'fund',
    assetClassId: cls.id,
    currency: 'EUR',
    terBp: 25,
    leverageFactor: 20,
    pricesEnabled: false,
    quoteAdjusted: true,
    fallbackQuoteId: 'SYN-UNCHANGED',
  });
  let view = await (await request.get(`${MAIN_URL}/api/portfolio/positions`)).json();
  expect(
    view.classes
      .find((group: { id: string }) => group.id === cls.id)
      .positions.find((p: { securityId: string }) => p.securityId === security.id),
  ).toMatchObject({
    valueCents: 10000,
    costCents: 6000,
    quote: { priceMicro: 50000000, source: 'manual', currency: 'EUR' },
  });
  await detail.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByRole('dialog', { name, exact: true })).toContainText(
    'Rückgängig gemacht.',
  );
  expect(
    (await (await request.get(`${MAIN_URL}/api/securities/${security.id}`)).json()).security,
  ).toMatchObject({ terBp: 17, leverageFactor: 10 });
  await page.getByRole('dialog').getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: newName, exact: true })).toContainText(
    'Wiederholt.',
  );
  expect(
    (await (await request.get(`${MAIN_URL}/api/securities/${security.id}`)).json()).security,
  ).toMatchObject({ terBp: 25, leverageFactor: 20 });
  await page.getByRole('dialog').getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
  view = await (await request.get(`${MAIN_URL}/api/portfolio/positions`)).json();
  expect(
    view.classes
      .flatMap((group: { positions: unknown[] }) => group.positions)
      .find((p: { securityId: string }) => p.securityId === security.id),
  ).toMatchObject({
    valueCents: 10000,
    costCents: 6000,
    accounts: [{ accountId: account.id, unitsE8: 200000000 }],
  });
  await page.reload();
  await expect(
    page.getByRole('dialog', { name, exact: true }).locator('.instrument-quote'),
  ).toContainText('50,00 €');
});

test('asset-class failure keeps draft and retry restores create access', async ({ page }, info) => {
  await page.route('**/api/asset-classes', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  await page.goto('/vermoegen/portfolio?produkt=neu');
  const form = page.getByRole('dialog', { name: 'Instrument anlegen', exact: true });
  await form.getByLabel('Name', { exact: true }).fill(`Entwurf ${info.project.name}`);
  await expect(
    form.getByRole('button', { name: 'Instrument anlegen', exact: true }),
  ).toBeDisabled();
  await expect(form.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible();
  await page.unroute('**/api/asset-classes');
  await form.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(form.getByRole('button', { name: 'Instrument anlegen', exact: true })).toBeEnabled();
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue(
    `Entwurf ${info.project.name}`,
  );
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/securities', async (route) => {
    if (route.request().method() === 'POST') await pending;
    await route.continue();
  });
  await form.getByRole('button', { name: 'Instrument anlegen', exact: true }).click();
  await expect(form.getByLabel('Name', { exact: true })).toBeDisabled();
  await expect(form.getByLabel('Art', { exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(form).toBeVisible();
  await expect(form.getByText('Ungespeicherte Angaben verwerfen?')).toHaveCount(0);
  release();
  const detail = page.getByRole('dialog', { name: `Entwurf ${info.project.name}`, exact: true });
  await expect(detail).toBeVisible();
  let finishPositions!: () => void;
  const positionsPending = new Promise<void>((resolve) => {
    finishPositions = resolve;
  });
  await page.route('**/api/portfolio/positions', async (route) => {
    await positionsPending;
    await route.fulfill({ status: 503, json: { error: 'unavailable' } });
  });
  await page.reload();
  await expect(detail).toContainText('Bestände werden geladen');
  await expect(detail.getByText('Dieses Instrument hat keinen aktuellen Bestand.')).toHaveCount(0);
  finishPositions();
  await expect(detail).toContainText('Bestände konnten nicht geladen werden.');
  await expect(detail.getByText('Dieses Instrument hat keinen aktuellen Bestand.')).toHaveCount(0);
  await page.unroute('**/api/portfolio/positions');
  await detail.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(detail).toContainText('Dieses Instrument hat keinen aktuellen Bestand.');
});
