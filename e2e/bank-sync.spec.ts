import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('bank source callback, mapping, queue action and responsive review', async ({
  page,
}, info) => {
  const bank = page.getByRole('region', { name: 'Bank-Sync (PSD2)', exact: true });
  const calls: { path: string; body: unknown }[] = [];
  const status = {
    configured: true,
    accounts: [
      { id: 'synthetic-account', name: 'Girokonto A', currency: 'EUR', openingDate: '2023-10-01' },
    ],
    connections: [
      {
        id: '10000000-0000-4000-8000-000000000001',
        label: 'Bank A · AT',
        status: 'active',
        bookedToLedger: true,
        manualBlockedReason: null,
        manualAvailableAt: null,
        running: false,
        validUntil: '2027-03-20T00:00:00Z',
        lastAttemptAt: '2026-10-01T02:30:00Z',
        lastSuccessAt: '2026-10-01T02:31:00Z',
        nextRunAt: '2026-10-02T02:30:00Z',
        accounts: [
          {
            id: '10000000-0000-4000-8000-000000000002',
            label: 'Konto A',
            currency: 'EUR',
            accountId: null,
            fromDate: null,
            locked: false,
            requestsToday: 0,
            requestLimit: 4,
            lastSyncAt: null,
            lastResult: null,
            open: 0,
            warnings: [],
          },
        ],
      },
    ],
  };
  await page.route('**/api/bank-sync**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') {
      calls.push({ path, body: route.request().postDataJSON() });
      return route.fulfill({ json: { queued: true, groupId: 'synthetic-group' } });
    }
    return route.fulfill({ json: status });
  });
  await page.goto(
    '/einstellungen/datenquellen?code=synthetic-code&state=synthetic-callback-state-0000000000',
  );
  await page.getByRole('button', { name: 'Bankfreigabe abschließen' }).click();
  await expect(
    page.getByText('Bankfreigabe gespeichert. Bitte die Konten zuordnen.'),
  ).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
  expect(calls[0]).toEqual({
    path: '/api/bank-sync/callback',
    body: { code: 'synthetic-code', state: 'synthetic-callback-state-0000000000' },
  });
  await page.getByLabel('Konto in Budget').selectOption('synthetic-account');
  await page.getByLabel('Umsätze ab').fill('2026-09-01');
  await page.getByRole('button', { name: 'Konto zuordnen' }).click();
  await expect(page.getByText('Kontozuordnung gespeichert.')).toBeVisible();
  expect(calls[1]?.body).toEqual({ accountId: 'synthetic-account', fromDate: '2026-09-01' });
  await bank.getByRole('button', { name: 'Jetzt abrufen' }).click();
  await expect(page.getByText('Abruf vorgemerkt.', { exact: false })).toBeVisible();
  expect(calls[2]?.path).toContain('/sync');
  await page.getByLabel('Gebuchte Umsätze').selectOption('false');
  await expect(page.getByText('Übernahme gespeichert.')).toBeVisible();
  expect(calls[3]).toEqual({
    path: '/api/bank-sync/' + status.connections[0]!.id + '/policy',
    body: { bookedToLedger: false },
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect((await new AxeBuilder({ page }).include('.data-sources').analyze()).violations).toEqual(
    [],
  );
  await page.getByRole('heading', { name: 'Bank-Sync (PSD2)' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'test-results/bank-sync-' + info.project.name + '-light.png',
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.dataset['theme'] = 'dark';
  });
  await page.screenshot({
    path: 'test-results/bank-sync-' + info.project.name + '-dark.png',
    fullPage: true,
  });
});

