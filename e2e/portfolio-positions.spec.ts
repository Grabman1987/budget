import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { join } from 'node:path';
import { sampleTest } from './sample';
import type { PortfolioPositionsView } from '@budget/db';
import { MAIN_URL } from '../playwright.config';

async function accessibility(page: Page, scope: string) {
  const shell = await new AxeBuilder({ page }).analyze();
  expect(shell.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );
  expect((await new AxeBuilder({ page }).include(scope).analyze()).violations).toEqual([]);
}

async function screenshot(page: Page, file: string, info: TestInfo) {
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: process.env['BUDGET_PORTFOLIO_EVIDENCE']
      ? join(process.env['BUDGET_PORTFOLIO_EVIDENCE'], file)
      : info.outputPath(file),
  });
}

async function settle(page: Page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => window.scrollY === 0);
}

async function postApi(request: APIRequestContext, path: string, data: unknown) {
  const response = await request.post(`${MAIN_URL}/api${path}`, {
    headers: { origin: MAIN_URL },
    data,
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

async function createPositionInstrument(request: APIRequestContext, name: string) {
  const account = (
    await postApi(request, '/accounts', {
      name: `Depot ${name}`,
      type: 'brokerage',
      openingDate: '2026-01-01',
    })
  ).account as { id: string };
  const security = (await postApi(request, '/securities', { name, kind: 'stock', currency: 'EUR' }))
    .security as { id: string };
  await postApi(request, '/trades', {
    accountId: account.id,
    securityId: security.id,
    date: '2026-09-01',
    kind: 'buy',
    units: '2',
    amountCents: 6000,
  });
  const asOf = (
    (await (
      await request.get(`${MAIN_URL}/api/portfolio/positions`)
    ).json()) as PortfolioPositionsView
  ).asOf;
  const price = await request.put(`${MAIN_URL}/api/securities/${security.id}/prices/${asOf}`, {
    headers: { origin: MAIN_URL },
    data: { price: '50' },
  });
  expect(price.ok()).toBe(true);
  return security;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function browserBack(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.addEventListener('popstate', () => resolve(), { once: true });
        window.history.back();
      }),
  );
}

sampleTest(
  'portfolio positions follow the original prototype and open reload-safe instrument details',
  async ({ page, request }, info) => {
    await page.goto('/vermoegen/portfolio?zeitraum=3J');
    await expect(page.getByTestId('portfolio-value')).toHaveText('88.000,00 €');
    const view = (await (
      await request.get('/api/portfolio/positions')
    ).json()) as PortfolioPositionsView;
    expect(view.valueCents).toBe(8_800_000);
    expect(view.costCents).toBe(6_435_646);
    const summary = (await (await request.get('/api/portfolio?period=3J')).json()) as {
      portfolio: { valueCents: number; costCents: number };
    };
    expect(view.valueCents).toBe(summary.portfolio.valueCents);
    expect(view.costCents).toBe(summary.portfolio.costCents);
    await expect(
      page
        .getByRole('region', { name: 'Positionen', exact: true })
        .getByRole('button', { name: 'ETF Welt', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Aktien Welt', exact: true })).toHaveCount(0);
    await expect(page.locator('.portfolio-table .kgroup').first()).toContainText('Aktien Welt');
    const small = info.project.name === 'mobile';
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.portfolio-view > .vnw')).toBeVisible();
    const lead = await page.locator('.portfolio-view > .vnw').boundingBox();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await accessibility(page, '.portfolio-view');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await settle(page);
      await screenshot(page, `portfolio-${theme}-${info.project.name}.png`, info);
      if (process.env['BUDGET_PORTFOLIO_EVIDENCE'])
        await page.locator('.portfolio-positions').screenshot({
          path: join(
            process.env['BUDGET_PORTFOLIO_EVIDENCE'],
            `positions-${theme}-${info.project.name}.png`,
          ),
        });
    }
    const trigger = page
      .getByRole('region', { name: 'Positionen', exact: true })
      .getByRole('button', { name: 'ETF Welt', exact: true });
    await trigger.focus();
    await trigger.press('Enter');
    await expect(page).toHaveURL(/produkt=sec-etfw/);
    const panel = page.getByRole('dialog', { name: 'ETF Welt', exact: true });
    await expect(panel).toContainText('Broker C');
    await expect(panel).toContainText('Bestand je Konto');
    await expect(panel.getByLabel('Kursdatum')).toHaveValue('2026-09-17');
    await screenshot(page, `portfolio-keyboard-detail-${info.project.name}.png`, info);
    await page.keyboard.press('Tab');
    expect(await panel.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    if (small) await trigger.tap();
    else await trigger.click();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await accessibility(page, 'dialog[open]');
      await settle(page);
      await screenshot(page, `portfolio-detail-${theme}-${info.project.name}.png`, info);
    }
    await panel
      .getByRole('button', { name: 'Kurs speichern', exact: true })
      .scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await screenshot(page, `portfolio-detail-form-${info.project.name}.png`, info);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    if (small) await trigger.tap();
    else await trigger.click();
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'ETF Welt', exact: true })).toContainText(
      'Bestand je Konto',
    );
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page).not.toHaveURL(/produkt=/);
    if (small)
      await expect(
        page
          .getByRole('region', { name: 'Positionen', exact: true })
          .getByRole('button', { name: 'ETF Welt', exact: true }),
      ).toBeVisible();
    if (process.env['BUDGET_PORTFOLIO_PROTOTYPE']) {
      await page.goto(process.env['BUDGET_PORTFOLIO_PROTOTYPE']);
      await expect(page.locator('.tbd-fig')).toHaveText('88.000,00 €');
      await expect(page.locator('.vpos')).toContainText('ETF Welt');
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('#view > .vnw')).toBeVisible();
      expect((await page.locator('#view > .vnw').boundingBox())!.width).toBeCloseTo(lead!.width, 0);
      await settle(page);
      await screenshot(page, `prototype-portfolio-${info.project.name}.png`, info);
      if (process.env['BUDGET_PORTFOLIO_EVIDENCE'])
        await page.locator('.vpos').screenshot({
          path: join(
            process.env['BUDGET_PORTFOLIO_EVIDENCE'],
            `prototype-positions-${info.project.name}.png`,
          ),
        });
    }
  },
);

