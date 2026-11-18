import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { sampleTest as test, expect } from './sample';
import { expectScreenshot } from './visual';

const settings = '/einstellungen/datenquellen';
const success = '2026-09-17T04:15:00Z';
const displayedSuccess = '17.09.2026 06:15';
const next = '2026-09-18T04:15:00Z';
const mapping = {
  id: '00000000-0000-4000-8000-000000000859',
  label: 'Testkonto A',
  accountId: 'synthetic-budget-account',
  fromDate: '2026-09-01',
  currency: 'EUR',
  open: 0,
  warnings: [],
  locked: false,
  requestsToday: 0,
  requestLimit: 4,
  lastSyncAt: success,
  lastResult: null,
};
const connection = {
  id: 'synthetic-connection',
  label: 'Testbank A',
  status: 'active',
  validUntil: '2026-12-01T08:00:00Z',
  lastAttemptAt: success,
  lastSuccessAt: success,
  nextRunAt: next,
  manualAvailableAt: null,
  manualBlockedReason: null,
  bookedToLedger: false,
  running: false,
  accounts: [mapping],
};
const bank = {
  configured: true,
  workerEnabled: true,
  connections: [connection],
  accounts: [
    {
      id: 'synthetic-budget-account',
      name: 'Budgetkonto A',
      type: 'checking',
      currency: 'EUR',
      onBudget: true,
      sortOrder: 0,
      closedAt: null,
      openingDate: '2026-01-01',
    },
    {
      id: 'synthetic-budget-second',
      name: 'Budgetkonto B',
      type: 'checking',
      currency: 'EUR',
      onBudget: true,
      sortOrder: 1,
      closedAt: null,
      openingDate: '2026-01-01',
    },
  ],
};
const market = {
  lastRun: { status: 'ok', finishedAt: success, priceRows: 12, fxRows: 2, failedCount: 0 },
  lastSuccess: { finishedAt: success },
};

async function mockSources(page: Page, mixed = false) {
  await page.route('**/api/securities/synthetic-security', (route) =>
    route.fulfill({
      json: {
        security: {
          id: 'synthetic-security',
          name: 'Testpapier',
          kind: 'etf',
          currency: 'EUR',
          isin: null,
          symbol: 'TEST',
          assetClassId: null,
          terBp: 0,
          leverageFactor: 10,
          regionsJson: null,
        },
      },
    }),
  );
  await page.route('**/api/bank-sync/*/sync', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/bank-sync/callback', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/bank-sync/institutions', (route) =>
    route.fulfill({ json: { institutions: [] } }),
  );
  await page.route('**/api/inbox', (route) =>
    route.fulfill({
      json: {
        entries: mixed
          ? [
              {
                type: 'stored',
                id: 'synthetic-quote-warning',
                kind: 'stale_value',
                title: 'Testpapier: Kurs fehlt',
                refType: 'security',
                refId: 'synthetic-security',
              },
            ]
          : [],
        count: mixed ? 1 : 0,
        readSourceSummaries: [],
      },
    }),
  );
  await page.route('**/api/bank-sync', (route) =>
    route.fulfill({
      json: mixed ? { ...bank, connections: [{ ...connection, status: 'expired' }] } : bank,
    }),
  );
  await page.route('**/api/sources/crypto', (route) =>
    route.fulfill({
      json: {
        configured: true,
        running: false,
        lastSuccess: success,
        lastAttempt: success,
        status: mixed ? 'partial' : 'ok',
        balances: [],
        mappings: [],
        since: null,
        accounts: [],
        securities: [],
        match: { matched: 0, missing: 0, unmapped: 0, informational: 0 },
      },
    }),
  );
  await page.route('**/api/sources/spritmonitor', (route) =>
    route.fulfill({
      json: {
        configured: !mixed,
        running: false,
        state: null,
        rows: [],
        lastResult: { lastSuccess: success, lastAttempt: success, failed: false },
      },
    }),
  );
  await page.route('**/api/payslip-intake/status', (route) =>
    route.fulfill({
      json: {
        passwordSet: false,
        passwordSource: null,
        passwordRememberAvailable: false,
        dropboxConnected: true,
        dropboxConfigured: true,
        dropboxWrite: false,
        lastScanAt: success,
        filesFound: 0,
        errors: 0,
        errorCode: null,
        accounts: [],
        payees: [],
        config: { salaryAccountId: null, wageTypes: {} },
      },
    }),
  );
  await page.route('**/api/market/status', (route) =>
    route.fulfill({
      json: mixed
        ? {
            ...market,
            lastRun: {
              ...market.lastRun,
              status: 'failed',
              priceRows: 0,
              fxRows: 0,
              failedCount: 1,
            },
          }
        : market,
    }),
  );
  await page.route('**/api/inflation-basket/reference', (route) =>
    route.fulfill({ json: { reference: { lastMonth: '2026-08', fetchedAt: success } } }),
  );
}

