import AxeBuilder from '@axe-core/playwright';
import { inboxItem, insertTracked, openDatabase, receipt } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

const pageTitles = Array.from(
  { length: 301 },
  (_, index) => `Page${String(index).padStart(3, '0')}`,
);

test('global inbox loads bounded API pages and keeps total and kind counts', async ({
  page,
  isolatedLedger,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    for (let index = 0; index < pageTitles.length; index++) {
      const minute = String(Math.floor(index / 60)).padStart(2, '0');
      const second = String(index % 60).padStart(2, '0');
      insertTracked(
        opened.db,
        inboxItem,
        {
          id: `pagination-${String(index).padStart(3, '0')}`,
          kind: index < 150 ? 'import' : 'other',
          title: pageTitles[index]!,
          createdAt: `2026-10-01T00:${minute}:${second}.000Z`,
        },
        { actor: 'e2e' },
      );
    }
    // Synthetic receipt metadata only. It contributes to the badge count, never to task pages.
    insertTracked(
      opened.db,
      receipt,
      {
        id: 'pagination-unlinked-receipt',
        storageKey: 'synthetic-pagination-no-file',
        mime: 'image/png',
        sizeBytes: 1,
        sha256: 'a'.repeat(64),
        originalFilename: 'synthetic-pagination.png',
      },
      { actor: 'e2e' },
    );
  } finally {
    opened.close();
  }

  const requests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/inbox') requests.push(url.href);
  });
  const firstInboxResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.ok() && url.pathname === '/api/inbox';
  });
  const inboxPageResponse = (offset: number) =>
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.ok() &&
        url.pathname === '/api/inbox' &&
        url.searchParams.get('limit') === '100' &&
        url.searchParams.get('offset') === String(offset)
      );
    });

  await page.goto('/konten/posteingang');
  const firstResponse = await firstInboxResponse;
  const firstUrl = new URL(firstResponse.url());
  expect(firstUrl.searchParams.get('limit')).toBe('100');
  expect(firstUrl.searchParams.get('offset')).toBe('0');
  const rows = page.getByTestId('inbox-row');
  await expect(rows).toHaveCount(100);
  await expect(page.locator('.kinbox').getByText('302 offen', { exact: true })).toBeVisible();
  await expect(rows.locator('strong')).toHaveText(pageTitles.slice(0, 100));
  const firstGroupHeadings = await page.locator('.kinbox tr.kgroup').allTextContents();
  expect(firstGroupHeadings.join(' ')).toContain('Datenprüfung 150');
  expect(firstGroupHeadings.join(' ')).not.toContain('Weitere Aufgaben');
  await expect(
    page.getByRole('button', { name: 'Weitere anzeigen (201 von 301 noch verborgen)' }),
  ).toBeVisible();

  for (const [offset, loaded] of [
    [100, 200],
    [200, 300],
    [300, 301],
  ] as const) {
    const more = page.getByRole('button', { name: /Weitere anzeigen/ });
    const box = await more.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    const nextPage = inboxPageResponse(offset);
    if (offset === 100) await more.dblclick({ delay: 0 });
    else await more.click();
    await nextPage;
    await expect(rows).toHaveCount(loaded);
    await expect(rows.locator('strong')).toHaveText(pageTitles.slice(0, loaded));
    if (offset === 100) {
      const loadedGroupHeadings = await page.locator('.kinbox tr.kgroup').allTextContents();
      expect(loadedGroupHeadings.join(' ')).toContain('Datenprüfung 150');
      expect(loadedGroupHeadings.join(' ')).toContain('Weitere Aufgaben 151');
    }
  }

  expect(
    requests.map((value) => {
      const url = new URL(value);
      return [url.searchParams.get('limit'), url.searchParams.get('offset')];
    }),
  ).toEqual([
    ['100', '0'],
    ['100', '100'],
    ['100', '200'],
    ['100', '300'],
  ]);
  await expect(rows).toHaveCount(301);
  await expect(page.getByRole('button', { name: /Weitere anzeigen/ })).toHaveCount(0);
  await expect(page.locator('.kgcount')).toHaveText(['150', '151']);
  await expect(rows.locator('strong')).toHaveText(pageTitles);

  const lastTask = rows.filter({ hasText: pageTitles[300]! });
  const resolveResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === 'POST' &&
      response.ok() &&
      url.pathname === '/api/inbox/pagination-300/resolve'
    );
  });
  await lastTask.getByRole('button', { name: 'Als erledigt markieren' }).click();
  await resolveResponse;
  await expect(rows).toHaveCount(300);
  await expect(page.locator('.kgcount')).toHaveText(['150', '150']);
  await expect(page.locator('.kinbox').getByText('301 offen', { exact: true })).toBeVisible();

  const undoResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'POST' && response.ok() && url.pathname === '/api/undo';
  });
  await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
  await undoResponse;
  await expect(rows).toHaveCount(300);
  await expect(page.locator('.kgcount')).toHaveText(['150', '151']);
  await expect(page.locator('.kinbox').getByText('302 offen', { exact: true })).toBeVisible();
  await expect(rows.locator('strong')).toHaveText(pageTitles.slice(0, 300));
  await expect(rows.filter({ hasText: pageTitles[300]! })).toHaveCount(0);
  const restoredLastPage = inboxPageResponse(300);
  await page.getByRole('button', { name: 'Weitere anzeigen (1 von 301 noch verborgen)' }).click();
  await restoredLastPage;
  await expect(rows).toHaveCount(301);
  await expect(rows.locator('strong')).toHaveText(pageTitles);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));

  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate(() => document.fonts.ready);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(
      axe.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      ),
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`inbox-pagination-${info.project.name}-${theme}.png`),
    });
  }
});

