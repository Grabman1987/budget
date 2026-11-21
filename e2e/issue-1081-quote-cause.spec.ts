import { expect, test } from '@playwright/test';

test('Konten Prüfen opens a quote cause and tests sources without dismissing the warning', async ({
  page,
}) => {
  const entry = {
    type: 'stored',
    id: 'synthetic-quote-warning',
    kind: 'stale_value',
    urgent: false,
    title: 'Kurse nicht abrufbar: Synthetische Münze',
    detail: 'Fehlerklasse: currency_mismatch',
    refType: 'security',
    refId: 'synthetic-coin',
    createdAt: '2026-09-15T12:00:00Z',
  };
  await page.route('**/api/inbox?*', (route) =>
    route.fulfill({
      json: {
        asOf: '2026-09-17',
        count: 1,
        entries: [entry],
        totalEntries: 1,
        countsByKind: { stale_value: 1 },
        countsByCause: {},
        readSourceSummaries: [],
        accountReminders: [],
        unlinkedReceiptCount: 0,
        segment: 'aufgaben',
        segments: { umsaetze: 0, aufgaben: 1 },
        taskSources: { accounts: 0, receipts: 0, plan: 0, payslips: 0, other: 1 },
        limit: 100,
        offset: 0,
        next: null,
      },
    }),
  );
  await page.route('**/api/inbox/synthetic-quote-warning', (route) =>
    route.fulfill({ json: { entry } }),
  );
  await page.route('**/api/securities/synthetic-coin/quote-diagnostics', (route) =>
    route.fulfill({
      json: {
        securityId: 'synthetic-coin',
        name: 'Synthetische Münze',
        currency: 'EUR',
        symbol: null,
        coingeckoId: 'synthetic-coin',
        hasQuoteUrl: false,
        asOf: '2026-09-17',
        latest: { date: '2026-09-16', priceMicro: 1234567, source: 'manual', currency: 'USD' },
        movements: [{ id: 'synthetic-movement', date: '2026-09-10', kind: 'buy' }],
        attempts: [
          {
            source: 'coingecko',
            attemptedAt: '2026-09-16T12:00:00Z',
            outcome: 'timeout',
            httpStatus: null,
            detail: null,
          },
        ],
      },
    }),
  );
  await page.route('**/api/securities/synthetic-coin/quote-preview', (route) =>
    route.fulfill({
      json: {
        securityId: 'synthetic-coin',
        currency: 'EUR',
        from: '2026-08-18',
        to: '2026-09-17',
        attempts: [
          {
            source: 'ariva',
            error: 'currency_mismatch',
            latest: null,
            currencyEvidence: { currency: 'USD', origin: 'response' },
          },
        ],
      },
    }),
  );
  await page.goto('/konten/pruefen?teil=aufgaben');
  await page.getByRole('button', { name: 'Prüfen · Weitere Aufgaben', exact: true }).click();
  await expect(page.locator('main')).toContainText('Die Quelle liefert eine andere Kurswährung');
  await expect(page.locator('main')).not.toContainText('Fehlerklasse: currency_mismatch');
  await page.getByRole('link', { name: 'Warnung erklären' }).click();
  await expect(page).toHaveURL(/\/konten\/pruefen\/synthetic-quote-warning/);
  const cause = page.getByRole('region', { name: 'Kursursache' });
  const warning = cause.getByRole('region', { name: 'Gespeicherte Warnung' });
  await expect(warning).toContainText('Die Quelle liefert eine andere Kurswährung');
  await expect(warning).toContainText(
    'Der damalige Quellwert und die antwortende Quelle wurden nicht gespeichert.',
  );
  await expect(warning).not.toContainText('coingecko');
  await expect(cause).toContainText('Letzter Abrufversuch');
  await expect(cause).toContainText('coingecko · Die Quelle hat nicht rechtzeitig geantwortet.');
  await expect(cause).toContainText('Erwartet');
  await expect(cause).toContainText('Automatischer Kurs in EUR');
  await expect(cause).toContainText('1,234567');
  await expect(page.getByRole('button', { name: 'Als erledigt markieren' })).toHaveCount(0);
  await cause.getByRole('button', { name: 'Quelle erneut testen (Vorschau)' }).click();
  await expect(cause.getByRole('status')).toContainText(
    'Die Quelle liefert USD, das Wertpapier wird in EUR geführt',
  );
  await expect(cause.getByRole('status')).toContainText('Warnung bleibt offen');
  await expect(cause.getByRole('status')).toContainText(
    'Erwartet: EUR · Von der Quelle gemeldet: USD',
  );
  await cause.getByText('Betroffene erfasste Bewegungen (1)').click();
  await expect(cause.getByText(/synthetic-movement/)).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});