sampleTest(
  'explicit empty, unavailable and request failure states preserve unknowns',
  async ({ page }) => {
    await page.route('**/api/portfolio/positions', (route) =>
      route.fulfill({ status: 503, json: { error: 'unavailable' } }),
    );
    await page.goto('/vermoegen/portfolio');
    await expect(page.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible();
    await page.unroute('**/api/portfolio/positions');
    await page.getByRole('button', { name: 'Erneut versuchen' }).click();
    await expect(page.getByTestId('portfolio-value')).toHaveText('88.000,00 €');
    await page.route('**/api/portfolio/positions', async (route) => {
      const original = (await (await route.fetch()).json()) as PortfolioPositionsView;
      const p = original.classes[0]!.positions[0]!;
      p.quote = null;
      p.valueCents = null;
      p.shareBp = null;
      p.gainCents = null;
      p.gainBp = null;
      p.accounts[0]!.valueStatus = 'missing_price';
      p.accounts[0]!.valueCents = null;
      original.valueCents = null;
      original.chain = null;
      await route.fulfill({ json: original });
    });
    await page.reload();
    await expect(page.getByTestId('portfolio-value')).toHaveText('Bewertung unvollständig');
    await expect(page.locator('.portfolio-table')).toContainText('Kurs fehlt');
    await page.unroute('**/api/portfolio/positions');
    await page.route('**/api/portfolio/positions', async (route) => {
      const original = (await (await route.fetch()).json()) as PortfolioPositionsView;
      // The class row and the whole-instrument row (used by the product panel) both lose the basis.
      const id = original.classes[0]!.positions[0]!.securityId;
      for (const p of [
        original.classes[0]!.positions[0]!,
        ...(original.positions ?? []).filter((x) => x.securityId === id),
      ]) {
        p.costCents = null;
        p.gainCents = null;
        p.gainBp = null;
        p.accounts[0]!.costCents = null;
        p.accounts[0]!.basisStatus = 'missing_fx';
      }
      original.costCents = null;
      original.chain = null;
      await route.fulfill({ json: original });
    });
    await page.reload();
    await expect(page.locator('.portfolio-view .vnw')).toContainText(
      'Wechselkurs für Einstand fehlt',
    );
    await page
      .getByRole('region', { name: 'Positionen', exact: true })
      .getByRole('button', { name: 'ETF Welt', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: 'ETF Welt', exact: true })).toContainText(
      'Wechselkurs für Einstand fehlt',
    );
    await page.keyboard.press('Escape');
    await page.unroute('**/api/portfolio/positions');
    await page.route('**/api/portfolio/positions', (route) =>
      route.fulfill({
        json: {
          asOf: '2026-09-17',
          costMethod: 'average',
          valueCents: 0,
          costCents: 0,
          gainCents: 0,
          classes: [],
          chain: null,
        },
      }),
    );
    await page.reload();
    await expect(page.getByText('Keine Positionen zum 17.09.2026 vorhanden.')).toBeVisible();
  },
);

