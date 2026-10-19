import AxeBuilder from '@axe-core/playwright';
import { createBooking, openDatabase } from '@budget/db';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2024-03-05' });

function seed(path: string) {
  const opened = openDatabase(path);
  try {
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date)
      VALUES ('budget','Synthetic checking','checking','budget',1,'2024-01-01');
      INSERT INTO category_group (id,name) VALUES ('g','Synthetic group');
      INSERT INTO category (id,group_id,name,class,kind)
      VALUES ('a','g','Muster; "Ö"','want','variable'), ('b','g',char(9)||'=SUM(1;2)','want','variable');
    `);
    for (const [categoryId, date, amountCents] of [
      ['a', '2024-01-15', -1234],
      ['a', '2024-02-15', 234],
      ['b', '2024-02-16', -100],
    ] as const)
      createBooking(
        opened.db,
        { accountId: 'budget', date, amountCents, splits: [{ categoryId, amountCents }] },
        { actor: 'synthetic-fixture' },
      );
  } finally {
    opened.close();
  }
}

async function inspectFocus(page: Page, info: TestInfo, stage: string) {
  await info.attach(`explorer-focus-${stage}.json`, {
    body: JSON.stringify(
      await page.evaluate(() => {
        const skipLink = document.querySelector('.skip-link');
        const bounds = skipLink?.getBoundingClientRect();
        return {
          tag: document.activeElement?.tagName ?? null,
          id: document.activeElement?.id ?? null,
          text: document.activeElement?.textContent?.trim().slice(0, 120) ?? null,
          scrollY,
          skipLink:
            skipLink && bounds
              ? {
                  focused: skipLink.matches(':focus'),
                  top: bounds.top,
                  bottom: bounds.bottom,
                  transform: getComputedStyle(skipLink).transform,
                }
              : null,
        };
      }),
    ),
    contentType: 'application/json',
  });
}

async function download(page: Page, info: TestInfo, stage: string): Promise<string> {
  const pending = page.waitForEvent('download');
  await inspectFocus(page, info, `${stage}-before-click`);
  await page.getByRole('button', { name: 'CSV exportieren', exact: true }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe('explorer-2024-01-2024-02.csv');
  const path = await file.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  await inspectFocus(page, info, `${stage}-after-download`);
  expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
  return bytes.toString('utf8');
}

async function inspect(page: Page, info: TestInfo) {
  await page.goto('/reports/explorer');
  const exportButton = page.getByRole('button', { name: 'CSV exportieren', exact: true });
  await expect(exportButton).toBeEnabled();
  for (const [name, field, value] of [
    ['Spalten', 'cols', 'monat'],
    ['Zeitraum', 'period', '3M'],
  ] as const) {
    const fresh = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/api/overview/explorer' &&
        url.searchParams.get(field) === value &&
        response.status() === 200
      );
    });
    await page.getByLabel(name, { exact: true }).selectOption(value);
    await fresh;
    await expect(exportButton).toBeEnabled();
  }
  await expect(page.getByTestId('ex-table').locator('tbody tr')).toHaveCount(3);
  const csv = await download(page, info, 'initial');
  expect(csv).toContain(';"row_key";"Kategorie";"Jän 24";"Feb 24";"Gesamt"\r\n');
  expect(csv).toContain(';"a";"Muster; ""Ö""";1234;-234;1000\r\n');
  expect(csv).toContain(';"b";"\'\t=SUM(1;2)";0;100;100\r\n');
  expect(csv).toContain(';"";"Summe";1234;-134;1100\r\n');
  expect(csv).toContain(';"summe";"cents";0;');
  await info.attach('explorer-csv-browser-profile.json', {
    body: JSON.stringify({
      engine: page.context().browser()?.browserType().name(),
      version: page.context().browser()?.version(),
      ...(await page.evaluate(() => ({
        width: innerWidth,
        coarsePointer: matchMedia('(pointer: coarse)').matches,
        touchPoints: navigator.maxTouchPoints,
        pixelRatio: devicePixelRatio,
      }))),
    }),
    contentType: 'application/json',
  });
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished),
      );
    });
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const box = await exportButton.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await inspectFocus(page, info, `before-${colorScheme}-png`);
    await page.screenshot({
      path: info.outputPath(`explorer-csv-${colorScheme}.png`),
      fullPage: true,
    });
  }
}

test('Explorer downloads the exact current CSV and refuses a real concurrent ledger change', async ({
  page,
  isolatedLedger,
}, info) => {
  seed(isolatedLedger.databasePath);
  await inspect(page, info);
  const downloads: string[] = [];
  page.on('download', (file) => downloads.push(file.suggestedFilename()));
  // The table remains the old authenticated read. A real ledger write lands just before CSV recomputation.
  await page.route(
    '**/api/overview/explorer.csv?**',
    async (route) => {
      const write = await page.request.post('/api/bookings', {
        headers: { Origin: isolatedLedger.origin },
        data: {
          type: 'booking',
          accountId: 'budget',
          date: '2024-01-20',
          amountCents: -1,
          splits: [{ categoryId: 'a', amountCents: -1 }],
        },
      });
      expect(write.status()).toBe(201);
      await route.continue();
    },
    { times: 1 },
  );
  await page.getByRole('button', { name: 'CSV exportieren', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Die Daten haben sich geändert.');
  expect(downloads).toEqual([]);
  await expect(page.getByLabel('Spalten', { exact: true })).toHaveValue('monat');
  await expect(page.getByTestId('ex-table').locator('tbody tr')).toHaveCount(3);
  const fresh = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/overview/explorer' && response.status() === 200,
  );
  await page.getByRole('button', { name: 'Auswertung neu laden' }).click();
  await fresh;
  await expect(page.getByRole('button', { name: 'CSV exportieren', exact: true })).toBeEnabled();
  const refreshed = await download(page, info, 'retry');
  expect(refreshed).toContain(';"a";"Muster; ""Ö""";1235;-234;1001\r\n');
  expect(refreshed).toContain(';"";"Summe";1235;-134;1101\r\n');
});

test('Explorer CSV matches the same table in a true 1440px desktop context', async ({
  browser,
  isolatedLedger,
}, info) => {
  seed(isolatedLedger.databasePath);
  const desktop = await browser.newContext({
    baseURL: isolatedLedger.origin,
    storageState: isolatedLedger.storageState,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    serviceWorkers: 'block',
  });
  try {
    const page = await desktop.newPage();
    await page.clock.setFixedTime(new Date('2024-03-05T12:00:00+01:00'));
    expect(
      await page.evaluate(() => ({
        width: innerWidth,
        coarsePointer: matchMedia('(pointer: coarse)').matches,
        touchPoints: navigator.maxTouchPoints,
        pixelRatio: devicePixelRatio,
      })),
    ).toEqual({ width: 1440, coarsePointer: false, touchPoints: 0, pixelRatio: 1 });
    await inspect(page, info);
  } finally {
    await desktop.close();
  }
});