async function openRegister(page: Page, search = '') {
  await page.goto(settings + search);
  const register = page.getByRole('region', { name: 'Quellenregister' });
  if ((await page.locator('.app').getAttribute('data-budget-redesign')) !== '1') {
    await expect(register).toHaveCount(0);
    return null;
  }
  await expect(register).toBeVisible();
  return register;
}

const cases = [
  {
    word: 'Verbunden',
    impact: null,
    action: 'Jetzt abrufen',
    target: '[data-source-bank-sync]',
    status: 'active',
  },
  {
    word: 'Einwilligung abgelaufen',
    impact: 'Konten mit abgelaufener Einwilligung werden nicht abgerufen.',
    action: 'Bank neu verbinden',
    target: '[data-source-bank-connect]',
    status: 'expired',
  },
  {
    word: 'Abruf fehlgeschlagen',
    impact: 'Der Stand der Bankkonten kann veraltet sein.',
    action: 'Erneut versuchen',
    target: '[data-source-bank-sync]',
    status: 'error',
  },
  {
    word: 'Konto nicht zugeordnet',
    impact: 'Testkonto A wird ohne Zuordnung nicht abgerufen.',
    action: 'Konto zuordnen',
    target: 'select[data-source-bank-mapping]',
    status: 'active',
    change: { accountId: null },
  },
  {
    word: 'Teilweise abgerufen',
    impact: '3 Umsätze sind zu prüfen.',
    action: 'Konten prüfen',
    target: 'a[href*="/konten/pruefen"]',
    status: 'active',
    change: {
      open: 3,
      warnings: [{ id: 'synthetic-warning', title: 'Testwarnung', detail: null }],
    },
  },
  {
    word: 'Freigabe offen',
    impact: 'Die Bank wartet auf deine Freigabe.',
    action: 'Freigabe abschließen',
    target: '[data-source-bank-callback]',
    status: 'pending',
    search: '?code=synthetic-code&state=synthetic-state',
  },
  {
    word: 'Pausiert',
    impact: 'Der Abruf für betroffene Konten ist pausiert.',
    action: 'Bank neu verbinden',
    target: '[data-source-bank-connect]',
    status: 'paused',
  },
  {
    word: 'Nicht eingerichtet',
    impact: 'Bankkonten werden noch nicht abgerufen.',
    action: 'Einrichten',
    target: '.settings-source-details',
    status: null,
  },
] as const;

