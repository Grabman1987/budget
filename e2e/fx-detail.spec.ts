import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { openDatabase, schema } from '@budget/db';
import { join } from 'node:path';
import { test } from './isolated-ledger';
import { toast } from './ledger-helpers';

test('native detail, dated EUR history and reconciliation undo', async ({
  page,
  request,
  baseURL,
  isolatedLedger,
}, info) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers: { origin: baseURL! }, data });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const account = (
    await post('/accounts', {
      name: 'Synthetic USD',
      type: 'savings',
      onBudget: false,
      currency: 'USD',
      openingBalanceCents: 10_000,
      openingDate: '2026-09-30',
    })
  ).account;
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    opened.db
      .insert(schema.fxRate)
      .values([
        { currency: 'USD', date: '2026-09-25', rateMicro: 500_000, source: 'ecb' },
        { currency: 'USD', date: '2026-10-02', rateMicro: 750_000, source: 'ecb' },
        { currency: 'USD', date: '2026-10-03', rateMicro: 900_000, source: 'ecb' },
      ])
      .run();
  } finally {
    opened.close();
  }
  for (const [date, amountCents, status] of [
    ['2026-10-01', -101, 'confirmed'],
    ['2026-10-02', 201, 'confirmed'],
    ['2026-10-02', -10, 'pending'],
  ] as const)
    await post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date,
      amountCents,
      currency: 'USD',
      status,
    });
  await page.goto('/konten');
  const overview = page
    .locator('.krow')
    .filter({ has: page.getByRole('link', { name: 'Synthetic USD', exact: true }) });
  await expect(overview).toContainText('75,68 €');
  await page.goto(`/konten/${account.id}`);
  await expect(page.getByTestId('account-balance')).toHaveText('75,68 €');
  await expect(page.locator('.kfigs')).toContainText('1 USD = 0,75 EUR · 02.10.2026');
  await expect(page.locator('.kfigs')).toContainText('0,92 €');
  const expense = page.locator('.kx-amount').filter({ hasText: '−0,51 €' });
  await expect(expense).toContainText('−USD');
  await expect(expense).toContainText('25.09.2026');
  await expect(page.getByTestId('balance-chart')).toHaveAttribute('aria-label', /USD/);
  await expect(page.getByTestId('balance-chart-eur')).toHaveAttribute('aria-label', /EUR/);
  const history = page.getByText('EUR-Bewertung · Tageswerte und Kurse', { exact: true });
  await history.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.kfx-history')).toContainText('Kurs fehlt');
  await expect(page.locator('.kfx-history')).toContainText('49,50 €');
  await history.click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: join(info.outputDir, `fx-detail-${theme}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Kontostand prüfen', exact: true }).click();
  const panel = page.getByRole('dialog', {
    name: 'Kontostand prüfen · Synthetic USD',
    exact: true,
  });
  await panel.getByLabel('Saldo laut Bank · USD', { exact: true }).fill('102');
  await expect(panel.locator('.kv-list')).toContainText('76,50 €');
  await expect(panel.locator('.kv-list')).toContainText('+0,75 €');
  await expect(panel.locator('.amount-cur')).toHaveText('USD');
  expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
  // Full-page capture resizes the native desktop dialog; keep its draft in the real viewport.
  await page.screenshot({ path: join(info.outputDir, 'fx-reconciliation.png') });
  await expect(panel.getByLabel('Saldo laut Bank · USD', { exact: true })).toHaveValue(/102/);
  await panel.getByRole('button', { name: /Differenz ausgleichen/ }).click();
  await expect(page.getByTestId('account-balance')).toHaveText('76,43 €');
  await expect(toast(page)).toContainText('USD');
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByTestId('account-balance')).toHaveText('75,68 €');
  await toast(page).getByRole('button', { name: 'Wiederholen' }).click();
  await expect(page.getByTestId('account-balance')).toHaveText('76,43 €');
  await page.goto(`/konten/buchungen?konto=${account.id}`);
  await expect(page.locator('.ksum')).toContainText('+1,67 €');
  await expect(page.locator('.ksum')).toContainText('USD');
  await expect(page.locator('.ksum')).toContainText('EUR je Buchungstag');
});

test('missing FX stays explicit while the native check remains available', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const response = await request.post('/api/accounts', {
    headers: { origin: baseURL! },
    data: {
      name: 'Synthetic CHF',
      type: 'savings',
      onBudget: false,
      currency: 'CHF',
      openingBalanceCents: 5_000,
      openingDate: '2026-09-30',
    },
  });
  expect(response.ok()).toBe(true);
  const { account } = await response.json();
  const booking = await request.post('/api/bookings', {
    headers: { origin: baseURL! },
    data: {
      type: 'booking',
      accountId: account.id,
      date: '2026-10-02',
      amountCents: -100,
      currency: 'CHF',
      status: 'confirmed',
    },
  });
  expect(booking.ok()).toBe(true);
  await page.goto(`/konten/${account.id}`);
  await expect(page.getByTestId('account-balance')).toHaveText('Kurs fehlt');
  await expect(page.locator('.kx-amount')).toContainText('CHF');
  await expect(page.locator('.kx-amount')).toContainText('EUR: Kurs fehlt');
  await expect(page.getByTestId('balance-chart-eur')).toHaveCount(0);
  await expect(page.getByText('EUR-Bewertung: Kurs fehlt', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Kontostand prüfen', exact: true }).click();
  const panel = page.getByRole('dialog', {
    name: 'Kontostand prüfen · Synthetic CHF',
    exact: true,
  });
  await panel.getByLabel('Saldo laut Bank · CHF').fill('49');
  await expect(panel.locator('.kv-list')).toContainText('EUR: Kurs fehlt');
  await expect(panel.getByText(/stimmt überein/)).toContainText('CHF');
  await expect(panel.getByRole('button', { name: /Festschreiben/ })).toBeEnabled();
  expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
  await page.screenshot({ path: join(info.outputDir, 'fx-missing-rate.png') });
  await expect(panel.getByLabel('Saldo laut Bank · CHF')).toHaveValue(/49/);
  await panel.getByRole('button', { name: /Festschreiben/ }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.getByTestId('account-balance')).toHaveText('Kurs fehlt');
});
