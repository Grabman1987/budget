import type { Page } from '@playwright/test';
import { sampleTest as test, expect } from './sample';
import { expectScreenshot } from './visual';

const settings = '/einstellungen/datenquellen';
const success = '2026-09-17T04:15:00Z';
const displayedSuccess = '17.09.2026 06:15';
const next = '2026-09-18T04:15:00Z';
const mapping = {
  id: 'synthetic-account',
  label: 'Testkonto A',
  accountId: 'synthetic-budget-account',
  fromDate: '2026-09-01',
  currency: 'EUR',
  open: 0,
  warnings: [],
  locked: false,
  requestsToday: 0,
  requestLimit: 4,
  lastSyncAt: null,
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
const bank = { configured: true, workerEnabled: true, connections: [connection], accounts: [] };
const market = {
  lastRun: { status: 'ok', finishedAt: success },
  lastSuccess: { finishedAt: success },
};

async function mockSources(page: Page, mixed = false) {
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
      json: mixed ? { ...market, lastRun: { ...market.lastRun, status: 'failed' } } : market,
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
    action: 'Einrichtung ansehen',
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
      state.status === null ? 'Noch kein erfolgreicher Abruf' : displayedSuccess,
    );
    await expect(time).toContainText(
      (state.status === 'active' || state.status === 'error') &&
        !('change' in state && 'accountId' in state.change)
        ? '18.09.2026 06:15'
        : 'Kein Zeitplan',
    );
    const action = head.getByRole('button', { name: state.action, exact: true });
    await expect(head.locator('.settings-source-action .btn')).toHaveCount(1);
    await action.click();
    await expect(row.locator('.settings-source-details')).toBeVisible();
    await expect(row.locator(state.target)).toBeFocused();
  });
}

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
    'Spritmonitor',
    'Gehaltszettel',
    'VPI',
  ]);
  const columns = await register
    .locator('.settings-source-state')
    .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().x));
  expect(columns).toHaveLength(6);
  expect(new Set(columns).size).toBe(1);
  await expect(register.getByRole('status').first()).toHaveText('4 von 6 Quellen brauchen dich');
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
  }
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
          ? '4 von 6 Quellen brauchen dich'
          : `Alle 6 Quellen aktuell – letzter Abruf ${displayedSuccess}`,
      );
      await expectScreenshot(page, `verbindungen-${mixed ? 'gemischt' : 'aktuell'}-${scheme}.png`);
    });
  }
}