test('connection cards explain limits and results, scope messages and deep-link to source review', async ({
  page,
}, info) => {
  const sourceId = '10000000-0000-4000-8000-000000000022';
  const account = {
    id: 'synthetic-account',
    name: 'Girokonto A',
    type: 'checking',
    onBudget: true,
    sortOrder: 0,
    closedAt: null,
    currency: 'EUR',
    openingDate: '2023-10-01',
  };
  const active = {
    id: '10000000-0000-4000-8000-000000000021',
    label: 'Bank A',
    status: 'active',
    bookedToLedger: false,
    validUntil: '2027-03-20T00:00:00Z',
    lastAttemptAt: '2026-10-09T02:30:00Z',
    lastSuccessAt: '2026-10-09T02:31:00Z',
    nextRunAt: '2026-10-10T02:30:00Z',
    manualBlockedReason: null,
    manualAvailableAt: null,
    running: false,
    accounts: [
      {
        id: sourceId,
        label: 'Konto A',
        currency: 'EUR',
        accountId: account.id,
        fromDate: '2026-09-01',
        locked: true,
        requestsToday: 2,
        requestLimit: 4,
        lastSyncAt: '2026-10-09T02:31:00Z',
        lastResult: { fetched: 8, linked: 5, new: 3 },
        open: 2,
        warnings: [
          {
            id: 'synthetic-warning',
            title: 'Bankstand ohne Stichtag',
            detail: 'Saldenvergleich nicht möglich.',
          },
        ],
      },
    ],
  };
  const limited = {
    ...active,
    id: '10000000-0000-4000-8000-000000000031',
    label: 'Bank B',
    status: 'error',
    manualBlockedReason: 'Tageslimit erreicht. Nächsten möglichen Abruf abwarten.',
    manualAvailableAt: '2026-10-09T22:00:00Z',
    accounts: [
      {
        ...active.accounts[0]!,
        id: '10000000-0000-4000-8000-000000000032',
        label: 'Konto B',
        requestsToday: 4,
        warnings: [],
      },
    ],
  };
  const paused = {
    ...limited,
    id: '10000000-0000-4000-8000-000000000041',
    label: 'Bank C',
    status: 'paused',
    manualBlockedReason: 'Verbindung pausiert. Bitte neu verbinden.',
    manualAvailableAt: null,
    accounts: [],
  };
  await page.route('**/api/bank-sync**', (route) =>
    route.fulfill({
      json:
        route.request().method() === 'GET'
          ? {
              configured: true,
              workerEnabled: true,
              accounts: [account],
              connections: [active, limited, paused],
            }
          : { queued: true },
    }),
  );
  await page.route(
    (url) => url.pathname === '/api/inbox',
    (route) =>
      route.fulfill({
        json: {
          asOf: '2026-10-09',
          count: 1,
          entries: [
            {
              type: 'stored',
              id: 'synthetic-source-task',
              kind: 'other',
              title: 'Aufgabe von Bank A',
              detail: 'Synthetische Prüfung',
              refType: null,
              refId: null,
              urgent: false,
              createdAt: '2026-10-09T02:31:00Z',
            },
          ],
        },
      }),
  );
  await page.goto('/einstellungen/datenquellen');
  const first = page.getByRole('region', { name: 'Bank A', exact: true });
  const second = page.getByRole('region', { name: 'Bank B', exact: true });
  const third = page.getByRole('region', { name: 'Bank C', exact: true });
  await expect(second.getByRole('button', { name: 'Jetzt abrufen' })).toBeDisabled();
  await expect(second.getByText('Konto B: 4/4')).toBeVisible();
  await expect(second.getByText('Tageslimit erreicht.', { exact: false })).toBeVisible();
  await expect(second.getByText('Pause bis', { exact: false })).toBeVisible();
  await expect(third.getByRole('button', { name: 'Jetzt abrufen' })).toBeDisabled();
  await expect(first.getByText('Bankstand ohne Stichtag', { exact: false })).toBeVisible();
  await expect(first.getByRole('button', { name: 'Zuordnung speichern' })).toBeDisabled();
  await expect(
    first.getByText('Zuordnung nach dem ersten Abruf gesperrt.', { exact: false }),
  ).toBeVisible();
  await expect(first.getByLabel('Gebuchte Umsätze')).toHaveValue('false');
  for (const [label, value] of [
    ['Abgerufen', '8'],
    ['Verknüpft', '5'],
    ['Neu vorgemerkt', '3'],
    ['Offen zur Prüfung', '2'],
  ]) {
    await expect(
      first
        .locator('.source-result div')
        .filter({ has: page.locator('dt', { hasText: label }) })
        .locator('dd'),
    ).toHaveText(value!);
  }
  await first.getByRole('button', { name: 'Jetzt abrufen' }).click();
  await expect(first.getByRole('status')).toContainText('Abruf vorgemerkt');
  await expect(second.getByText('Abruf vorgemerkt', { exact: false })).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const small = await page
      .locator(
        '.source-connection button, .source-connection input, .source-connection select, .source-connection a.btn',
      )
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => node.getBoundingClientRect().height < 44)
          .map((node) => node.textContent),
      );
    expect(small).toEqual([]);
    expect((await new AxeBuilder({ page }).include('.data-sources').analyze()).violations).toEqual(
      [],
    );
    await page.screenshot({
      path: `test-results/data-sources-cards-${info.project.name}-${theme}.png`,
      fullPage: true,
    });
  }
  const sourceRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/api/inbox' &&
      new URL(request.url()).searchParams.get('bankSource') === sourceId,
  );
  await first.getByRole('link', { name: 'Im Posteingang prüfen' }).click();
  await sourceRequest;
  await expect(page).toHaveURL(new RegExp('bankSource=' + sourceId));
  await expect(page.getByText('Aufgabe von Bank A')).toBeVisible();
  await page.getByRole('link', { name: 'Alle Aufgaben anzeigen', exact: true }).click();
  expect(new URL(page.url()).search).toBe('');
});

