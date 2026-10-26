import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { AccountList, AccountSeriesBatch } from '../apps/web/src/ledger/types';
import { sampleTest as test, expect } from './sample';

// Drain read-only fixtures on success and assertion failure before the page closes.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});

const accountChanges = (page: Page) =>
  page
    .locator('.overview-detail-facts > div')
    .filter({ has: page.getByText('Veränderung im Verlauf', { exact: true }) })
    .locator('dd');

async function openAccountDetails(page: Page) {
  for (const button of await page.getByRole('button', { name: /^Details zu / }).all())
    await button.click();
}

test('account balances, totals and loaded sparkline changes follow live privacy toggles', async ({
  page,
}) => {
  const accountsResponse = await page.request.get('/api/accounts');
  expect(accountsResponse.ok()).toBe(true);
  const accounts = (await accountsResponse.json()) as AccountList;
  const zeroAccount = accounts.accounts.find(
    (account) => account.type === 'checking' && account.currency === 'EUR' && !account.closedAt,
  );
  expect(zeroAccount).toBeDefined();
  // Independent genuine-zero change: all 31 dated EUR cash observations are exactly10000 cents.
  // Keep the live account identities and all other histories; no stored money is changed.
  await page.route(/\/api\/accounts\/series\?/, async (route) => {
    const response = await route.fetch();
    const data = (await response.json()) as AccountSeriesBatch;
    const points = data.series[zeroAccount!.id]!.points;
    expect(points).toHaveLength(31);
    expect(points[0]!.date).toBe('2026-08-18');
    expect(points.at(-1)!.date).toBe('2026-09-17');
    data.series[zeroAccount!.id]!.points = points.map((point) => ({
      ...point,
      balanceCents: 10000,
      valuation: {
        currency: 'EUR',
        asOf: point.date,
        eurCents: 10000,
        rateMicro: 1000000,
        rateDate: null,
        rateSource: null,
      },
    }));
    data.quality = {
      ...data.quality,
      [zeroAccount!.id]: Object.fromEntries(
        points.map((point) => [
          point.date,
          {
            source: 'native_cash',
            currency: 'EUR',
            known: true,
            quality: 'exact',
            missing: null,
          },
        ]),
      ),
    };
    await route.fulfill({ response, json: data });
  });
  await page.goto('/konten');
  await expect(page.locator('.krow').first()).toBeVisible({ timeout: 20_000 });
  await openAccountDetails(page);
  const changes = accountChanges(page);
  const zeroChange = page
    .locator(`[data-account-id="${zeroAccount!.id}"]`)
    .locator('xpath=following-sibling::tr[1]')
    .locator('.overview-detail-facts > div')
    .filter({ has: page.getByText('Veränderung im Verlauf', { exact: true }) })
    .locator('dd');
  await expect(zeroChange).toHaveText('0,00 €');
  await expect
    .poll(() => changes.count(), { timeout: 20_000 })
    .toBe(await page.locator('.krow').count());
  await expect(changes.filter({ hasText: '0,00 €' }).first()).toBeAttached();
  await page.keyboard.press('Control+Shift+H');
  await expect(page.getByTestId('budget-accounts-balance')).toContainText('•••');
  await expect(changes.filter({ hasText: '0,00 €' })).toHaveCount(0);
  for (const amount of await page.locator('td.kc-num, .kdelta, .kclosed-val').or(changes).all()) {
    await expect(amount).toContainText('•••');
  }
  await page.keyboard.press('Control+Shift+H');
  await expect(changes.filter({ hasText: '0,00 €' }).first()).toBeAttached();
  await expect(page.getByTestId('budget-accounts-balance')).not.toContainText('•••');
});

test('privacy follows routes and reload, masks money and chart alternatives, preserves an open draft', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.goto('/?monat=2026-09');
  const header = page.locator(info.project.name === 'mobile' ? '.m-head' : '.topbar');
  const toggle = header.getByRole('button', { name: 'Beträge verbergen', exact: true });
  const menu = header.locator('.m-profile summary');
  await expect(page.getByTestId('heute-lead-value')).toContainText('988', { timeout: 20_000 });
  if (info.project.name === 'mobile') await menu.click();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  if (info.project.name === 'mobile') await menu.press('Escape');
  for (const path of [
    '/?monat=2026-09',
    '/plan/monat?monat=2026-09',
    '/konten',
    '/vermoegen/nettovermoegen',
    '/reports/gesamttabelle',
    '/einstellungen/regelwerk',
  ]) {
    await page.goto(path);
    if (info.project.name === 'mobile') await menu.click();
    await expect(
      header.getByRole('button', { name: 'Beträge verbergen', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    if (info.project.name === 'mobile') await menu.press('Escape');
    await expect(page.locator('main')).toContainText('•••', { timeout: 20_000 });
    if (path === '/konten') {
      await expect(page.locator('.krow').first()).toBeVisible();
      await openAccountDetails(page);
      await expect
        .poll(() => accountChanges(page).count())
        .toBe(await page.locator('.krow').count());
      await expect
        .poll(() => page.locator('.overview-row-line .chart-interactive').count())
        .toBe(await page.locator('.krow').count());
    }
    const leaks = await page.locator('main').evaluate((main) => {
      const money = /[+−-]?\d[\d.,\s]*(?:Mio\.\s*)?(€|EUR|USD|GBP|CHF)(?![A-Z])/g;
      return [
        main.textContent ?? '',
        ...Array.from(main.querySelectorAll('[aria-label], [title]')).map(
          (el) => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`,
        ),
      ].flatMap((text) => [...text.matchAll(money)].map((m) => m[0]));
    });
    expect(leaks, path).toEqual([]);
  }
  await page.goto('/konten?panel=buchung');
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  const amount = dialog.getByLabel('Betrag', { exact: true });
  await expect(amount).toHaveAttribute('type', 'password');
  await amount.fill('12,50');
  await dialog.getByLabel('Empfänger').fill('Beispielmarkt');
  await page.keyboard.press('Control+Shift+H');
  await expect(amount).toHaveAttribute('type', 'text');
  await expect(amount).toHaveValue('12,50');
  await expect(dialog.getByLabel('Empfänger')).toHaveValue('Beispielmarkt');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('capture-prefill.png') });
});
