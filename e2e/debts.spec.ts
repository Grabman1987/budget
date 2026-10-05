import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { sampleTest, SAMPLE_URL } from './sample';
import { MAIN_URL } from '../playwright.config';

const evidence = (info: TestInfo, name: string) =>
  process.env['BUDGET_DEBTS_EVIDENCE']
    ? join(
        process.env['BUDGET_DEBTS_EVIDENCE'],
        `${name.slice(0, name.length - extname(name).length)}-${info.project.name}${extname(name)}`,
      )
    : info.outputPath(name);
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
}
async function capture(page: Page, info: TestInfo, name: string) {
  await settle(page);
  const shell = await new AxeBuilder({ page }).analyze();
  expect(shell.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );
  expect((await new AxeBuilder({ page }).include('.debts-view').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: evidence(info, `${name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
}
async function assumptions(page: Page) {
  await page.getByLabel('Monatsrate (EUR)', { exact: true }).fill('412');
  await page.getByLabel('Sondertilgung pro Monat (EUR)').fill('300+0');
  await page.getByLabel('Sondertilgung pro Monat (EUR)').press('Enter');
  await expect(page.getByLabel('Sondertilgung pro Monat (EUR)')).toHaveValue('300,00');
  await page.getByLabel('Monatliche Gebühr (EUR)').fill('0');
  await page.getByLabel('Nominaler Jahreszins (%)').fill('6,32');
  await page.getByLabel('Erster Modellmonat').fill('2026-10');
}

sampleTest(
  'current debts, literal native payoff, pending inputs, drilldown and prototype geometry',
  async ({ page, request }, info) => {
    await page.goto('/vermoegen/schulden');
    await expect(page.getByTestId('debt-total')).toHaveText('12.626,00 €');
    await expect(page.getByLabel('Monatsrate (EUR)', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Modell berechnen', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('ausdrücklich');
    await assumptions(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/wealth/debts/*/projection', async (route) => {
      await held;
      await route.continue();
    });
    await page.getByRole('button', { name: 'Modell berechnen', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Wird berechnet …' })).toBeDisabled();
    await expect(page.getByLabel('Monatsrate (EUR)', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('Kredit für das Modell')).toBeDisabled();
    release();
    const comparison = page.getByRole('region', { name: 'Modellvergleich' });
    await expect(comparison).toContainText('Juni 2029');
    await expect(comparison).toContainText('März 2028');
    await expect(comparison).toContainText('1.094,05 €');
    await expect(comparison).toContainText('617,26 €');
    await expect(comparison).toContainText('476,79 €');
    await expect(comparison).toContainText('15 Monate früher');
    const cells = await comparison
      .locator('tbody tr')
      .first()
      .locator('th,td')
      .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().y));
    expect(Math.max(...cells) - Math.min(...cells)).toBeLessThanOrEqual(1);

    await expect(page.getByRole('heading', { name: 'Zins und Tilgung je Jahr' })).toBeVisible();
    await expect(page.getByTestId('debt-chart').locator('.l-actual')).toHaveCount(1);
    await expect(page.getByTestId('debt-chart').locator('.l-plan')).toHaveCount(1);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => {
        document.documentElement.dataset['theme'] = t;
      }, theme);
      await capture(page, info, `debts-${theme}`);
    }
    // Serve the unchanged original prototype only inside this browser context; no extra server.
    const prototype = await page.context().newPage();
    const root = resolve('design/prototype');
    await prototype.route('**/__debt_reference/**', (route) => {
      const file = resolve(
        root,
        new URL(route.request().url()).pathname.split('/__debt_reference/')[1] ?? '',
      );
      if (!file.startsWith(`${root}/`)) return route.abort();
      const mime: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.woff2': 'font/woff2',
      };
      return route.fulfill({
        body: readFileSync(file),
        contentType: mime[extname(file)] ?? 'application/octet-stream',
      });
    });
    await prototype.goto(`${SAMPLE_URL}/__debt_reference/vermoegen.html#schulden`);
    await expect(
      prototype.getByRole('heading', { name: 'Sondertilgung', exact: true }),
    ).toBeVisible();
    const geometry = async (p: Page) => {
      await settle(p);
      return {
        lead: await p.locator('.vview > .vnw').boundingBox(),
        model: await p.locator('.vview > .vcomp').boundingBox(),
      };
    };
    const actual = await geometry(page),
      original = await geometry(prototype);
    // Full page width: column widths follow the window, so only the prototype's structure is
    // compared (lead panel at the same left edge, model panel beside it on the same row).
    expect(actual.lead!.x).toBeCloseTo(original.lead!.x, 0);
    if (info.project.name === 'mobile') {
      // Phone: the model panel stacks below the lead panel.
      expect(actual.model!.y).toBeGreaterThanOrEqual(actual.lead!.y + actual.lead!.height - 1);
    } else {
      for (const g of [actual, original]) {
        expect(g.model!.x).toBeGreaterThanOrEqual(g.lead!.x + g.lead!.width - 1);
        expect(Math.abs(g.model!.y - g.lead!.y)).toBeLessThanOrEqual(1);
      }
    }
    for (const theme of ['light', 'dark']) {
      await prototype.evaluate((t) => {
        document.documentElement.dataset['theme'] = t;
      }, theme);
      await settle(prototype);
      await prototype.screenshot({
        path: evidence(info, `prototype-${theme}.png`),
        fullPage: true,
      });
    }
    writeFileSync(evidence(info, 'geometry.json'), JSON.stringify({ actual, original }, null, 2));
    await prototype.close();
    expect(
      (
        await request.post('/api/wealth/debts/loan/projection', {
          headers: { origin: 'http://other.test' },
          data: {},
        })
      ).status(),
    ).toBe(403);
    await page.reload();
    await expect(page.getByLabel('Monatsrate (EUR)', { exact: true })).toHaveValue('');
    await expect(page.getByRole('region', { name: 'Modellvergleich' })).toHaveCount(0);
    const link = page.locator('.debt-accounts').getByRole('link').first();
    const href = await link.getAttribute('href');
    await link.click();
    await expect(page).toHaveURL(new RegExp(href!));
  },
);

sampleTest(
  'overview error/retry, missing native terms and invalid projection remain honest',
  async ({ page }, info) => {
    let fail = true;
    await page.route('**/api/wealth/debts', async (route) => {
      if (fail) {
        fail = false;
        return route.fulfill({ status: 503, json: { error: 'unavailable' } });
      }
      const response = await route.fetch();
      const view = await response.json();
      view.totalEurCents = null;
      for (const a of view.accounts)
        if (a.type === 'loan') {
          a.interestRateBp = null;
          a.monthlyFeeCents = null;
          a.owedEurCents = null;
          a.missingFxCurrencies = ['USD'];
          a.currency = 'USD';
        }
      return route.fulfill({ response, json: view });
    });
    await page.goto('/vermoegen/schulden');
    await expect(page.getByText('Schulden konnten nicht geladen werden.')).toBeVisible();
    await page.getByRole('button', { name: 'Erneut versuchen' }).click();
    await expect(page.getByTestId('debt-total')).toHaveText('—');
    await expect(page.getByLabel('Nominaler Jahreszins (%)')).toHaveValue('');
    await expect(page.getByLabel('Monatliche Gebühr (USD)')).toHaveValue('');
    await expect(page.getByText(/Gesamtschuld unbekannt/)).toContainText('Wechselkurs fehlt: USD');
    await capture(page, info, 'debts-unknown');
    await page.getByLabel('Monatsrate (USD)', { exact: true }).fill('0');
    await page.getByLabel('Monatliche Gebühr (USD)').fill('0');
    await page.getByLabel('Nominaler Jahreszins (%)').fill('0');
    await page.getByRole('button', { name: 'Modell berechnen', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Monatsrate muss');
    await expect(page.getByRole('region', { name: 'Modellvergleich' })).toHaveCount(0);
  },
);

test('empty debts and actual native currency scenario need no EUR exchange rate', async ({
  page,
  request,
}, info) => {
  await page.route('**/api/wealth/debts', (route) =>
    route.fulfill({ json: { asOf: '2026-10-01', accounts: [], totalEurCents: 0 } }),
  );
  await page.goto('/vermoegen/schulden');
  await expect(page.getByText('Keine negativen Kontowerte zum Stichtag.')).toBeVisible();
  await page.unroute('**/api/wealth/debts');
  const created = await request.post('/api/accounts', {
    headers: { origin: MAIN_URL },
    data: {
      name: `Szenariokredit ${info.project.name}`,
      type: 'loan',
      currency: 'USD',
      openingDate: '2026-10-01',
      openingBalanceCents: -10000,
    },
  });
  expect(created.ok()).toBe(true);
  const { account } = await created.json();
  await page.goto(`/vermoegen/schulden?kredit=${account.id}`);
  await expect(page.getByLabel('Monatsrate (USD)', { exact: true })).toBeVisible();
  await page.getByLabel('Monatsrate (USD)', { exact: true }).fill('40');
  await page.getByLabel('Monatliche Gebühr (USD)').fill('0');
  await page.getByLabel('Nominaler Jahreszins (%)').fill('0');
  await page.getByRole('button', { name: 'Modell berechnen', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Modellvergleich' })).toContainText('USD');
  await expect(page.getByTestId('debt-total')).toHaveText('—');
});