test('month close filters the complete inbox beyond the global first page', async ({
  page,
  isolatedLedger,
}) => {
  const opened = openDatabase(isolatedLedger.databasePath);
  const expectedTitles = ['Filtered task 299', 'Filtered task 300'];
  try {
    for (let index = 0; index < 301; index++) {
      const minute = String(Math.floor(index / 60)).padStart(2, '0');
      const second = String(index % 60).padStart(2, '0');
      const date = index < 299 ? '2026-08-31' : '2026-09-30';
      insertTracked(
        opened.db,
        inboxItem,
        {
          id: `filtered-page-${String(index).padStart(3, '0')}`,
          kind: 'other',
          title: `Filtered task ${String(index).padStart(3, '0')}`,
          createdAt: `${date}T00:${minute}:${second}.000Z`,
        },
        { actor: 'e2e' },
      );
    }
  } finally {
    opened.close();
  }

  const firstGlobalPage = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.ok() &&
      url.pathname === '/api/inbox' &&
      url.searchParams.get('limit') === '100' &&
      url.searchParams.get('offset') === '0'
    );
  });
  await page.goto('/konten/posteingang');
  await firstGlobalPage;
  await expect(page.getByTestId('inbox-row')).toHaveCount(100);
  for (const title of expectedTitles)
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);

  await page.goto('/plan/monat?monat=2026-09');
  const unpagedInbox = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.ok() && url.pathname === '/api/inbox' && url.search === '';
  });
  await page
    .getByRole('link', { name: 'Monatsabschluss starten oder fortsetzen', exact: true })
    .click();
  const unpagedResponse = await unpagedInbox;
  const wholeQueue = (await unpagedResponse.json()) as {
    count: number;
    entries: Array<{ id: string }>;
  };
  expect(wholeQueue.count).toBe(301);
  expect(wholeQueue.entries).toHaveLength(301);

  await expect(
    page.getByRole('heading', { name: 'Monatsabschluss · September 2026', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '1. Posteingang leeren' })).toBeVisible();
  const rows = page.getByTestId('inbox-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.locator('strong')).toHaveText(expectedTitles);
  await expect(page.locator('.kinbox').getByText('2 offen', { exact: true })).toBeVisible();
  await expect(page.locator('.kinbox .kgcount')).toHaveText('2');
  await expect(page.locator('.receipt-section')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Weitere anzeigen/ })).toHaveCount(0);
});