for (const state of cases) {
  test(`connections shows bank state and recovery focus: ${state.word}`, async ({ page }) => {
    await mockSources(page);
    await page.route('**/api/bank-sync', (route) =>
      route.fulfill({
        json: {
          ...bank,
          configured: state.status !== null,
          connections:
            state.status === null
              ? []
              : [
                  {
                    ...connection,
                    status: state.status,
                    accounts: [{ ...mapping, ...('change' in state ? state.change : {}) }],
                  },
                ],
        },
      }),
    );
    const register = await openRegister(page, 'search' in state ? state.search : '');
    if (!register) return;
    const row = register.getByRole('region', { name: 'Bank', exact: true });
    const head = row.locator('.settings-source-head');
    await expect(head.locator('.settings-source-status')).toHaveText(state.word);
    if (state.impact)
      await expect(head.locator('.settings-source-impact')).toHaveText(state.impact);
    else await expect(head.locator('.settings-source-impact')).toHaveCount(0);
    const time = head.locator('.settings-source-time');
    await expect(time).toContainText('Letzter Erfolg');
    await expect(time).toContainText(
      state.status === null ? 'noch kein erfolgreicher Abruf' : displayedSuccess,
    );
    await expect(time).toContainText(
      (state.status === 'active' || state.status === 'error') &&
        !('change' in state && 'accountId' in state.change)
        ? '18.09.2026 06:15'
        : '– kein Zeitplan',
    );
    await expect(time.locator('dt')).toHaveText(['Letzter Erfolg', 'Nächster Abruf']);
    const action = head.getByRole('button', { name: state.action, exact: true });
    await expect(head.locator('.settings-source-action .btn')).toHaveCount(1);
    if ((state.status === 'active' && !('change' in state)) || state.status === 'error') {
      const sent = page.waitForRequest('**/api/bank-sync/synthetic-connection/sync');
      await action.click();
      expect((await sent).method()).toBe('POST');
      await expect(row.locator('.settings-source-toggle')).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    } else if (state.status === 'expired' || state.status === 'paused') {
      const sent = page.waitForRequest('**/api/bank-sync/institutions');
      await action.click();
      expect((await sent).method()).toBe('GET');
      await expect(row.locator('[data-source-bank-connect]')).toBeVisible();
    } else if ('change' in state && 'open' in state.change) {
      await expect(row.getByRole('link', { name: '3 zu prüfen' })).toHaveAttribute(
        'href',
        /bankSource=00000000-0000-4000-8000-000000000859/,
      );
      await action.click();
      await expect(page).toHaveURL(/bankSource=00000000-0000-4000-8000-000000000859/);
    } else if (state.status === 'pending') {
      const sent = page.waitForRequest('**/api/bank-sync/callback');
      await action.click();
      expect((await sent).postDataJSON()).toEqual({
        code: 'synthetic-code',
        state: 'synthetic-state',
      });
    } else {
      await action.click();
      await expect(row.locator(state.target)).toBeFocused();
    }
  });
}

test('bank warnings retain recovery without a zero-count link', async ({ page }) => {
  await mockSources(page);
  await page.route('**/api/bank-sync', (route) =>
    route.fulfill({
      json: {
        ...bank,
        connections: [
          {
            ...connection,
            accounts: [
              {
                ...mapping,
                warnings: [{ id: 'synthetic-warning', title: 'Testwarnung', detail: null }],
              },
            ],
          },
        ],
      },
    }),
  );
  const register = await openRegister(page);
  if (!register) return;
  const row = register.getByRole('region', { name: 'Bank', exact: true });
  await expect(row.getByRole('link', { name: '0 zu prüfen' })).toHaveCount(0);
  await expect(row.getByRole('link', { name: 'Konto prüfen', exact: true })).toBeVisible();
  await row
    .locator('.settings-source-action')
    .getByRole('button', { name: 'Konten prüfen' })
    .click();
  await expect(page).toHaveURL(/bankSource=00000000-0000-4000-8000-000000000859/);
});

