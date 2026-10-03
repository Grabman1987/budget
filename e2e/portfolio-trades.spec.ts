import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { join } from 'node:path';
import { DB_MAIN, MAIN_URL } from '../playwright.config';
import { holding, openDatabase, type PortfolioPositionsView } from '@budget/db';

test.use({ locale: 'de-AT' });

test('remaining kinds, source edits and deletion use the same holdings and cash', async ({
  page,
  request,
}, info) => {
  const { name, account, security } = await fixture(request, info, 'Weitere Arten');
  await post(request, '/trades', {
    securityId: security.id,
    accountId: account.id,
    date: '2026-01-02',
    kind: 'buy',
    unitsE8: 1000000000,
    amountCents: 10000,
  });
  const cases = [
    { kind: 'delivery_in', units: '2', amount: '20' },
    { kind: 'split', units: '12' },
    { kind: 'delivery_out', units: '4', amount: '30' },
    { kind: 'dividend', amount: '10', fee: '1', tax: '2' },
    { kind: 'interest', amount: '5', fee: '0,50', tax: '0,50' },
    { kind: 'fee', amount: '1' },
    { kind: 'tax', amount: '2' },
  ];
  for (const data of cases) {
    await page.goto(`/vermoegen/portfolio?produkt=${security.id}&handel=neu`);
    const form = page.getByRole('dialog', { name: 'Handel erfassen', exact: true });
    await form.getByLabel('Anlagekonto', { exact: true }).selectOption(account.id);
    await form.getByLabel('Handelsart', { exact: true }).selectOption(data.kind);
    await form
      .getByLabel('Handelsdatum')
      .fill(
        data.kind === 'delivery_out'
          ? '2026-01-05'
          : data.kind === 'split'
            ? '2026-01-04'
            : '2026-01-03',
      );
    if (data.units)
      await form
        .getByLabel(data.kind === 'split' ? 'Stückänderung' : 'Stück', { exact: true })
        .fill(data.units);
    if (data.amount)
      await form
        .getByLabel(
          data.kind.startsWith('delivery')
            ? 'Dokumentierter Einstand / Lieferwert (EUR)'
            : 'Bruttobetrag (EUR)',
          { exact: true },
        )
        .fill(data.amount);
    if (data.fee) await form.getByLabel('Gebühren (EUR)', { exact: true }).fill(data.fee);
    if (data.tax)
      await form.getByLabel('Einbehaltene Steuer (EUR)', { exact: true }).fill(data.tax);
    if (data.kind === 'split' || data.kind === 'dividend')
      await capture(page, info, `trade-${data.kind}`);
    await form.getByRole('button', { name: 'Handel erfassen', exact: true }).click();
    await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
  }
  expect(await balance(request, account.id)).toBe(190800);
  expect(await position(request, security.id)).toMatchObject({
    unitsE8: 2000000000,
    costCents: 10000,
  });
  const dividend = (await sourceTrades(request, security.id)).find(
    (t: { kind: string }) => t.kind === 'dividend',
  );
  await page
    .locator(`[data-trade-id="${dividend.id}"]`)
    .getByRole('button', { name: /bearbeiten/ })
    .click();
  const form = page.getByRole('dialog', { name: 'Handel bearbeiten', exact: true });
  await form.getByLabel('Einbehaltene Steuer (EUR)', { exact: true }).fill('3');
  await form.getByRole('button', { name: 'Handel speichern', exact: true }).click();
  await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
  expect(await balance(request, account.id)).toBe(190700);
  await page
    .locator(`[data-trade-id="${dividend.id}"]`)
    .getByRole('button', { name: /bearbeiten/ })
    .click();
  await form.getByRole('button', { name: 'Handel löschen', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Kontobuchung');
  await capture(page, info, 'trade-delete');
  await form.getByRole('button', { name: 'Löschen bestätigen', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
  await expect(page.locator(`[data-trade-id="${dividend.id}"]`)).toHaveCount(0);
  await expect.poll(() => balance(request, account.id)).toBe(190100);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.locator(`[data-trade-id="${dividend.id}"]`)).toBeVisible();
  expect(await balance(request, account.id)).toBe(190700);
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect(page.locator(`[data-trade-id="${dividend.id}"]`)).toHaveCount(0);
  expect(await balance(request, account.id)).toBe(190100);
});

test('monthly savings proposals require actual execution confirmation and support undo/redo', async ({
  page,
  request,
}, info) => {
  const { name, account, security } = await fixture(request, info, 'Monatsvorschlag');
  const { asOf } = await (await request.get(`${MAIN_URL}/api/accounts`)).json();
  const month = asOf.slice(0, 7);
  const plan = (
    await post(request, '/savings-plans', {
      securityId: security.id,
      accountId: account.id,
      amountCents: 10000,
      dayOfMonth: 1,
      validFrom: `${month}-01`,
    })
  ).plan;
  expect(await sourceTrades(request, security.id)).toHaveLength(0);
  expect(await balance(request, account.id)).toBe(200000);
  await page.goto('/');
  const step = page.locator('.heute-next-steps .rev-row').filter({ hasText: `Sparplan: ${name}` });
  await expect(step).toContainText('100,00');
  await step.getByRole('button', { name: 'Ausführung prüfen' }).click();
  const row = page.getByTestId('inbox-row').filter({ hasText: name });
  await row.getByRole('button', { name: 'Ausführung prüfen' }).focus();
  await page.keyboard.press('Enter');
  const form = page.getByRole('dialog', { name: 'Sparplanausführung bestätigen', exact: true });
  await expect(form).toContainText('Kein Bankauftrag');
  await expect(form.getByLabel('Anlagekonto', { exact: true })).toBeDisabled();
  await form.getByLabel('Stück', { exact: true }).fill('1,00000001');
  await form.getByLabel('Bruttobetrag (EUR)', { exact: true }).fill('99');
  await form.getByLabel('Gebühren (EUR)', { exact: true }).fill('1');
  await page.evaluate(() => history.back());
  await expect(form).toContainText('Ungespeicherte Handelsangaben verwerfen?');
  await form.getByRole('button', { name: 'Weiter bearbeiten', exact: true }).click();
  await capture(page, info, 'savings-execution');
  await form.getByRole('button', { name: 'Ausführung bestätigen', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(row).toHaveCount(0);
  expect(await balance(request, account.id)).toBe(190000);
  expect(await sourceTrades(request, security.id)).toMatchObject([
    {
      savingsPlanId: plan.id,
      savingsMonth: month,
      unitsE8: 100000001,
      amountCents: 9900,
      feeCents: 100,
    },
  ]);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(row).toBeVisible();
  expect(await balance(request, account.id)).toBe(200000);
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect(row).toHaveCount(0);
  expect(await balance(request, account.id)).toBe(190000);
});

const post = async (request: APIRequestContext, path: string, data: unknown) => {
  const response = await request.post(`${MAIN_URL}/api${path}`, {
    headers: { origin: MAIN_URL },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
};
async function fixture(request: APIRequestContext, info: TestInfo, label: string, quote = true) {
  const name = `Handelsinstrument ${label} ${info.project.name}`;
  const account = (
    await post(request, '/accounts', {
      name: `Handelsdepot ${label} ${info.project.name}`,
      type: 'brokerage',
      currency: 'EUR',
      openingDate: '2026-01-01',
      openingBalanceCents: 200000,
    })
  ).account;
  const security = (await post(request, '/securities', { name, kind: 'stock', currency: 'EUR' }))
    .security;
  if (quote)
    expect(
      (
        await request.put(`${MAIN_URL}/api/securities/${security.id}/prices/2026-01-01`, {
          headers: { origin: MAIN_URL },
          data: { price: '120' },
        })
      ).ok(),
    ).toBe(true);
  return { name, account, security };
}
async function position(request: APIRequestContext, id: string) {
  const view = (await (
    await request.get(`${MAIN_URL}/api/portfolio/positions`)
  ).json()) as PortfolioPositionsView;
  return view.classes.flatMap((group) => group.positions).find((p) => p.securityId === id);
}
async function balance(request: APIRequestContext, id: string) {
  return (await (await request.get(`${MAIN_URL}/api/accounts`)).json()).accounts.find(
    (a: { id: string }) => a.id === id,
  ).balanceCents;
}
async function sourceTrades(request: APIRequestContext, id: string) {
  return (await (await request.get(`${MAIN_URL}/api/trades?security=${id}`)).json()).trades;
}
async function capture(page: Page, info: TestInfo, name: string) {
  const undoToast = page.locator('.toast.is-open button');
  if (await undoToast.count()) {
    await undoToast.focus();
    await undoToast.press('Escape');
  }
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('dialog[open] .panel-body').evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual([]);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    await page.screenshot({
      animations: 'disabled',
      path: process.env['BUDGET_TRADE_EVIDENCE']
        ? join(process.env['BUDGET_TRADE_EVIDENCE'], `${name}-${theme}-${info.project.name}.png`)
        : info.outputPath(`${name}-${theme}.png`),
    });
    await page.locator('dialog[open] .panel-body').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.screenshot({
      animations: 'disabled',
      path: process.env['BUDGET_TRADE_EVIDENCE']
        ? join(
            process.env['BUDGET_TRADE_EVIDENCE'],
            `${name}-lower-${theme}-${info.project.name}.png`,
          )
        : info.outputPath(`${name}-lower-${theme}.png`),
    });
    await page.locator('dialog[open] .panel-body').evaluate((el) => {
      el.scrollTop = 0;
    });
  }
}
async function fill(
  page: Page,
  data: { kind?: string; units: string; amount: string; fee: string; tax?: string },
) {
  const form = page.getByRole('dialog');
  if (data.kind) await form.getByLabel('Handelsart', { exact: true }).selectOption(data.kind);
  await form.getByLabel('Stück', { exact: true }).fill(data.units);
  await form.getByLabel('Bruttobetrag (EUR)', { exact: true }).fill(data.amount);
  await form.getByLabel('Gebühren (EUR)', { exact: true }).fill(data.fee);
  if (data.tax) await form.getByLabel('Einbehaltene Steuer (EUR)', { exact: true }).fill(data.tax);
}

test('manual buy, partial sell, source edit and group undo refresh holdings and cash', async ({
  page,
  request,
}, info) => {
  const { name, account, security } = await fixture(request, info, 'A');
  await page.goto('/vermoegen/portfolio?zeitraum=3J');
  await page
    .locator('.instrument-actions')
    .getByRole('button', { name: 'Handel erfassen', exact: true })
    .click();
  let form = page.getByRole('dialog', { name: 'Handel erfassen', exact: true });
  await expect(page).toHaveURL(/handel=neu/);
  await form.getByLabel('Instrument', { exact: true }).selectOption(security.id);
  await form.getByLabel('Anlagekonto', { exact: true }).selectOption(account.id);
  await form.getByLabel('Handelsdatum').fill('2026-01-02');
  await fill(page, { units: '10', amount: '1.000', fee: '10' });
  await expect(form.locator('p[role=status]')).toContainText('−1.010,00');
  await page.keyboard.press('Escape');
  await expect(form).toContainText('Ungespeicherte Handelsangaben verwerfen?');
  await form.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await capture(page, info, 'trade-buy');
  await form.getByRole('button', { name: 'Handel erfassen', exact: true }).click();
  let detail = page.getByRole('dialog', { name, exact: true });
  await expect(detail.locator('.instrument-accounts')).toContainText('1.200,00');
  await expect(detail.locator('.trade-list')).toContainText('1.000,00');
  expect(await balance(request, account.id)).toBe(99000);
  expect(await position(request, security.id)).toMatchObject({
    unitsE8: 1000000000,
    costCents: 101000,
    valueCents: 120000,
    gainCents: 19000,
  });
  await detail.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(detail).toContainText('Dieses Instrument hat keinen aktuellen Bestand.');
  expect(await balance(request, account.id)).toBe(200000);
  expect(await sourceTrades(request, security.id)).toHaveLength(0);
  await detail.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect(detail.locator('.instrument-accounts')).toContainText('1.200,00');
  expect(await balance(request, account.id)).toBe(99000);
  // Another broker owns the same security; A's source edits must not change B.
  const brokerB = (
    await post(request, '/accounts', {
      name: `Handelsdepot B ${info.project.name}`,
      type: 'brokerage',
      openingDate: '2026-01-01',
      openingBalanceCents: 200000,
    })
  ).account;
  await post(request, '/trades', {
    accountId: brokerB.id,
    securityId: security.id,
    date: '2026-01-02',
    kind: 'buy',
    units: '2',
    amountCents: 20000,
  });
  await detail.getByRole('button', { name: 'Handel erfassen', exact: true }).click();
  form = page.getByRole('dialog', { name: 'Handel erfassen', exact: true });
  await expect(form.getByLabel('Instrument', { exact: true })).toHaveValue(security.id);
  await form.getByLabel('Anlagekonto', { exact: true }).selectOption(account.id);
  await form.getByLabel('Handelsdatum').fill('2026-01-03');
  await fill(page, { kind: 'sell', units: '4', amount: '600', fee: '4', tax: '20' });
  await expect(form.locator('p[role=status]')).toContainText('576,00');
  await capture(page, info, 'trade-sell');
  await form.getByRole('button', { name: 'Handel erfassen', exact: true }).click();
  detail = page.getByRole('dialog', { name, exact: true });
  await expect(detail.locator('.trade-list')).toContainText('20,00');
  expect(await balance(request, account.id)).toBe(156600);
  let owned = (await position(request, security.id))!.accounts;
  expect(owned.find((a) => a.accountId === account.id)).toMatchObject({
    unitsE8: 600000000,
    costCents: 60600,
    valueCents: 72000,
    gainCents: 11400,
  });
  expect(owned.find((a) => a.accountId === brokerB.id)).toMatchObject({
    unitsE8: 200000000,
    costCents: 20000,
  });
  const sale = (await sourceTrades(request, security.id)).find(
    (t: { kind: string }) => t.kind === 'sell',
  );
  expect(sale).toMatchObject({
    accountId: account.id,
    unitsE8: -400000000,
    amountCents: 60000,
    feeCents: 400,
    taxCents: 2000,
  });
  await detail
    .locator(`[data-trade-id="${sale.id}"]`)
    .getByRole('button', { name: /bearbeiten/i })
    .click();
  form = page.getByRole('dialog', { name: 'Handel bearbeiten', exact: true });
  await expect(form.getByLabel('Anlagekonto', { exact: true })).toBeDisabled();
  await expect(form.getByLabel('Handelsart', { exact: true })).toBeDisabled();
  await expect(form.getByLabel('Einbehaltene Steuer (EUR)', { exact: true })).toHaveValue('20,00');
  await form.getByLabel('Gebühren (EUR)', { exact: true }).fill('6');
  await capture(page, info, 'trade-edit');
  await form.getByRole('button', { name: 'Handel speichern', exact: true }).click();
  detail = page.getByRole('dialog', { name, exact: true });
  await expect(detail.locator(`[data-trade-id="${sale.id}"]`)).toContainText('6,00');
  expect(await balance(request, account.id)).toBe(156400);
  expect(await balance(request, brokerB.id)).toBe(180000);
  await detail.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(detail.locator(`[data-trade-id="${sale.id}"]`)).toContainText('4,00');
  expect(await balance(request, account.id)).toBe(156600);
  await detail.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect(detail.locator(`[data-trade-id="${sale.id}"]`)).toContainText('6,00');
  expect(await balance(request, account.id)).toBe(156400);
  await page.reload();
  await expect(detail.locator(`[data-trade-id="${sale.id}"]`)).toContainText('6,00');
  owned = (await position(request, security.id))!.accounts;
  expect(owned.find((a) => a.accountId === account.id)).toMatchObject({
    unitsE8: 600000000,
    costCents: 60600,
  });
  await detail
    .locator('.instrument-accounts')
    .getByRole('link', { name: account.name, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/konten/${account.id}`));
  await expect(page.getByTestId('account-balance')).toHaveText('2.284,00 €');
});

test('validation, server retry, busy guard and explicit discard retain source draft', async ({
  page,
  request,
}, info) => {
  const { security, account } = await fixture(request, info, 'Fehler');
  expect(
    (
      await request.patch(`${MAIN_URL}/api/securities/${security.id}`, {
        headers: { origin: MAIN_URL },
        data: { currency: 'USD' },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`/vermoegen/portfolio?produkt=${security.id}`);
  const detail = page.getByRole('dialog');
  await detail.getByRole('button', { name: 'Handel erfassen', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Handel erfassen', exact: true });
  await form.getByLabel('Anlagekonto', { exact: true }).selectOption(account.id);
  await expect(
    form.getByLabel('Instrument', { exact: true }).locator('option:checked'),
  ).toContainText('USD');
  await expect(form.getByLabel('Bruttobetrag (EUR)', { exact: true })).toBeVisible();
  await fill(page, { kind: 'sell', units: '1,123456789', amount: '10', fee: '4', tax: '20' });
  await form.getByRole('button', { name: 'Handel erfassen', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText([
    'acht Nachkommastellen',
    'nicht überschreiten',
  ]);
  await form.getByLabel('Handelsart', { exact: true }).selectOption('buy');
  await expect(form.getByLabel('Einbehaltene Steuer (EUR)', { exact: true })).toHaveValue('20');
  await expect(form).toContainText('Steuer auf 0 setzen oder Verkauf wählen');
  await form.getByLabel('Einbehaltene Steuer (EUR)', { exact: true }).fill('0');
  await expect(form.getByLabel('Einbehaltene Steuer (EUR)', { exact: true })).toHaveCount(0);
  await form.getByLabel('Handelsart', { exact: true }).selectOption('sell');
  await fill(page, { units: '1,00000001', amount: '600', fee: '4', tax: '20' });
  await capture(page, info, 'trade-account-currency');
  await page.route('**/api/trades', async (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 503, json: { error: 'unavailable' } })
      : route.continue(),
  );
  await form.getByRole('button', { name: 'Handel erfassen', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Das hat nicht geklappt');
  await expect(form.getByLabel('Stück', { exact: true })).toHaveValue('1,00000001');
  expect(await sourceTrades(request, security.id)).toHaveLength(0);
  await page.unroute('**/api/trades');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/trades', async (route) => {
    if (route.request().method() === 'POST') await pending;
    await route.continue();
  });
  await form.getByRole('button', { name: 'Handel erfassen', exact: true }).click();
  await expect(form.getByLabel('Stück', { exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(form).toBeVisible();
  await expect(form.getByText('Ungespeicherte Handelsangaben verwerfen?')).toHaveCount(0);
  release();
  await expect(page.getByRole('dialog')).toContainText('Handel erfasst.');
  expect(await sourceTrades(request, security.id)).toHaveLength(1);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Handel erfassen', exact: true })
    .click();
  await form.getByLabel('Notiz').fill('Noch nicht speichern');
  await form.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(form).toContainText('Ungespeicherte Handelsangaben verwerfen?');
  await form.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(page).not.toHaveURL(/handel=/);
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Handelsverlauf' }),
  ).toBeVisible();
});

test('undocumented basis and full exit keep source history reachable without invented gain', async ({
  page,
  request,
}, info) => {
  const { name, account, security } = await fixture(request, info, 'Einstand', false);
  const opened = openDatabase(DB_MAIN);
  try {
    opened.db
      .insert(holding)
      .values({
        id: `unknown-${security.id}`,
        accountId: account.id,
        securityId: security.id,
        asOf: '2026-01-02',
        unitsE8: 1000000000,
        costBasisCents: null,
      })
      .run();
  } finally {
    opened.close();
  }
  await page.goto(`/vermoegen/portfolio?produkt=${security.id}`);
  let detail = page.getByRole('dialog', { name, exact: true });
  await expect(detail).toContainText('Einstand nicht vollständig dokumentiert');
  await expect(detail).toContainText('Noch kein Handel für dieses Instrument erfasst.');
  await detail.getByRole('button', { name: 'Handel erfassen', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Handel erfassen', exact: true });
  await form.getByLabel('Anlagekonto', { exact: true }).selectOption(account.id);
  await form.getByLabel('Handelsdatum').fill('2026-01-03');
  await fill(page, { kind: 'sell', units: '4', amount: '600', fee: '4', tax: '20' });
  await form.getByRole('button', { name: 'Handel erfassen', exact: true }).click();
  detail = page.getByRole('dialog', { name, exact: true });
  await expect(detail).toContainText('Einstand nicht vollständig dokumentiert');
  expect(await position(request, security.id)).toMatchObject({
    unitsE8: 600000000,
    costCents: null,
    gainCents: null,
  });
  expect(await balance(request, account.id)).toBe(257600);
  await detail.getByRole('button', { name: 'Handel erfassen', exact: true }).click();
  await form.getByLabel('Anlagekonto', { exact: true }).selectOption(account.id);
  await form.getByLabel('Handelsdatum').fill('2026-01-04');
  await fill(page, { kind: 'sell', units: '6', amount: '900', fee: '0', tax: '0' });
  await form.getByRole('button', { name: 'Handel erfassen', exact: true }).click();
  await expect(detail).toContainText('Dieses Instrument hat keinen aktuellen Bestand.');
  await expect(detail.locator('.trade-list')).toContainText('Verkauf');
  expect(await balance(request, account.id)).toBe(347600);
  await page.keyboard.press('Escape');
  await expect(
    page.locator('.instrument-catalog').getByRole('button', { name, exact: true }),
  ).toBeVisible();
  await page.locator('.instrument-catalog').getByRole('button', { name, exact: true }).click();
  await expect(
    detail
      .locator('.trade-list')
      .getByRole('button', { name: /Verkauf.*bearbeiten/ })
      .first(),
  ).toBeVisible();
});

test('browser Back keeps dirty source fields and rejects pending-save navigation', async ({
  page,
  request,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { name, account, security } = await fixture(request, info, 'Zurück');
  await page.goto(`/vermoegen/portfolio?produkt=${security.id}`);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Handel erfassen', exact: true })
    .click();
  const form = page.getByRole('dialog', { name: 'Handel erfassen', exact: true });
  await form.getByLabel('Anlagekonto', { exact: true }).selectOption(account.id);
  await fill(page, { units: '2', amount: '200', fee: '1' });
  await page.evaluate(() => history.back());
  await expect(form).toContainText('Ungespeicherte Handelsangaben verwerfen?');
  await form.getByRole('button', { name: 'Weiter bearbeiten', exact: true }).click();
  await expect(page).toHaveURL(/handel=neu/);
  await expect(form.getByLabel('Bruttobetrag (EUR)', { exact: true })).toHaveValue('200');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/trades', async (route) => {
    if (route.request().method() === 'POST') await pending;
    await route.continue();
  });
  await form.getByRole('button', { name: 'Handel erfassen', exact: true }).click();
  await expect(form.getByLabel('Stück', { exact: true })).toBeDisabled();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.addEventListener('popstate', () => resolve(), { once: true });
        history.back();
      }),
  );
  await expect(page).toHaveURL(/handel=neu/);
  await expect(form.getByLabel('Stück', { exact: true })).toBeDisabled();
  await expect(form.getByText('Ungespeicherte Handelsangaben verwerfen?')).toHaveCount(0);
  release();
  const detail = page.getByRole('dialog', { name, exact: true });
  await expect(detail.locator('.trade-list')).toContainText('Kauf');
  await expect(page).not.toHaveURL(/handel=/);
  expect(await sourceTrades(request, security.id)).toHaveLength(1);
  await detail.getByRole('button', { name: 'Handel erfassen', exact: true }).click();
  await form.getByLabel('Notiz').fill('Verwerfen per Zurück');
  await page.evaluate(() => history.back());
  await expect(form).toContainText('Ungespeicherte Handelsangaben verwerfen?');
  await form.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(page).not.toHaveURL(/handel=/);
  await expect(detail).toBeVisible();
  expect(await sourceTrades(request, security.id)).toHaveLength(1);
});
