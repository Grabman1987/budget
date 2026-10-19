import AxeBuilder from '@axe-core/playwright';
import { createBooking, openDatabase } from '@budget/db';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-09-17' });
const templates = [
  ['heatmap', 'Heatmap Ausgaben'],
  ['year', 'Jahresansicht'],
  ['total', 'Gesamttabelle'],
  ['category', 'Kategorie im Verlauf'],
] as const;

function seed(path: string) {
  const opened = openDatabase(path);
  try {
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date) VALUES
        ('budget','Synthetic checking','checking','budget',1,'2023-10-01');
      INSERT INTO category_group (id,name) VALUES ('g','Synthetic group');
      INSERT INTO category (id,group_id,name,class,kind) VALUES
        ('food','g','Lebensmittel','need','variable'),
        ('fun','g','Freizeit','want','variable'),
        ('saving','g','Rücklage','future','invest');
    `);
    const book = (
      date: string,
      cents: number,
      splits: { amountCents: number; categoryId?: string; incomeTypeId?: string }[],
    ) =>
      createBooking(
        opened.db,
        { accountId: 'budget', date, amountCents: cents, incomeNextMonth: false, splits },
        { actor: 'synthetic-fixture' },
      );
    book('2026-07-02', 10001, [{ amountCents: 10001, incomeTypeId: 'income-salary' }]);
    book('2026-07-03', 777, [{ amountCents: 777, incomeTypeId: 'income-capital' }]);
    book('2026-07-04', -1502, [
      { amountCents: -1001, categoryId: 'food' },
      { amountCents: -501, categoryId: 'fun' },
    ]);
    book('2026-07-05', -2000, [{ amountCents: -2000, categoryId: 'saving' }]);
    book('2026-08-02', 20002, [{ amountCents: 20002, incomeTypeId: 'income-salary' }]);
    const out = book('2026-08-03', -2002, [{ amountCents: -2002, categoryId: 'food' }]);
    const refund = book('2026-08-04', 1, [{ amountCents: 1, categoryId: 'food' }]);
    book('2026-08-05', -1000, [{ amountCents: -1000, categoryId: 'fun' }]);
    book('2026-08-06', -3000, [{ amountCents: -3000, categoryId: 'saving' }]);
    book('2026-09-02', 30003, [{ amountCents: 30003, incomeTypeId: 'income-salary' }]);
    book('2026-09-04', -700, [{ amountCents: -700, categoryId: 'food' }]);
    return { out: out.id, refund: refund.id };
  } finally {
    opened.close();
  }
}
function financialFingerprint(path: string) {
  const opened = openDatabase(path);
  try {
    const rows = {
      booking: opened.sqlite.prepare('SELECT * FROM booking ORDER BY id').all(),
      splits: opened.sqlite.prepare('SELECT * FROM booking_split ORDER BY id').all(),
      audit: opened.sqlite
        .prepare(
          "SELECT * FROM audit_log WHERE entity_type IN ('booking','booking_split') ORDER BY id",
        )
        .all(),
    };
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  } finally {
    opened.close();
  }
}
async function theme(page: Page, value: 'light' | 'dark') {
  const phone = page.viewportSize()!.width === 390;
  if (phone) {
    const summary = page.locator('.m-profile > summary');
    await summary.tap();
    await page
      .locator('.m-profile')
      .getByRole('button', {
        name: value === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
        exact: true,
      })
      .tap();
    await summary.tap();
  } else
    await page
      .locator('.sidebar-foot')
      .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true })
      .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', value);
  await expect
    .poll(() =>
      page
        .locator('.ex-template-table .table-cell-open')
        .first()
        .evaluate((element) => getComputedStyle(element).color),
    )
    .toBe(value === 'dark' ? 'rgb(238, 246, 252)' : 'rgb(11, 27, 51)');
}
async function inspect(
  page: Page,
  info: TestInfo,
  id: (typeof templates)[number][0],
  ids: ReturnType<typeof seed>,
) {
  await page.addInitScript(() => localStorage.setItem('budget-theme', 'light'));
  await page.goto(
    `/reports/explorer?vorlage=${id}&zeitraum=${id === 'total' ? '3J' : id === 'year' ? 'YTD' : '1J'}&kategorien=%5B%22food%22%5D`,
  );
  const panel = page.getByTestId(`template-${id}`);
  await expect(panel).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const food = panel.locator('[data-template-row="cat:food"]');
  const monthly = food.getByRole('button', { name: /^Lebensmittel · August 2026 · 20,01 €/ });
  await expect(monthly).toHaveCount(1);
  if (id === 'heatmap') await expect(panel.locator('thead th')).toHaveCount(14);
  if (id === 'year') {
    await expect(panel.locator('thead th')).toHaveCount(15);
    await expect(food.locator('td').last()).toHaveText('3,75 €');
  }
  if (id === 'total') {
    await expect(panel.locator('thead th')).toHaveCount(37);
    await expect(panel.locator('[data-template-row="inc"]')).toContainText('200,02 €');
    await expect(panel.locator('[data-template-row="future"]')).toContainText('30,00 €');
    await expect(panel).toContainText('läuft noch');
  }
  if (id === 'category') {
    await expect(panel.locator('.ex-template-trend .l-actual')).toHaveCount(1);
    await expect(panel.locator('.ex-template-trend .l-prev')).toHaveCount(1);
    await expect(panel.locator('.ex-template-trend')).toContainText('Ø je Monat: 2,50 €');
    const chart = panel.locator('.chart-interactive').first();
    await chart.focus();
    for (let index = 0; index < 12; index++) await chart.press('ArrowRight');
    await expect(page.getByRole('status')).toContainText('20,01 €');
    await chart.evaluate((element) => (element as HTMLElement).blur());
  }
  await monthly.click();
  const detail = page.getByTestId('template-sources');
  await expect(detail).toContainText('Gewählte Zelle: 20,01 €');
  await expect(detail).toContainText('Summe der zugeordneten Anteile: 20,01 €');
  await expect(detail).toContainText('20,02 €');
  await expect(detail).toContainText('−0,01 €');
  const links = detail.getByRole('link');
  await expect(links).toHaveCount(2);
  const selectedIds = await links.evaluateAll((elements) =>
    elements.map((element) =>
      new URL((element as HTMLAnchorElement).href).searchParams.get('buchung'),
    ),
  );
  expect(selectedIds).toEqual([ids.out, ids.refund]);
  await page.reload();
  await expect(page.getByTestId('template-sources')).toContainText('20,01 €');
  await page.getByTestId('template-sources').getByRole('link').first().click();
  await expect(page.locator('[data-booking]')).toHaveCount(1);
  await expect(page.locator(`[data-booking="${ids.out}"]`)).toContainText('−20,02');
  await page.goBack();
  await expect(page.getByTestId('template-sources')).toBeVisible();
  await page.getByRole('button', { name: 'Buchungen schließen' }).click();
  await expect(detail).toHaveCount(0);
  const measurements = [];
  for (const value of ['dark', 'light'] as const) {
    await theme(page, value);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    const scroll = panel.locator('.ex-template-scroll');
    await scroll.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    const farControl =
      id === 'total'
        ? food.getByRole('button', { name: /^Lebensmittel · September 2026 · 7,00 €/ })
        : food.getByRole('button', { name: 'Lebensmittel · Summe · 30,02 €', exact: true });
    await farControl.click();
    await expect(page.getByTestId('template-sources')).toContainText(
      id === 'total' ? 'Gewählte Zelle: 7,00 €' : 'Gewählte Zelle: 30,02 €',
    );
    await page.getByRole('button', { name: 'Buchungen schließen' }).click();
    const bounds = await scroll.evaluate((element) => {
      const r = element.getBoundingClientRect();
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        scrollLeft: element.scrollLeft,
        left: r.left,
        right: r.right,
      };
    });
    expect(bounds.scrollWidth).toBeGreaterThanOrEqual(bounds.clientWidth);
    if (page.viewportSize()!.width === 390 || id === 'total')
      expect(bounds.scrollWidth).toBeGreaterThan(bounds.clientWidth);
    if (bounds.scrollWidth > bounds.clientWidth) expect(bounds.scrollLeft).toBeGreaterThan(0);
    if (page.viewportSize()!.width === 390) {
      const targets = await panel.locator('button, a').evaluateAll((elements) =>
        elements
          .map((element) => {
            const r = element.getBoundingClientRect();
            return { width: r.width, height: r.height };
          })
          .filter((r) => r.width > 0 && r.height > 0),
      );
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
      }
    }
    await scroll.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({
      path: info.outputPath(`${id}-${page.viewportSize()!.width}-${value}.png`),
      fullPage: true,
    });
    measurements.push({
      id,
      theme: value,
      engine: page.context().browser()!.browserType().name(),
      version: page.context().browser()!.version(),
      bounds,
      ...(await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        pixelRatio: devicePixelRatio,
        coarse: matchMedia('(pointer: coarse)').matches,
        touchPoints: navigator.maxTouchPoints,
        theme: document.documentElement.dataset['theme'],
      }))),
    });
  }
  await writeFile(
    info.outputPath(`template-${id}-profile.json`),
    JSON.stringify(measurements, null, 2),
  );
}

for (const [id, label] of templates) {
  test(`${label}: exact contributions, real scrolling and configured viewport light/dark`, async ({
    page,
    isolatedLedger,
  }, info) => {
    const ids = seed(isolatedLedger.databasePath);
    const before = financialFingerprint(isolatedLedger.databasePath);
    await inspect(page, info, id, ids);
    expect(financialFingerprint(isolatedLedger.databasePath)).toBe(before);
  });
  test(`${label}: actual 1440px desktop light/dark and unchanged raw finance`, async ({
    browser,
    isolatedLedger,
  }, info) => {
    const ids = seed(isolatedLedger.databasePath);
    const before = financialFingerprint(isolatedLedger.databasePath);
    const context = await browser.newContext({
      baseURL: isolatedLedger.origin,
      storageState: isolatedLedger.storageState,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    try {
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date('2026-09-17T12:00:00+02:00'));
      await inspect(page, info, id, ids);
      expect(
        await page.evaluate(() => ({
          width: innerWidth,
          coarse: matchMedia('(pointer: coarse)').matches,
          touchPoints: navigator.maxTouchPoints,
          pixelRatio: devicePixelRatio,
        })),
      ).toEqual({ width: 1440, coarse: false, touchPoints: 0, pixelRatio: 1 });
      expect(financialFingerprint(isolatedLedger.databasePath)).toBe(before);
    } finally {
      await context.close();
    }
  });
}

test('saved custom view and exact627 CSV survive fixed-template use with grouped undo', async ({
  page,
  isolatedLedger,
}) => {
  seed(isolatedLedger.databasePath);
  const before = financialFingerprint(isolatedLedger.databasePath);
  await page.goto('/reports/explorer');
  await page.getByLabel('Ansicht speichern').fill('625 Eigene Ansicht');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  const view = page.getByRole('button', { name: '625 Eigene Ansicht', exact: true });
  await expect(view).toBeVisible();
  const saved = (await (await page.request.get('/api/reports/saved-queries')).json()) as {
    views: { name: string; query: Record<string, unknown> }[];
  };
  expect(
    Object.keys(saved.views.find((entry) => entry.name === '625 Eigene Ansicht')!.query).sort(),
  ).toEqual(['cls', 'cols', 'dim', 'meas', 'period']);
  await page.getByRole('button', { name: 'Heatmap Ausgaben', exact: true }).click();
  await expect(page.getByTestId('template-heatmap')).toBeVisible();
  await view.click();
  await expect(page.getByLabel('Klasse', { exact: true })).toHaveValue('want');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV exportieren', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('explorer-2026-07-2026-08.csv');
  const bytes = await readFile((await download.path())!);
  expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
  expect(bytes.toString('utf8')).toContain(';"fun";"Freizeit";1501\r\n');
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(view).toHaveCount(0);
  await page.reload();
  await expect(view).toHaveCount(0);
  expect(financialFingerprint(isolatedLedger.databasePath)).toBe(before);
});
