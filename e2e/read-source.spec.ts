import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/bank-sync', (route) =>
    route.fulfill({
      json: { configured: false, workerEnabled: false, connections: [], accounts: [] },
    }),
  );
});

test('source status, read-only capture, explicit mapping and responsive themes', async ({
  page,
}) => {
  const crypto = page.getByRole('region', { name: 'Krypto-Lesequelle', exact: true });
  const bank = page.getByRole('region', { name: 'Bank-Sync (PSD2)', exact: true });
  let refreshed = false;
  let refreshes = 0;
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
  await page.route('**/api/bank-sync', (route) =>
    route.fulfill({
      json: {
        configured: true,
        workerEnabled: true,
        accounts: [],
        connections: [
          {
            id: 'bank-synthetic',
            label: 'Bankverbindung A',
            status: 'error',
            validUntil: '2027-01-01T00:00:00.000Z',
            lastAttemptAt: '2026-10-02T12:00:00.000Z',
            lastSuccessAt: null,
            nextRunAt: '2026-10-03T01:00:00.000Z',
            accounts: [],
          },
        ],
      },
    }),
  );
  await page.route('**/api/sources/crypto**', async (route) => {
    const request = route.request();
    if (request.url().endsWith('/refresh')) {
      // One click keeps fetching while the server reports further pages.
      refreshes += 1;
      refreshed = refreshes >= 2;
      await route.fulfill({ json: { status: refreshed ? 'ok' : 'partial' } });
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
  await expect(page.getByRole('heading', { name: 'Bank-Sync (PSD2)', exact: true })).toBeVisible();
  await expect(page.getByText('Schlüssel gesetzt: ja')).toBeVisible();
  await page.getByLabel('Verrechnungskonto', { exact: true }).selectOption('cash');
  await crypto.getByRole('button', { name: 'Zuordnung speichern' }).click();
  await expect(page.getByText('Zuordnung gespeichert.', { exact: false })).toBeVisible();
  expect(saved).toBe(true);
  await crypto.getByRole('button', { name: 'Jetzt abrufen' }).click();
  await expect(page.getByText('Abruf abgeschlossen', { exact: true })).toBeVisible();
  expect(refreshed).toBe(true);
  expect(refreshes).toBe(2);
  await expect(bank.getByText('Abruf fehlgeschlagen', { exact: true })).toBeVisible();
  await expect(crypto.getByText('Abruf abgeschlossen', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Einstellungen', exact: true }),
  ).toHaveCount(1);
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
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo(0, 0);
    });
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
  await expect(
    page
      .getByRole('region', { name: 'Krypto-Lesequelle', exact: true })
      .getByRole('button', { name: 'Jetzt abrufen' }),
  ).toBeDisabled();
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

test('invalid movements and categorized failures are readable without raw payloads', async ({
  page,
}) => {
  await page.route('**/api/inbox', (route) =>
    route.fulfill({
      json: {
        asOf: '2026-10-02',
        count: 2,
        entries: [
          {
            type: 'stored',
            id: 'invalid-source-synthetic',
            kind: 'other',
            title: 'Quellbewegung: Datenformat prüfen',
            detail: JSON.stringify({ id: 'invalid-op', reason: 'schema' }),
            refType: 'read_source',
            refId: 'crypto',
            urgent: true,
            createdAt: '2026-10-02T12:00:00.000Z',
          },
          {
            type: 'stored',
            id: 'failure-source-synthetic',
            kind: 'other',
            title: 'Datenquelle: Abruf fehlgeschlagen',
            detail: JSON.stringify({ category: 'timeout' }),
            refType: 'read_source',
            refId: 'crypto',
            urgent: true,
            createdAt: '2026-10-02T12:00:00.000Z',
          },
        ],
      },
    }),
  );
  await page.goto('/konten/posteingang');
  await expect(
    page.getByText('Die Bewegung konnte nicht gelesen werden.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText('Die Quelle hat nicht rechtzeitig geantwortet.', { exact: false }),
  ).toBeVisible();
  await page.getByText('Quelldaten und Zuordnung anzeigen').first().click();
  await expect(page.locator('.source-inbox-detail pre').first()).toContainText('invalid-op');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