test('connections distinguishes a partly completed bank run and focuses the retry wait', async ({
  page,
}) => {
  await mockSources(page);
  const attempt = '2026-09-17T04:30:00Z';
  const retry = '2026-09-17T04:45:00Z';
  await page.route('**/api/bank-sync', (route) =>
    route.fulfill({
      json: {
        ...bank,
        connections: [
          {
            ...connection,
            status: 'error',
            lastAttemptAt: attempt,
            nextRunAt: retry,
            manualAvailableAt: retry,
            manualBlockedReason: 'Abrufpause aktiv. Nächsten möglichen Abruf abwarten.',
            accounts: [
              { ...mapping, lastSyncAt: attempt },
              {
                ...mapping,
                id: 'synthetic-second-account',
                label: 'Testkonto B',
                lastSyncAt: success,
              },
            ],
          },
        ],
      },
    }),
  );
  const register = await openRegister(page);
  if (!register) return;
  const row = register.getByRole('region', { name: 'Bank', exact: true });
  await expect(row.locator('.settings-source-status')).toHaveText('Teilweise abgerufen');
  await expect(row.locator('.settings-source-impact')).toHaveText(
    'Für 1 Konto fehlt der letzte Abruf.',
  );
  await expect(row.locator('.settings-source-time')).toContainText(displayedSuccess);
  await expect(row.locator('.settings-source-time')).toContainText('17.09.2026 06:45');
  await row
    .locator('.settings-source-action')
    .getByRole('button', { name: 'Abruf fortsetzen' })
    .click();
  await expect(row.locator('[data-source-bank-blocked]')).toBeFocused();
  await expect(row.locator('[data-source-bank-sync]')).toBeDisabled();
});