test('failed next inbox page keeps loaded rows and retries the same offset', async ({ page }) => {
  const entries = Array.from({ length: 101 }, (_, index) => ({
    type: 'stored',
    id: `retry-page-${String(index).padStart(3, '0')}`,
    kind: 'other',
    title: `Retry page ${String(index).padStart(3, '0')}`,
    detail: null,
    refType: null,
    refId: null,
    urgent: false,
    createdAt: `2026-10-01T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
  }));
  const offsets: number[] = [];
  let offset100Attempts = 0;

  await page.route(
    (url) => url.pathname === '/api/inbox',
    async (route) => {
      const url = new URL(route.request().url());
      const limit = Number(url.searchParams.get('limit'));
      const offset = Number(url.searchParams.get('offset') ?? 0);
      offsets.push(offset);

      if (offset === 100 && offset100Attempts++ === 0)
        return route.fulfill({ status: 503, json: { error: 'unavailable' } });

      const pageEntries = entries.slice(offset, offset + limit);
      return route.fulfill({
        json: {
          asOf: '2026-10-02',
          count: entries.length,
          entries: pageEntries,
          totalEntries: entries.length,
          countsByKind: { other: entries.length },
          limit,
          offset,
          next: offset + pageEntries.length < entries.length ? offset + pageEntries.length : null,
        },
      });
    },
  );

  const firstPageResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.ok() &&
      url.pathname === '/api/inbox' &&
      url.searchParams.get('limit') === '100' &&
      url.searchParams.get('offset') === '0'
    );
  });
  await page.goto('/konten/posteingang');
  await firstPageResponse;

  const rows = page.getByTestId('inbox-row');
  const firstHundredTitles = entries.slice(0, 100).map((entry) => entry.title);
  await expect(rows).toHaveCount(100);
  await expect(rows.locator('strong')).toHaveText(firstHundredTitles);
  await expect(page.locator('.kinbox').getByText('101 offen', { exact: true })).toBeVisible();
  await expect(page.locator('.kinbox .kgcount')).toHaveText('101');

  const failedPage = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.status() === 503 &&
      url.pathname === '/api/inbox' &&
      url.searchParams.get('limit') === '100' &&
      url.searchParams.get('offset') === '100'
    );
  });
  await page.getByRole('button', { name: 'Weitere anzeigen (1 von 101 noch verborgen)' }).click();
  await failedPage;

  const pageError = page
    .getByRole('alert')
    .filter({ hasText: 'weitere Aufgaben konnten nicht geladen werden.' });
  await expect(pageError).toBeVisible();
  await expect(
    pageError.getByRole('button', { name: 'Erneut versuchen', exact: true }),
  ).toBeVisible();
  await expect(rows).toHaveCount(100);
  await expect(rows.locator('strong')).toHaveText(firstHundredTitles);
  await expect(page.locator('.kinbox').getByText('101 offen', { exact: true })).toBeVisible();
  await expect(page.locator('.kinbox .kgcount')).toHaveText('101');

  const retriedPage = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.ok() &&
      url.pathname === '/api/inbox' &&
      url.searchParams.get('limit') === '100' &&
      url.searchParams.get('offset') === '100'
    );
  });
  await pageError.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  await retriedPage;

  await expect(rows).toHaveCount(101);
  await expect(rows.locator('strong')).toHaveText(entries.map((entry) => entry.title));
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Weitere anzeigen/ })).toHaveCount(0);
  expect(offsets).toEqual([0, 100, 100]);
});
