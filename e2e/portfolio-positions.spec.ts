import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
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
    await expect(page.getByRole('button', { name: 'ETF Welt', exact: true })).toBeVisible();
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
    const trigger = page.getByRole('button', { name: 'ETF Welt', exact: true });
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
      await expect(page.getByRole('button', { name: 'ETF Welt', exact: true })).toBeVisible();
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
      const p = original.classes[0]!.positions[0]!;
      p.costCents = null;
      p.gainCents = null;
      p.gainBp = null;
      p.accounts[0]!.costCents = null;
      p.accounts[0]!.basisStatus = 'missing_fx';
      original.costCents = null;
      original.chain = null;
      await route.fulfill({ json: original });
    });
    await page.reload();
    await expect(page.locator('.portfolio-view .vnw')).toContainText(
      'Wechselkurs für Einstand fehlt',
    );
    await page.getByRole('button', { name: 'ETF Welt', exact: true }).click();
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
