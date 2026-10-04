import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { join } from 'node:path';
import { test } from './isolated-ledger';
import { toast } from './ledger-helpers';

test('a position without market quote is valued at cost and flagged; the first quote and undo keep working', async ({
  page,
  request,
  baseURL,
}, info) => {
  const origin = baseURL!;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`${origin}/api${path}`, {
      headers: { origin },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const current = (await (await request.get(`${origin}/api/accounts`)).json()).asOf as string;
  const name = `Unbewertetes Muster ${info.project.name}`;
  const account = (
    await post('/accounts', {
      name: `Musterdepot ${info.project.name}`,
      type: 'brokerage',
      openingDate: '2026-01-01',
    })
  ).account;
  const security = (await post('/securities', { name, kind: 'stock', currency: 'EUR' })).security;
  await post('/trades', {
    accountId: account.id,
    securityId: security.id,
    date: '2026-09-01',
    kind: 'buy',
    units: '1',
    amountCents: 10000,
  });

  const hint = 'Bewertung teilweise geschätzt: 1 Wertpapier ohne Kurs';

  await page.goto('/konten');
  await expect(page.getByTestId('net-worth')).not.toHaveText('Nicht verfügbar');
  await expect(page.getByTestId('valuation-hint')).toContainText(hint);
  await expect(page.getByText('Wechselkurs fehlt', { exact: false })).toHaveCount(0);

  await page.goto('/');
  await expect(page.getByTestId('heute-lead-value')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Letzte Buchungen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Anstehend · 14 Tage' })).toBeVisible();
  await expect(page.locator('.heute-check-counts')).toBeVisible();
  await expect(page.locator('.heute-net-worth')).not.toContainText('Bewertung nicht verfügbar');
  await expect(page.locator('.heute-net-worth').getByTestId('valuation-hint')).toContainText(hint);

  await page.goto('/reports/peinzahlungen?zeitraum=YTD');
  await expect(page.getByTestId('contributions-end-value')).toContainText('≈');
  await expect(page.getByTestId('valuation-hint')).toHaveCount(0);
  await expect(page.getByText(/Bewertung teilweise geschätzt:/)).toHaveCount(0);

  await page.goto('/vermoegen/portfolio');
  await expect(page.getByTestId('portfolio-value')).toContainText('100,00');
  await expect(page.getByTestId('valuation-hint')).toContainText(hint);
  await page.getByRole('button', { name, exact: true }).click();
  const panel = page.getByRole('dialog', { name, exact: true });
  await expect(panel).toContainText('geschätzt');
  await expect(panel).toContainText('100,00 €');
  await panel.getByLabel('Kursdatum').fill(current);
  await panel.getByLabel('Kurs (EUR)', { exact: true }).fill('120');
  await panel.getByRole('button', { name: 'Kurs speichern', exact: true }).click();
  await expect(toast(page)).toContainText('Manueller Kurs gespeichert');
  await expect(panel.locator('.instrument-accounts')).toContainText('120,00 €');
  await expect(
    panel.getByText('Einstand 100,00 € · Wertzuwachs 20,00 €', { exact: true }),
  ).toContainText('Wertzuwachs 20,00 €');
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(panel).toContainText('geschätzt');
  await expect(panel).toContainText('100,00 €');
  await toast(page).getByRole('button', { name: 'Wiederholen' }).click();
  await expect(panel.locator('.instrument-accounts')).toContainText('120,00 €');
  await expect(
    panel.getByText('Einstand 100,00 € · Wertzuwachs 20,00 €', { exact: true }),
  ).toContainText('Wertzuwachs 20,00 €');
  await page.keyboard.press('Escape');

  await page.goto('/');
  await expect(page.getByTestId('heute-lead-value')).toBeVisible();
  await expect(page.locator('.heute-check-counts')).toBeVisible();
  await expect(page.locator('.heute-net-worth')).not.toContainText('Bewertung nicht verfügbar');
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      fullPage: true,
      animations: 'disabled',
      path: process.env['BUDGET_MISSING_QUOTES_EVIDENCE']
        ? join(
            process.env['BUDGET_MISSING_QUOTES_EVIDENCE'],
            `missing-quote-today-${theme}-${info.project.name}.png`,
          )
        : info.outputPath(`missing-quote-today-${theme}.png`),
    });
  }
  // The days before the first quote are estimates: the history answers, with the hint, no error.
  await page.goto('/vermoegen/nettovermoegen');
  await expect(page.getByTestId('nw-figure')).toBeVisible();
  await expect(page.getByTestId('valuation-hint')).toContainText(hint);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