test('bank inbox suggestion requires an explicit posting decision', async ({ page }) => {
  const candidateId = '10000000-0000-4000-8000-000000000003';
  let confirmed = false;
  await page.route(
    (url) => url.pathname === '/api/inbox',
    (route) => {
      const entries = confirmed
        ? []
        : [
            {
              id: candidateId,
              type: 'stored',
              kind: 'import',
              title: 'Bankumsatz prüfen',
              detail: 'Girokonto A · 30.09.2026 · −12,01 € · Shop A',
              refType: 'bank-sync-candidate',
              refId: candidateId,
              urgent: false,
              createdAt: '2026-10-01T02:30:00Z',
            },
          ];
      const fixture = { asOf: '2026-10-01', count: entries.length, entries };
      const url = new URL(route.request().url());
      const limitText = url.searchParams.get('limit');
      if (limitText === null) return route.fulfill({ json: fixture });
      const limit = Number(limitText);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const countsByKind = entries.reduce<Record<string, number>>((counts, entry) => {
        counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
        return counts;
      }, {});
      const pageEntries = entries.slice(offset, offset + limit);
      return route.fulfill({
        json: {
          ...fixture,
          entries: pageEntries,
          totalEntries: entries.length,
          countsByKind,
          limit,
          offset,
          next: offset + pageEntries.length < entries.length ? offset + pageEntries.length : null,
        },
      });
    },
  );
  await page.route('**/api/bank-sync/candidates/**/matches', (route) =>
    route.fulfill({ json: { merge: [], transfers: [] } }),
  );
  await page.route('**/api/bank-sync/candidates/**/confirm', (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({
      categoryId: null,
      actions: { categoryId: null, payeeId: null },
      candidateRevision: 'a'.repeat(64),
    });
    confirmed = true;
    return route.fulfill({ json: { groupId: 'synthetic-confirm-group' } });
  });
  await page.route('**/api/assignment-rules/candidates/**', (route) =>
    route.fulfill({
      json: {
        candidate: { id: candidateId },
        candidateRevision: 'a'.repeat(64),
        cleanup: { cleaned: 'Shop A', payeeId: null, payeeName: null, learned: false },
        suggestions: [],
        existingTransfer: null,
      },
    }),
  );
  await page.goto('/konten/posteingang');
  await expect(page.getByText('Bankumsatz prüfen', { exact: true })).toBeVisible();
  expect(confirmed).toBe(false);
  await expect(page.getByRole('button', { name: 'Nicht übernehmen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Als Buchung bestätigen' }).click();
  await expect(page.getByText('Posteingang leer.', { exact: false })).toBeVisible();
  expect(confirmed).toBe(true);
});