test('routine commands work without expanding setup and preserve request payloads', async ({
  page,
}) => {
  await mockSources(page);
  const cryptoBodies: unknown[] = [];
  await page.route('**/api/sources/crypto/refresh', async (route) => {
    cryptoBodies.push(route.request().postDataJSON());
    await route.fulfill({ json: { status: 'ok' } });
  });
  await page.route('**/api/market/refresh', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/bank-sync/accounts/00000000-0000-4000-8000-000000000859', (route) =>
    route.fulfill({ json: {} }),
  );
  let releaseUpload!: () => void;
  const uploadGate = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  await page.route('**/api/payslip-intake/upload', async (route) => {
    await uploadGate;
    await route.fulfill({ json: { id: 'synthetic-upload', duplicate: false } });
  });
  await page.route('**/api/payslip-intake/synthetic-upload', (route) =>
    route.fulfill({
      json: {
        id: 'synthetic-upload',
        receiptId: 'synthetic-receipt',
        status: 'pending',
        accounts: [],
        matches: [],
        expectedPayouts: [],
        payees: [],
        payoutAccountId: null,
        parsed: {
          documentType: 'unknown',
          warnings: ['Synthetische Prüfung erforderlich.'],
          draft: null,
        },
      },
    }),
  );
  await page.route('**/api/inbox?readSource=crypto&*', (route) =>
    route.fulfill({
      json: { entries: [], count: 0, totalEntries: 0, countsByTitle: {}, readSourceSummaries: [] },
    }),
  );
  const register = await openRegister(page);
  if (!register) return;
  const bankRow = register.getByRole('region', { name: 'Bank', exact: true });

  const crypto = register.getByRole('region', { name: 'Krypto', exact: true });
  const marketRow = register.getByRole('region', { name: 'Kurse', exact: true });
  const payslip = register.getByRole('region', { name: 'Gehaltszettel', exact: true });
  for (const control of [
    bankRow.locator('[data-source-bank-sync]'),
    bankRow.getByRole('button', { name: 'Neu verbinden', exact: true }),
    bankRow.locator('[data-source-bank-mapping]'),
    crypto.getByRole('button', { name: 'Jetzt abrufen', exact: true }),
    crypto.getByRole('button', { name: 'Gesamten Verlauf prüfen' }),
    marketRow.getByRole('button', { name: 'Jetzt abrufen', exact: true }),
    payslip.getByRole('button', { name: 'PDF hochladen' }),
  ]) {
    await expect(control).toBeVisible();
    await expect(control).toBeEnabled();
  }
  await expect(register.locator('.settings-source-toggle[aria-expanded="true"]')).toHaveCount(0);
  const mappingRow = bankRow.locator('form.settings-source-subrow');
  if ((await page.viewportSize())!.width === 1440) {
    expect((await mappingRow.boundingBox())!.height).toBeLessThanOrEqual(44);
    const selectBox = (await mappingRow.locator('select').boundingBox())!;
    const saveBox = (await mappingRow
      .getByRole('button', { name: 'Zuordnung speichern' })
      .boundingBox())!;
    expect(selectBox.width).toBeLessThanOrEqual(240);
    expect(selectBox.y + selectBox.height / 2).toBe(saveBox.y + saveBox.height / 2);
  }
  await expect(bankRow.locator('.bank-account-name')).toContainText('Budgetkonto A');
  await expect(bankRow.getByRole('link', { name: '0 zu prüfen' })).toHaveCount(0);
  await expect(crypto.getByRole('link', { name: '0 zu prüfen' })).toHaveCount(0);
  await expect(crypto.getByRole('link', { name: 'Bewegungen prüfen' })).toBeVisible();
  await expect(bankRow.getByRole('button', { name: 'Zuordnung speichern' })).toBeDisabled();
  const movements = page.waitForRequest(
    (request) => new URL(request.url()).searchParams.get('readSource') === 'crypto',
  );
  await crypto.getByRole('link', { name: 'Bewegungen prüfen' }).click();
  await movements;
  const cryptoReview = page.getByRole('dialog', { name: 'Krypto-Bewegungen prüfen' });
  await expect(cryptoReview.getByLabel('Bewegungen nach Titel')).toBeVisible();
  await cryptoReview.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(marketRow).toContainText('12 Kurszeilen aktualisiert');
  await expect(register.getByRole('region', { name: 'VPI', exact: true })).toContainText('2026-08');
  await expect(payslip.getByRole('link', { name: 'Dokumente prüfen' }).last()).toBeVisible();
  await expect(
    register.locator(
      'details details, .settings-source-details details, .settings-source-details [aria-expanded]',
    ),
  ).toHaveCount(0);
  const bankRequest = page.waitForRequest('**/api/bank-sync/synthetic-connection/sync');
  await bankRow.locator('[data-source-bank-sync]').click();
  expect((await bankRequest).postDataJSON()).toEqual({});
  await bankRow.locator('[data-source-bank-mapping]').selectOption('synthetic-budget-second');
  const mappingRequest = page.waitForRequest(
    '**/api/bank-sync/accounts/00000000-0000-4000-8000-000000000859',
  );
  await bankRow.getByRole('button', { name: 'Zuordnung speichern' }).click();
  expect((await mappingRequest).postDataJSON()).toEqual({
    accountId: 'synthetic-budget-second',
    fromDate: '2026-09-01',
  });
  await crypto.getByRole('button', { name: 'Jetzt abrufen', exact: true }).click();
  await expect.poll(() => cryptoBodies).toEqual([{ fullHistory: false }]);
  await crypto.getByRole('button', { name: 'Gesamten Verlauf prüfen' }).click();
  await expect.poll(() => cryptoBodies).toEqual([{ fullHistory: false }, { fullHistory: true }]);
  const priceRequest = page.waitForRequest('**/api/market/refresh');
  await marketRow.getByRole('button', { name: 'Jetzt abrufen', exact: true }).click();
  expect((await priceRequest).method()).toBe('POST');
  const picker = page.waitForEvent('filechooser');
  await payslip.getByRole('button', { name: 'PDF hochladen' }).click();
  const upload = page.waitForRequest('**/api/payslip-intake/upload');
  await (
    await picker
  ).setFiles({
    name: 'synthetic.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nsynthetic'),
  });
  const uploadBody = (await upload).postDataBuffer()!.toString();
  expect(uploadBody).toContain('name="automation"');
  expect(uploadBody).toContain('eligible');
  expect(uploadBody).toContain('filename="synthetic.pdf"');
  await expect(payslip.getByRole('button', { name: 'PDF hochladen' })).toBeDisabled();
  await register
    .getByRole('region', { name: 'VPI', exact: true })
    .getByRole('link', { name: 'Zur persönlichen Inflation' })
    .click();
  await expect(page).toHaveURL(/\/einstellungen\/datenquellen$/);
  releaseUpload();
  const result = page.getByRole('dialog', { name: 'Gehaltszettel hochladen', exact: true });
  await expect(result.getByText('Synthetische Prüfung erforderlich.')).toBeVisible();
  await result.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(register.locator('.settings-source-toggle[aria-expanded="true"]')).toHaveCount(0);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
  for (const toggle of await register.locator('.settings-source-toggle').all())
    await toggle.click();
  await expect(register.locator('details, .settings-source-details [aria-expanded]')).toHaveCount(
    0,
  );
  await expect(payslip.getByLabel('PDF-Passwort', { exact: true })).toBeVisible();
});