test('manual quote validation, save, dirty close and undo update the position and shared valuation', async ({
  page,
  request,
}, info) => {
  const name = `Musterinstrument ${info.project.name}`;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`${MAIN_URL}/api${path}`, {
      headers: { origin: MAIN_URL },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const account = (
    await post('/accounts', {
      name: `Depot ${info.project.name}`,
      type: 'brokerage',
      openingDate: '2026-01-01',
    })
  ).account;
  const security = (await post('/securities', { name, kind: 'stock', currency: 'EUR' })).security;
  const asOf = (
    (await (
      await request.get(`${MAIN_URL}/api/portfolio/positions`)
    ).json()) as PortfolioPositionsView
  ).asOf;
  await post('/trades', {
    accountId: account.id,
    securityId: security.id,
    date: '2026-09-01',
    kind: 'buy',
    units: '2',
    amountCents: 6000,
  });
  const first = await request.put(`${MAIN_URL}/api/securities/${security.id}/prices/${asOf}`, {
    headers: { origin: MAIN_URL },
    data: { price: '50' },
  });
  expect(first.ok()).toBe(true);
  await page.goto('/vermoegen/portfolio');
  await page.getByRole('button', { name, exact: true }).click();
  const panel = page.getByRole('dialog', { name, exact: true });
  await panel.getByLabel('Kurs (EUR)', { exact: true }).fill('0');
  await panel.getByRole('button', { name: 'Kurs speichern', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Positiven Kurs');
  await panel.getByLabel('Kurs (EUR)', { exact: true }).fill('60,25');
  await page.keyboard.press('Escape');
  await expect(panel).toContainText('Ungespeicherten Kurs verwerfen?');
  await panel.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await panel.getByRole('button', { name: 'Kurs speichern', exact: true }).click();
  await expect(panel.locator('.instrument-quote')).toContainText('60,25 €');
  await expect(panel.locator('.instrument-accounts')).toContainText('120,50 €');
  await panel.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(panel.locator('.instrument-quote')).toContainText('50,00 €');
  await expect(panel.locator('.instrument-accounts')).toContainText('100,00 €');
  await expect(panel).toContainText('Rückgängig gemacht.');
  await panel.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect(panel.locator('.instrument-quote')).toContainText('60,25 €');
  await expect(panel.locator('.instrument-accounts')).toContainText('120,50 €');
  await expect(panel).toContainText('Wiederholt.');
  const redone = await request.get(`${MAIN_URL}/api/accounts`);
  expect(
    (await redone.json()).accounts.find((a: { id: string }) => a.id === account.id).holdingsCents,
  ).toBe(12050);
  await panel.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(panel.locator('.instrument-quote')).toContainText('50,00 €');
  await expect(panel.locator('.instrument-accounts')).toContainText('100,00 €');
  await expect(panel).toContainText('Rückgängig gemacht.');
  const row = (
    (await (await request.get(`${MAIN_URL}/api/accounts`)).json()) as {
      accounts: { id: string; holdingsCents: number }[];
    }
  ).accounts.find((a) => a.id === account.id);
  expect(row?.holdingsCents).toBe(10000);
});

test('instrument Back navigation asks once and honors keep or discard for quote and metadata', async ({
  page,
  request,
}, info) => {
  const name = `Navigationsschutz ${info.project.name}`;
  const security = await createPositionInstrument(request, name);
  await page.goto('/vermoegen/portfolio');
  const row = page.getByRole('button', { name, exact: true });
  await row.click();
  const panel = page.getByRole('dialog', { name, exact: true });

  await panel.getByLabel('Kurs (EUR)', { exact: true }).fill('55');
  await page.evaluate(() => window.history.back());
  await expect(panel.getByRole('alert')).toContainText('Ungespeicherten Kurs verwerfen?');
  await expect(panel.getByLabel('Kurs (EUR)', { exact: true })).toHaveValue('55');
  await panel.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`produkt=${security.id}`));
  await page.evaluate(() => window.history.back());
  await expect(panel.getByRole('alert')).toContainText('Ungespeicherten Kurs verwerfen?');
  await panel.getByRole('button', { name: 'Verwerfen' }).click();
  await expect(page).not.toHaveURL(/produkt=/);
  await expect(panel).toHaveCount(0);

  await row.click();
  const reopened = page.getByRole('dialog', { name, exact: true });
  await reopened.getByRole('button', { name: 'Stammdaten bearbeiten' }).click();
  const editPanel = page.getByRole('dialog', { name: 'Stammdaten bearbeiten', exact: true });
  await editPanel.getByLabel('Name', { exact: true }).fill(`${name} geändert`);
  await page.evaluate(() => window.history.back());
  await expect(editPanel.getByRole('alert')).toContainText('Ungespeicherte Angaben verwerfen?');
  await expect(editPanel.getByLabel('Name', { exact: true })).toHaveValue(`${name} geändert`);
  await editPanel.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await expect(page).toHaveURL(new RegExp(`produkt=${security.id}`));
  await expect(editPanel.getByLabel('Name', { exact: true })).toHaveValue(`${name} geändert`);

  await editPanel.getByRole('button', { name: 'Schließen' }).click();
  await expect(editPanel.getByRole('alert')).toContainText('Ungespeicherte Angaben verwerfen?');
  await editPanel.getByRole('button', { name: 'Verwerfen' }).click();
  await expect(page).not.toHaveURL(/produkt=/);
  await expect(page.locator('.instrument-discard')).toHaveCount(0);
});

test('pending create and quote requests reject Back until the save finishes', async ({
  page,
  request,
}, info) => {
  const name = `Speichern mit Zurück ${info.project.name}`;
  const createGate = deferred();
  const createStarted = deferred();
  await page.route('**/api/securities', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    createStarted.resolve();
    await createGate.promise;
    await route.continue();
  });
  await page.goto('/vermoegen/portfolio');
  await page.getByRole('button', { name: 'Instrument anlegen', exact: true }).click();
  const createPanel = page.getByRole('dialog', { name: 'Instrument anlegen', exact: true });
  await createPanel.getByLabel('Name', { exact: true }).fill(name);
  const createdResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/api/securities'),
  );
  await createPanel.getByRole('button', { name: 'Instrument anlegen', exact: true }).click();
  await createStarted.promise;
  await expect(createPanel.getByRole('button', { name: 'Wird gespeichert …' })).toBeDisabled();
  await browserBack(page);
  await expect(page).toHaveURL(/produkt=neu/);
  await expect(createPanel.getByRole('button', { name: 'Wird gespeichert …' })).toBeDisabled();
  await expect(page.locator('.instrument-discard')).toHaveCount(0);
  createGate.resolve();
  const created = await createdResponse;
  const createdId = ((await created.json()) as { security: { id: string } }).security.id;
  await expect(page).toHaveURL(new RegExp(`produkt=${createdId}`));
  await expect(page.getByRole('dialog', { name })).toBeVisible();

  const security = await createPositionInstrument(request, `${name} Kurs`);
  const quoteGate = deferred();
  const quoteStarted = deferred();
  const quoteUrl = `**/api/securities/${security.id}/prices/**`;
  await page.route(quoteUrl, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    quoteStarted.resolve();
    await quoteGate.promise;
    await route.continue();
  });
  await page.goto('/vermoegen/portfolio');
  await page.getByRole('button', { name: `${name} Kurs`, exact: true }).click();
  const quotePanel = page.getByRole('dialog', { name: `${name} Kurs`, exact: true });
  await quotePanel.getByLabel('Kurs (EUR)', { exact: true }).fill('60');
  await quotePanel.getByRole('button', { name: 'Kurs speichern', exact: true }).click();
  await quoteStarted.promise;
  await expect(quotePanel.getByRole('button', { name: 'Kurs wird gespeichert …' })).toBeDisabled();
  await browserBack(page);
  await expect(page).toHaveURL(new RegExp(`produkt=${security.id}`));
  await expect(quotePanel.getByRole('button', { name: 'Kurs wird gespeichert …' })).toBeDisabled();
  await expect(page.locator('.instrument-discard')).toHaveCount(0);
  quoteGate.resolve();
  await expect(quotePanel.locator('.instrument-quote')).toContainText('60,00 €');
  await expect(
    quotePanel.getByRole('button', { name: 'Kurs speichern', exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => window.history.back());
  await expect(page).not.toHaveURL(/produkt=/);
  await expect(page.locator('.instrument-discard')).toHaveCount(0);
});
