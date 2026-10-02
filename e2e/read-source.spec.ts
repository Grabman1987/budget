import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
test('source status, read-only capture, explicit mapping and responsive themes', async ({
  page,
}) => {
  let refreshed = false;
  let saved = false;
  const data = {
    configured: true,
    running: false,
    status: 'idle',
    lastSuccess: null,
    lastAttempt: null,
    balances: [
      {
        key: 'currency:synthetic-eur',
        currency: 'EUR',
        amount: { value: '12.34', assetId: null, currencyId: 'synthetic-eur', cents: 1234 },
      },
    ],
    mappings: [],
    accounts: [{ id: 'cash', name: 'Verrechnungskonto', currency: 'EUR', type: 'checking' }],
    securities: [],
  };
  await page.route('**/api/sources/crypto**', async (route) => {
    const request = route.request();
    if (request.url().endsWith('/refresh')) {
      refreshed = true;
      await route.fulfill({ json: { status: 'ok' } });
    } else if (request.url().endsWith('/mapping')) {
      expect(request.postDataJSON()).toEqual({
        key: 'currency:synthetic-eur',
        accountId: 'cash',
        securityId: null,
      });
      saved = true;
      await route.fulfill({ json: { groupId: 'synthetic-group' } });
    } else
      await route.fulfill({
        json: {
          ...data,
          status: refreshed ? 'ok' : 'idle',
          lastSuccess: refreshed ? '2026-10-02T12:00:00.000Z' : null,
          lastAttempt: refreshed ? '2026-10-02T12:00:00.000Z' : null,
        },
      });
  });
  await page.goto('/einstellungen/datenquellen');
  await expect(page.getByText('Schlüssel gesetzt: ja')).toBeVisible();
  await page.getByLabel('Verrechnungskonto', { exact: true }).selectOption('cash');
  await page.getByRole('button', { name: 'Zuordnung speichern' }).click();
  await expect(page.getByText('Zuordnung gespeichert.', { exact: false })).toBeVisible();
  expect(saved).toBe(true);
  await page.getByRole('button', { name: 'Jetzt abrufen' }).click();
  await expect(page.getByText('Abruf abgeschlossen', { exact: true })).toBeVisible();
  expect(refreshed).toBe(true);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('heading', { name: 'Krypto-Lesequelle', exact: true }).click();
    const path = test.info().outputPath('read-source-' + scheme + '.png');
    await page.screenshot({ path, fullPage: true });
    await test.info().attach('read source ' + scheme, { path, contentType: 'image/png' });
  }
  expect(
    (await page.getByLabel('Verrechnungskonto', { exact: true }).boundingBox())?.height,
  ).toBeGreaterThanOrEqual(44);
});
test('unconfigured source cannot fetch', async ({ page }) => {
  await page.route('**/api/sources/crypto', (route) =>
    route.fulfill({
      json: {
        configured: false,
        running: false,
        status: 'idle',
        lastSuccess: null,
        lastAttempt: null,
        balances: [],
        mappings: [],
        accounts: [],
        securities: [],
      },
    }),
  );
  await page.goto('/einstellungen/datenquellen');
  await expect(page.getByText('Schlüssel gesetzt: nein')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jetzt abrufen' })).toBeDisabled();
});

test('source operations remain readable in the inbox without posting', async ({ page }) => {
  const detail = JSON.stringify({
    id: 'operation-synthetic',
    type: 'deposit',
    transactions: [
      {
        id: 'transaction-synthetic',
        type: 'deposit',
        flow: 'INCOMING',
        creditedAt: '2026-10-01T12:00:00.000Z',
        amount: { value: '12.34', assetId: null, currencyId: 'currency-synthetic', cents: 1234 },
        fee: null,
      },
    ],
  });
  await page.route('**/api/inbox', (route) =>
    route.fulfill({
      json: {
        asOf: '2026-10-02',
        count: 1,
        entries: [
          {
            type: 'stored',
            id: 'source-synthetic',
            kind: 'import',
            title: 'Quellbewegung: Umbuchung abgleichen',
            detail,
            refType: 'read_source',
            refId: 'crypto',
            urgent: false,
            createdAt: '2026-10-02T12:00:00.000Z',
          },
        ],
      },
    }),
  );
  await page.goto('/konten/posteingang');
  await expect(page.getByText('Zugang: 12,34', { exact: false })).toBeVisible();
  await page.getByText('Quelldaten und Zuordnung anzeigen').click();
  await expect(page.locator('.source-inbox-detail pre')).toContainText('operation-synthetic');
  await expect(page.getByRole('link', { name: 'Datenquelle prüfen' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
