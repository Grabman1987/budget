import { withShellControls } from './shell-actions';
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
    return { out, refund };
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
    await withShellControls(
      page,
      async ({ theme: control }) => {
        await expect(control).toHaveAccessibleName(
          value === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
        );
        await control.tap();
      },
      true,
    );
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
  themeValues: readonly ('dark' | 'light')[] = ['dark', 'light'],
) {
  const closeObservation = await observe625Close(page);
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
    await expect(page.locator('.chart-tooltip[role="status"]')).toContainText('20,01 €');
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
  const closeGeometry: Record<string, unknown>[] = [];
  const snapshotClose = async (phase: string) => {
    try {
      closeGeometry.push({ phase, observedAt: Date.now(), ...(await safe625HitGeometry(page)) });
    } catch (error) {
      closeGeometry.push({
        phase,
        diagnosticError: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  };
  try {
    await snapshotClose('before-close-click');
    await expect625CloseHit(page, info, id, 'return-from-booking');
    await page.getByRole('button', { name: 'Buchungen schließen' }).click();
    await snapshotClose('after-close-click-resolved');
    await expect(detail).toHaveCount(0);
  } finally {
    try {
      await snapshotClose('after-original-assertion-or-failure');
      const browser = page.context().browser();
      const evidence = {
        metadata: {
          project: info.project.name,
          template: id,
          browser: browser?.browserType().name() ?? null,
          browserVersion: browser?.version() ?? null,
          viewport: page.viewportSize(),
          projectConfiguredIsMobile: info.project.use.isMobile ?? false,
          projectConfiguredHasTouch: info.project.use.hasTouch ?? false,
          projectConfiguredDeviceScaleFactor: info.project.use.deviceScaleFactor ?? null,
        },
        closeGeometry,
        events: closeObservation,
        final: await safe625Location(page),
      };
      const path = info.outputPath('625-safe-close-chronology.json');
      await writeFile(path, JSON.stringify(evidence, null, 2));
      await info.attach('625-safe-close-chronology', { path, contentType: 'application/json' });
      console.info('625-safe-close-chronology', JSON.stringify(evidence));
    } catch (error) {
      // Optional diagnosis must never replace the original click/assertion failure.
      console.info(
        '625-close-diagnostic-unavailable',
        error instanceof Error ? error.name : 'UnknownError',
      );
    }
  }
  // Preserve the original dark-to-light transition in the isolated light case.
  if (themeValues.length === 1 && themeValues[0] === 'light') await theme(page, 'dark');
  const measurements = [];
  for (const value of themeValues) {
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
    const closeInputMarker = closeObservation.length;
    closeObservation.push({
      observedAt: Date.now(),
      channel: 'test-marker',
      template: id,
      theme: value,
      event: 'before-original-far-close',
    });
    try {
      await page.getByRole('button', { name: 'Buchungen schließen' }).click();
      await expect(page.getByTestId('template-sources')).toHaveCount(0);
    } finally {
      try {
        const path = info.outputPath(
          `625-close-input-attempt-${id}-${page.viewportSize()!.width}-${value}.json`,
        );
        await writeFile(
          path,
          JSON.stringify(
            {
              project: info.project.name,
              template: id,
              theme: value,
              markerIndex: closeInputMarker,
              eventsAfterMarker: closeObservation.slice(closeInputMarker + 1),
            },
            null,
            2,
          ),
        );
        await info.attach(`625-close-input-attempt-${id}-${value}`, {
          path,
          contentType: 'application/json',
        });
      } catch (error) {
        console.info(
          '625-close-input-attempt-unavailable',
          error instanceof Error ? error.name : 'UnknownError',
        );
      }
    }
    const closeInput = await expect625CloseInput(
      page,
      info,
      id,
      value,
      closeObservation,
      closeInputMarker,
    );
    let keyboardHeaderHit = null;
    let keyboardHeaderHitAfterCapture = null;
    if (id === 'heatmap') {
      // The original mouse flow above is independent. This additional real keyboard cycle
      // captures the OPEN header after natural Tab focus, without test scrolling or focus calls.
      await expect(farControl).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(
        page.getByTestId('template-sources').getByRole('heading', { level: 3 }),
      ).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Buchungen schließen' })).toBeFocused();
      keyboardHeaderHit = await expect625CloseHit(page, info, id, `${value}-keyboard`);
      await page.screenshot({
        path: info.outputPath(`source-header-heatmap-${page.viewportSize()!.width}-${value}.png`),
        fullPage: false,
      });
      keyboardHeaderHitAfterCapture = await expect625CloseHit(
        page,
        info,
        id,
        `${value}-keyboard-after-capture`,
      );
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('template-sources')).toHaveCount(0);
      await expect(farControl).toBeFocused();
    }
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
      closeInput,
      keyboardHeaderHit,
      keyboardHeaderHitAfterCapture,
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
  if (id === 'total') {
    for (const value of ['dark', 'light'] as const) {
      test(`${label}: exact contributions, real scrolling and configured viewport ${value}`, async ({
        page,
        isolatedLedger,
      }, info) => {
        const ids = seed(isolatedLedger.databasePath);
        const before = financialFingerprint(isolatedLedger.databasePath);
        await inspect(page, info, id, ids, [value]);
        expect(financialFingerprint(isolatedLedger.databasePath)).toBe(before);
      });
    }
  } else {
    test(`${label}: exact contributions, real scrolling and configured viewport light/dark`, async ({
      page,
      isolatedLedger,
    }, info) => {
      const ids = seed(isolatedLedger.databasePath);
      const before = financialFingerprint(isolatedLedger.databasePath);
      await inspect(page, info, id, ids);
      expect(financialFingerprint(isolatedLedger.databasePath)).toBe(before);
    });
  }
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

/** Passive CI diagnosis only: no navigation/fetch override, focus mutation or input synthesis. */
/** Verify the real unforced mouse flow at input time, after any browser-native autoscroll. */
async function expect625CloseInput(
  page: Page,
  info: TestInfo,
  template: string,
  theme: string,
  events: Record<string, unknown>[],
  markerIndex: number,
) {
  const types = ['pointerdown', 'pointerup', 'click'];
  const inputs = () =>
    events
      .slice(markerIndex + 1)
      .filter(
        (event) =>
          event.channel === 'dom' &&
          event.trusted === true &&
          (event.target as { kind?: unknown } | undefined)?.kind === 'close' &&
          types.includes(String(event.event)),
      );
  try {
    // Waiting for observed input transport is an assertion with the unchanged default budget;
    // no synthetic input, scrolling, arbitrary delay or locator retry is introduced here.
    await expect
      .poll(() => types.every((type) => inputs().some((event) => event.event === type)))
      .toBe(true);
    const actual = inputs();
    const indices = types.map((type) => actual.findIndex((event) => event.event === type));
    expect(indices[0]).toBeGreaterThanOrEqual(0);
    expect(indices[1]).toBeGreaterThan(indices[0]!);
    expect(indices[2]).toBeGreaterThan(indices[1]!);
    for (const type of types) {
      const event = actual.find((candidate) => candidate.event === type)!;
      const geometry = event.geometry as Awaited<ReturnType<typeof safe625HitGeometry>>;
      expect(geometry).toBeDefined();
      expect(geometry.closeConnected).toBe(true);
      const rect = geometry.closeRect;
      expect(rect).not.toBeNull();
      expect(rect!.width).toBeGreaterThanOrEqual(44);
      expect(rect!.height).toBeGreaterThanOrEqual(44);
      expect(rect!.left).toBeGreaterThanOrEqual(0);
      expect(rect!.right).toBeLessThanOrEqual(geometry.layoutViewport.width);
      expect(rect!.top).toBeGreaterThanOrEqual(0);
      expect(rect!.bottom).toBeLessThanOrEqual(
        geometry.tabbarRect?.top ?? geometry.layoutViewport.height,
      );
      expect(geometry.centerHit?.elements[0]?.close).toBe(true);
      const hit = event.pointHit as { elements: { close: boolean }[] };
      expect(hit?.elements[0]?.close).toBe(true);
    }
    return { markerIndex, inputs: actual };
  } finally {
    try {
      const path = info.outputPath(
        `625-close-input-${template}-${page.viewportSize()!.width}-${theme}.json`,
      );
      await writeFile(
        path,
        JSON.stringify(
          {
            project: info.project.name,
            template,
            theme,
            markerIndex,
            eventsAfterMarker: events.slice(markerIndex + 1),
            qualification:
              'Actual trusted original pointer flow after native autoscroll; keyboard capture is a separate cycle.',
          },
          null,
          2,
        ),
      );
      await info.attach(`625-close-input-${template}-${theme}`, {
        path,
        contentType: 'application/json',
      });
    } catch (error) {
      console.info(
        '625-close-input-proof-unavailable',
        error instanceof Error ? error.name : 'UnknownError',
      );
    }
  }
}

/** Actual pre-click geometry: no forced input, scroll, focus or navigation change. */
async function expect625CloseHit(page: Page, info: TestInfo, template: string, stage: string) {
  const close = page.getByRole('button', { name: 'Buchungen schließen' });
  const proof = await close.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    const nav = document.querySelector('.tabbar')?.getBoundingClientRect();
    const visibleNav = nav && nav.width > 0 && nav.height > 0;
    const hit = document.elementFromPoint(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    return {
      inHeader: Boolean(button.closest('.ex-template-source-heading')),
      bounds: {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
      },
      viewport: { width: innerWidth, height: innerHeight },
      navTop: visibleNav ? nav.top : null,
      centerHitsClose: Boolean(hit && (hit === button || button.contains(hit))),
      centerHitTag: hit?.tagName.slice(0, 48) ?? null,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  try {
    const path = info.outputPath(
      `625-close-hit-${template}-${page.viewportSize()!.width}-${stage}.json`,
    );
    await writeFile(path, JSON.stringify(proof, null, 2));
    await info.attach(`625-close-hit-${template}-${stage}`, {
      path,
      contentType: 'application/json',
    });
  } catch (error) {
    console.info(
      '625-close-hit-proof-unavailable',
      error instanceof Error ? error.name : 'UnknownError',
    );
  }
  expect(proof.inHeader).toBe(true);
  expect(proof.bounds.width).toBeGreaterThanOrEqual(44);
  expect(proof.bounds.height).toBeGreaterThanOrEqual(44);
  expect(proof.bounds.left).toBeGreaterThanOrEqual(0);
  expect(proof.bounds.right).toBeLessThanOrEqual(proof.viewport.width);
  expect(proof.bounds.top).toBeGreaterThanOrEqual(0);
  expect(proof.bounds.bottom).toBeLessThanOrEqual(proof.navTop ?? proof.viewport.height);
  expect(proof.centerHitsClose, JSON.stringify(proof)).toBe(true);
  expect(proof.documentWidth).toBeLessThanOrEqual(proof.viewport.width);
  await expect(close).toBeInViewport({ ratio: 1 });
  return proof;
}

async function safe625Location(page: Page) {
  return page.evaluate(() => {
    const search = new URLSearchParams(location.search);
    return {
      path: location.pathname,
      selected: Object.fromEntries(
        ['vorlage', 'zelle', 'spalte', 'zeitraum', 'kategorien'].map((key) => [
          key,
          search.get(key),
        ]),
      ),
    };
  });
}
async function safe625HitGeometry(page: Page) {
  return page.evaluate(() => {
    const rect = (value: DOMRect) => ({
      x: value.x,
      y: value.y,
      width: value.width,
      height: value.height,
      top: value.top,
      right: value.right,
      bottom: value.bottom,
      left: value.left,
    });
    const classify = (element: Element | null) => ({
      tag: element?.tagName.slice(0, 48) ?? null,
      surface: element?.closest('.ex-template-sources')
        ? 'sources'
        : element?.closest('.ex-template-scroll')
          ? 'template-scroll'
          : element?.closest('.fab')
            ? 'fab'
            : element?.closest('.tabbar')
              ? 'tabbar'
              : element?.closest('.m-head')
                ? 'mobile-header'
                : 'other',
      close: Boolean(
        element?.closest('.ex-template-sources button')?.textContent?.trim() ===
        'Buchungen schließen',
      ),
    });
    const close = [
      ...document.querySelectorAll<HTMLButtonElement>('.ex-template-sources button'),
    ].find((button) => button.textContent?.trim() === 'Buchungen schließen');
    const bounds = close?.getBoundingClientRect();
    const hit = (x: number, y: number) => ({
      x,
      y,
      elements: document.elementsFromPoint(x, y).slice(0, 6).map(classify),
    });
    const ancestors = [];
    for (let node = close?.parentElement; node && ancestors.length < 8; node = node.parentElement) {
      ancestors.push({
        ...classify(node),
        scrollLeft: node.scrollLeft,
        scrollTop: node.scrollTop,
        clientWidth: node.clientWidth,
        clientHeight: node.clientHeight,
        scrollWidth: node.scrollWidth,
        scrollHeight: node.scrollHeight,
      });
    }
    const viewport = window.visualViewport;
    const tabbar = document.querySelector('.tabbar')?.getBoundingClientRect();
    const geometry = {
      tabbarRect: tabbar && tabbar.width > 0 && tabbar.height > 0 ? rect(tabbar) : null,
      closeConnected: close?.isConnected ?? false,
      closeRect: bounds ? rect(bounds) : null,
      closeClientRects: close ? [...close.getClientRects()].slice(0, 4).map(rect) : [],
      centerHit: bounds ? hit(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) : null,
      scroll: { x: window.scrollX, y: window.scrollY },
      layoutViewport: { width: window.innerWidth, height: window.innerHeight },
      runtime: {
        devicePixelRatio: window.devicePixelRatio,
        maxTouchPoints: navigator.maxTouchPoints,
        coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      },
      visualViewport: viewport
        ? {
            width: viewport.width,
            height: viewport.height,
            offsetLeft: viewport.offsetLeft,
            offsetTop: viewport.offsetTop,
            pageLeft: viewport.pageLeft,
            pageTop: viewport.pageTop,
            scale: viewport.scale,
          }
        : null,
      ancestors,
    };
    return geometry;
  });
}
async function observe625Close(page: Page) {
  // Fixed diagnostic budgets cover both themed original mouse flows plus two keyboard captures.
  // Required close inputs still fail closed if absent; these are not assertion timeouts.
  const events: Record<string, unknown>[] = [];
  const push = (record: Record<string, unknown>) => {
    if (events.length < 320) events.push({ observedAt: Date.now(), ...record });
  };
  page.on('console', (message) => {
    const text = message.text();
    const prefix = 'budget625-safe-close ';
    if (text.startsWith(prefix)) {
      try {
        push({
          channel: 'dom',
          ...(JSON.parse(text.slice(prefix.length)) as Record<string, unknown>),
        });
      } catch {
        push({ channel: 'diagnostic-json-invalid' });
      }
    }
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/report-tables/income-expense')
      push({ channel: 'canonical-read-start', method: request.method() });
  });
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/api/report-tables/income-expense')
      push({ channel: 'canonical-read-response', status: response.status() });
  });
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    const url = new URL(frame.url());
    push({
      channel: 'main-frame-navigation',
      path: url.pathname,
      selected: Object.fromEntries(
        ['vorlage', 'zelle', 'spalte', 'zeitraum', 'kategorien'].map((key) => [
          key,
          url.searchParams.get(key),
        ]),
      ),
    });
  });
  await page.addInitScript(() => {
    let count = 0;
    const target = (value: EventTarget | null) => {
      const element = value instanceof Element ? value : null;
      if (!element) return { kind: 'none' };
      const cell = element.closest<HTMLElement>('.table-cell-open');
      if (cell)
        return {
          kind: 'cell',
          row: cell.closest('[data-template-row]')?.getAttribute('data-template-row'),
          column: cell.dataset['templateColumn'],
        };
      if (element.closest('.ex-template-sources h3')) return { kind: 'source-heading' };
      if (element.closest('.ex-template-sources a')) return { kind: 'source-link' };
      const button = element.closest('button');
      if (
        button?.closest('.ex-template-sources') &&
        button.textContent?.trim() === 'Buchungen schließen'
      )
        return { kind: 'close' };
      return { kind: 'other', tag: element.tagName };
    };
    const emit = (event: string, extra: Record<string, unknown> = {}) => {
      if (count++ >= 200) return;
      const search = new URLSearchParams(location.search);
      console.info(
        'budget625-safe-close ' +
          JSON.stringify({
            event,
            at: performance.now(),
            path: location.pathname,
            selected: Object.fromEntries(
              ['vorlage', 'zelle', 'spalte', 'zeitraum', 'kategorien'].map((key) => [
                key,
                search.get(key),
              ]),
            ),
            sourceCount: document.querySelectorAll('[data-testid="template-sources"]').length,
            templateCount: document.querySelectorAll('.ex-template').length,
            loading: [...document.querySelectorAll('.rev-empty[aria-busy="true"]')].some(
              (element) => element.textContent?.includes('Vorlage'),
            ),
            active: target(document.activeElement),
            ...extra,
          }),
      );
    };
    for (const name of ['pointerdown', 'pointerup', 'click', 'focusin', 'focusout']) {
      document.addEventListener(
        name,
        (event) => {
          const item = target(event.target);
          const pointer = name === 'pointerdown' || name === 'pointerup' || name === 'click';
          if (pointer || (item.kind !== 'other' && item.kind !== 'none')) {
            const rect = (value: DOMRect) => ({
              x: value.x,
              y: value.y,
              width: value.width,
              height: value.height,
              top: value.top,
              right: value.right,
              bottom: value.bottom,
              left: value.left,
            });
            const classify = (element: Element | null) => ({
              tag: element?.tagName.slice(0, 48) ?? null,
              surface: element?.closest('.ex-template-sources')
                ? 'sources'
                : element?.closest('.ex-template-scroll')
                  ? 'template-scroll'
                  : element?.closest('.fab')
                    ? 'fab'
                    : element?.closest('.tabbar')
                      ? 'tabbar'
                      : element?.closest('.m-head')
                        ? 'mobile-header'
                        : 'other',
              close: Boolean(
                element?.closest('.ex-template-sources button')?.textContent?.trim() ===
                'Buchungen schließen',
              ),
            });
            const close = [
              ...document.querySelectorAll<HTMLButtonElement>('.ex-template-sources button'),
            ].find((button) => button.textContent?.trim() === 'Buchungen schließen');
            const bounds = close?.getBoundingClientRect();
            const hit = (x: number, y: number) => ({
              x,
              y,
              elements: document.elementsFromPoint(x, y).slice(0, 6).map(classify),
            });
            const ancestors = [];
            for (
              let node = close?.parentElement;
              node && ancestors.length < 8;
              node = node.parentElement
            ) {
              ancestors.push({
                ...classify(node),
                scrollLeft: node.scrollLeft,
                scrollTop: node.scrollTop,
                clientWidth: node.clientWidth,
                clientHeight: node.clientHeight,
                scrollWidth: node.scrollWidth,
                scrollHeight: node.scrollHeight,
              });
            }
            const viewport = window.visualViewport;
            const tabbar = document.querySelector('.tabbar')?.getBoundingClientRect();
            const geometry = {
              tabbarRect: tabbar && tabbar.width > 0 && tabbar.height > 0 ? rect(tabbar) : null,
              closeConnected: close?.isConnected ?? false,
              closeRect: bounds ? rect(bounds) : null,
              closeClientRects: close ? [...close.getClientRects()].slice(0, 4).map(rect) : [],
              centerHit: bounds
                ? hit(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
                : null,
              scroll: { x: window.scrollX, y: window.scrollY },
              layoutViewport: { width: window.innerWidth, height: window.innerHeight },
              runtime: {
                devicePixelRatio: window.devicePixelRatio,
                maxTouchPoints: navigator.maxTouchPoints,
                coarsePointer: window.matchMedia('(pointer: coarse)').matches,
              },
              visualViewport: viewport
                ? {
                    width: viewport.width,
                    height: viewport.height,
                    offsetLeft: viewport.offsetLeft,
                    offsetTop: viewport.offsetTop,
                    pageLeft: viewport.pageLeft,
                    pageTop: viewport.pageTop,
                    scale: viewport.scale,
                  }
                : null,
              ancestors,
            };
            const coordinates =
              event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : null;
            emit(name, {
              target: item,
              trusted: event.isTrusted,
              pointerType: 'pointerType' in event ? event.pointerType : null,
              coordinates,
              geometry,
              pointHit: coordinates ? hit(coordinates.x, coordinates.y) : null,
            });
          }
        },
        { passive: true, capture: true },
      );
    }
    window.addEventListener('popstate', () => emit('popstate'), { passive: true });
    let previous = '';
    new MutationObserver(() => {
      const signature = JSON.stringify([
        document.querySelectorAll('[data-testid="template-sources"]').length,
        document.querySelectorAll('.ex-template').length,
        [...document.querySelectorAll('.rev-empty[aria-busy="true"]')].some((element) =>
          element.textContent?.includes('Vorlage'),
        ),
        location.pathname,
        location.search,
      ]);
      if (signature !== previous) {
        previous = signature;
        emit('mount-or-route');
      }
    }).observe(document, { childList: true, subtree: true });
  });
  return events;
}
