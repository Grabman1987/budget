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
  test.setTimeout(60_000);
  await page.addInitScript(() => localStorage.setItem('budget-heute-more-phone', '1'));
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
  // A split (+1 unit, 2 held) after the buy makes the execution price unusable for the units held, so only the
  // cost basis (100,00 �) is left: the position is valued at cost and flagged. Buys alone are
  // valued at their trade price and not flagged (see valuation-hint.spec.ts).
  await post('/trades', {
    accountId: account.id,
    securityId: security.id,
    date: '2026-09-02',
    kind: 'split',
    unitsE8: 1e8,
    amountCents: 0,
  });

  const hint = 'Bewertung teilweise geschätzt: 1 Wertpapier ohne Kurs';

  // Cost-valued holdings of 10000 cents and cash of −10000 cents make known net worth zero;
  // the Wealth page uses its existing empty state for this zero-only composition.
  const wealthResponse = await request.get(`${origin}/api/wealth/networth?period=YTD`);
  expect(wealthResponse.status()).toBe(200);
  expect((await wealthResponse.json()).chain.nowCents).toBe(0);
  await page.goto('/konten');
  const accountValue = page
    .locator(`[data-account-id="${account.id}"]`)
    .getByTestId('account-value');
  await expect(accountValue).toBeVisible();
  await expect(accountValue).not.toHaveText('Nicht verfügbar');
  await expect(accountValue).toHaveText('≈ 100,00 €');
  await page
    .getByRole('button', { name: `Details zu Musterdepot ${info.project.name}`, exact: true })
    .click();
  const accountMarker = page.locator('.overview-detail').getByRole('button', {
    name: `Bewertungsgrundlage · Musterdepot ${info.project.name}`,
    exact: true,
  });
  await expect(accountMarker).toHaveText('≈');
  await accountMarker.focus();
  const accountSource = page.locator(
    `[id="${await accountMarker.getAttribute('aria-describedby')}"]`,
  );
  await expect(accountSource).toBeVisible();
  await expect(accountSource).toContainText(name);
  await expect(accountSource).toContainText('Einstandswert als Schätzung');
  await expect(page.getByTestId('valuation-hint')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByText('Wechselkurs fehlt', { exact: false })).toHaveCount(0);

  await page.goto('/');
  await expect(page.getByTestId('heute-lead-value')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Letzte Buchungen' })).toBeVisible();
  // This ledger contains only the synthetic holding; an empty due list stays hidden.
  await expect(page.getByRole('heading', { name: 'Fällig 14 Tage' })).toHaveCount(0);
  await expect(page.locator('.heute-check-counts')).toBeVisible();
  await expect(page.locator('.heute-net-worth')).not.toContainText('Bewertung nicht verfügbar');
  const todayMarker = page.locator('.heute-net-worth').getByRole('button', {
    name: 'Bewertungsgrundlage · Nettovermögen',
    exact: true,
  });
  await expect(todayMarker).toHaveText('≈');
  await todayMarker.focus();
  const todaySource = page.locator(`[id="${await todayMarker.getAttribute('aria-describedby')}"]`);
  await expect(todaySource).toBeVisible();
  await expect(todaySource).toContainText(name);
  await expect(todaySource).toContainText('Einstandswert als Schätzung');
  await expect(page.getByTestId('valuation-hint')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByText('1 Wertpapier ohne aktuellen Kurs', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kurse prüfen', exact: true })).toHaveCount(1);
  const todayResponse = await request.get(`${origin}/api/heute`);
  expect(todayResponse.status()).toBe(200);
  expect((await todayResponse.json()).attention.quoteReview).toEqual({
    count: 1,
    securityIds: [security.id],
  });

  await page.goto('/reports/peinzahlungen?zeitraum=YTD');
  await expect(page.getByTestId('contributions-end-value')).toContainText('≈');
  await expect(page.getByTestId('valuation-hint')).toHaveCount(0);
  await expect(page.getByText(/Bewertung teilweise geschätzt:/)).toHaveCount(0);

  await page.goto('/vermoegen/portfolio');
  await expect(page.getByTestId('portfolio-value')).toContainText('100,00');
  await expect(page.getByTestId('valuation-hint')).toContainText(hint);
  await page.getByRole('button', { name, exact: true }).click();
  const panel = page.getByRole('region', { name, exact: true });
  await expect(panel).toContainText('geschätzt');
  await expect(panel).toContainText('100,00 €');
  await panel.getByRole('button', { name: 'Kurs eintragen', exact: true }).click();
  const quote = page.getByRole('dialog', { name: 'Kurs eintragen', exact: true });
  await quote.getByLabel('Kursdatum').fill(current);
  await quote.getByLabel('Kurs (EUR)', { exact: true }).fill('60');
  await quote.getByRole('button', { name: 'Kurs speichern', exact: true }).click();
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
  // Once quoted, the position is no longer flagged (the hint only names currently held positions
  // without quote or usable execution price); the history answers without error.
  await page.goto('/vermoegen/nettovermoegen');
  await expect(page.getByTestId('nw-figure')).toBeVisible();
  await expect(page.getByTestId('valuation-hint')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