test('connections reports an unavailable status and retries the read', async ({ page }) => {
  await mockSources(page);
  let recover = false;
  let retried = false;
  await page.route('**/api/bank-sync', (route) => {
    if (!recover) return route.fulfill({ status: 503, json: { error: 'Synthetic failure' } });
    retried = true;
    return route.fulfill({ json: bank });
  });
  const register = await openRegister(page);
  if (!register) return;
  const row = register.getByRole('region', { name: 'Bank', exact: true });
  await expect(row.locator('.settings-source-status')).toHaveText('Dienst nicht erreichbar', {
    timeout: 15_000,
  });
  await expect(row.locator('.settings-source-impact')).toHaveText('Der Stand kann veraltet sein.');
  await expect(row.locator('.settings-source-time')).toContainText('Letzter Erfolg');
  await expect(row.locator('.settings-source-time')).toContainText('Nicht verfügbar');
  recover = true;
  await row
    .locator('.settings-source-action')
    .getByRole('button', { name: 'Erneut versuchen' })
    .click();
  await expect(row.locator('.settings-source-status')).toHaveText('Verbunden');
  expect(retried).toBe(true);
  await expect(row.locator('.settings-source-time')).toContainText(displayedSuccess);
});

test('connections remains neutral and offers no write during loading', async ({ page }) => {
  await mockSources(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/bank-sync', async (route) => {
    await gate;
    await route.fulfill({ json: bank });
  });
  try {
    const register = await openRegister(page);
    if (!register) return;
    const row = register.getByRole('region', { name: 'Bank', exact: true });
    await expect(register.getByRole('status').first()).toHaveText('Wird geladen');
    await expect(register.locator('.settings-source-summary [data-tone]')).toHaveAttribute(
      'data-tone',
      'neutral',
    );
    await expect(row.locator('.settings-source-status')).toHaveText('Wird geladen');
    await expect(row.locator('.settings-source-impact')).toHaveCount(0);
    await expect(row.locator('.settings-source-time')).toContainText('Wird geladen …');
    await expect(row.getByRole('button', { name: 'Wird geladen …' })).toBeDisabled();
    release();
    await expect(row.locator('.settings-source-time')).toContainText(displayedSuccess);
  } finally {
    release();
  }
});

test('connections aligns columns, orders problem links and reflows down to 320px', async ({
  page,
}) => {
  await mockSources(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  const register = await openRegister(page);
  if (!register) return;
  await expect(register.locator('.settings-source-name strong')).toHaveText([
    'Kurse',
    'Bank',
    'Krypto',
    'Gehaltszettel',
    'VPI',
    'Spritmonitor',
  ]);
  await expect(register.getByRole('link', { name: 'Testpapier: Kurs fehlt' })).toHaveAttribute(
    'href',
    '/vermoegen/portfolio/instrument/synthetic-security',
  );
  await register.getByRole('link', { name: 'Testpapier: Kurs fehlt' }).click();
  const editor = page.getByRole('dialog', { name: 'Stammdaten bearbeiten', exact: true });
  await expect(editor.getByLabel('Name', { exact: true })).toHaveValue('Testpapier');
  await editor.getByRole('button', { name: 'Schließen', exact: true }).click();
  const columns = await register
    .locator('.settings-source-state')
    .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().x));
  expect(columns).toHaveLength(6);
  expect(new Set(columns).size).toBe(1);
  await expect(register.getByRole('status').first()).toHaveText('3 von 6 Quellen brauchen dich');
  const optional = register.getByRole('region', { name: 'Spritmonitor', exact: true });
  await expect(optional.locator('.settings-source-status')).toHaveText('Nicht eingerichtet');
  await expect(optional.locator('.settings-source-mark')).toHaveAttribute('data-tone', 'neutral');
  await expect(
    optional.locator('.settings-source-action').getByRole('button', { name: 'Einrichten' }),
  ).toHaveClass(/btn-ghost/);
  await expect(
    register.getByRole('list', { name: 'Betroffene Quellen' }).getByRole('link'),
  ).toHaveText(['Kurse', 'Bank', 'Krypto']);
  const prices = register.getByRole('region', { name: 'Kurse', exact: true });
  await expect(prices).toContainText('1 Kurs fehlgeschlagen');
  await expect(prices).not.toContainText('0 Kurszeilen');
  await expect(prices).not.toContainText('0 Wechselkurszeilen');
  const bankRow = register.getByRole('region', { name: 'Bank', exact: true });
  await register.getByRole('link', { name: 'Bank', exact: true }).click();
  const toggle = bankRow.getByRole('button', { name: 'Bank: Einrichtung und Details' });
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const action = bankRow.getByRole('button', { name: 'Bank neu verbinden' });
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await action.boundingBox())!.width).toBe(
      (await bankRow.locator('.settings-source-action').boundingBox())!.width,
    );
    const nameBox = (await bankRow.locator('.settings-source-name').boundingBox())!;
    const stateBox = (await bankRow.locator('.settings-source-state').boundingBox())!;
    expect(stateBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height);
  }
});

test('optional document setup stays neutral after healthy sources', async ({ page }) => {
  await mockSources(page);
  await page.route('**/api/payslip-intake/status', (route) =>
    route.fulfill({
      json: {
        dropboxConfigured: false,
        dropboxConnected: false,
        lastScanAt: null,
        filesFound: 0,
        errors: 0,
        accounts: [],
        payees: [],
        config: { salaryAccountId: null, wageTypes: {} },
      },
    }),
  );
  const register = await openRegister(page);
  if (!register) return;
  const row = register.getByRole('region', { name: 'Gehaltszettel', exact: true });
  await expect(row.locator('.settings-source-status')).toHaveText('Nicht eingerichtet');
  await expect(row.locator('.settings-source-mark')).toHaveAttribute('data-tone', 'neutral');
  await expect(
    row.locator('.settings-source-action').getByRole('button', { name: 'Einrichten' }),
  ).toHaveClass(/btn-ghost/);
  await expect(register.getByRole('status').first()).toHaveText(
    `Keine Quelle braucht dich – letzter Abruf ${displayedSuccess}`,
  );
  await expect(register.getByRole('list', { name: 'Betroffene Quellen' })).toHaveCount(0);
  await expect(register.locator('.settings-source-name strong').last()).toHaveText('Gehaltszettel');
  await expect(row.getByRole('button', { name: 'PDF hochladen' })).toBeEnabled();
});

for (const mixed of [false, true]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`connections register screenshot: ${mixed ? 'mixed' : 'healthy'} ${scheme}`, async ({
      page,
      isMobile,
    }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize(
        isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      );
      await mockSources(page, mixed);
      const register = await openRegister(page);
      if (!register) return;
      await expect(register.getByRole('status').first()).toHaveText(
        mixed
          ? '3 von 6 Quellen brauchen dich'
          : `Alle 6 Quellen aktuell – letzter Abruf ${displayedSuccess}`,
      );
      const auditDir = process.env['CONNECTIONS_AUDIT_DIR'];
      if (auditDir && (scheme === 'light' || (mixed && !isMobile))) {
        mkdirSync(auditDir, { recursive: true });
        await page.screenshot({
          path: join(
            auditDir,
            `${mixed ? 'mixed' : 'healthy'}-${isMobile ? '390x844' : '1440x900'}-${scheme}.png`,
          ),
          fullPage: false,
        });
      }
      await expectScreenshot(page, `verbindungen-${mixed ? 'gemischt' : 'aktuell'}-${scheme}.png`);
    });
  }
}
