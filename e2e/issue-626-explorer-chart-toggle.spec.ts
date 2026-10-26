import AxeBuilder from '@axe-core/playwright';
import { createBooking, openDatabase } from '@budget/db';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2024-04-05' });
const views = ['custom', 'heatmap', 'year', 'total', 'category'] as const;
const profiles = ['configured', 'phone844', 'desktop1440'] as const;
type View = (typeof views)[number];
function seed(path: string) {
  const opened = openDatabase(path);
  try {
    opened.sqlite.exec(`
      INSERT INTO account(id,name,type,role,on_budget,opening_date)
      VALUES ('budget','Synthetic chart account','checking','budget',1,'2024-01-01');
      INSERT INTO category_group(id,name) VALUES ('g','Synthetic chart group');
    `);
    const insert = opened.sqlite.prepare(
      "INSERT INTO category(id,group_id,name,class,kind) VALUES (?,'g',?,'want','variable')",
    );
    for (let index = 1; index <= 10; index++)
      insert.run(
        `c${String(index).padStart(2, '0')}`,
        `Kategorie ${String(index).padStart(2, '0')}`,
      );
    const book = (
      date: string,
      amountCents: number,
      splits: { amountCents: number; categoryId?: string; incomeTypeId?: string }[],
    ) =>
      createBooking(
        opened.db,
        { accountId: 'budget', date, amountCents, splits },
        { actor: 'synthetic-chart-fixture' },
      );
    book('2024-01-02', 300000, [{ amountCents: 300000, incomeTypeId: 'income-salary' }]);
    for (let index = 1; index <= 8; index++) {
      const amount = -(20000 - index * 1000);
      book('2024-01-03', amount, [
        { amountCents: amount, categoryId: `c${String(index).padStart(2, '0')}` },
      ]);
    }
    const splitId = book('2024-01-04', -1001, [
      { amountCents: -901, categoryId: 'c09' },
      { amountCents: -100, categoryId: 'c01' },
    ]);
    book('2024-02-03', 101, [{ amountCents: 101, categoryId: 'c09' }]);
    book('2024-01-05', 401, [{ amountCents: 401, categoryId: 'c10' }]);
    book('2024-02-04', -201, [{ amountCents: -201, categoryId: 'c10' }]);
    // Existing Heatmap excludes net-negative categories. Opposite real March contributions
    // retain both source categories without changing the literal Further March zero.
    book('2024-03-03', 400, [{ amountCents: 400, categoryId: 'c09' }]);
    book('2024-03-04', -400, [{ amountCents: -400, categoryId: 'c10' }]);
    return { splitId };
  } finally {
    opened.close();
  }
}
function fingerprint(path: string) {
  const opened = openDatabase(path);
  try {
    const result = {
      accounts: opened.sqlite.prepare('SELECT * FROM account ORDER BY id').all(),
      bookings: opened.sqlite.prepare('SELECT * FROM booking ORDER BY id').all(),
      splits: opened.sqlite.prepare('SELECT * FROM booking_split ORDER BY id').all(),
      financialAudit: opened.sqlite
        .prepare(
          "SELECT * FROM audit_log WHERE entity_type IN ('account','booking','booking_split') ORDER BY id",
        )
        .all(),
    };
    return createHash('sha256').update(JSON.stringify(result)).digest('hex');
  } finally {
    opened.close();
  }
}
async function realTheme(page: Page, value: 'dark' | 'light') {
  if ((await page.locator('html').getAttribute('data-theme')) === value) return;
  if (page.viewportSize()!.width < 768) {
    const menu = page.locator('.m-profile');
    await menu.locator('summary').click();
    await menu
      .getByRole('button', {
        name: value === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
        exact: true,
      })
      .click();
    await menu.locator('summary').click();
  } else
    await page
      .locator('.sidebar-foot')
      .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true })
      .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', value);
}
async function proof(
  page: Page,
  info: TestInfo,
  view: View,
  color: 'light' | 'dark',
  splitId: string,
  profile: (typeof profiles)[number],
) {
  const writes: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      writes.push(`${request.method()} ${path}`);
  });
  await page.addInitScript(() => localStorage.setItem('budget-theme', 'light'));
  const search =
    view === 'custom'
      ? ''
      : `?vorlage=${view}&zeitraum=${view === 'year' ? 'YTD' : view === 'total' ? '3J' : '1J'}${view === 'category' ? '&kategorien=%5B%22c09%22%5D' : ''}`;
  await page.goto(`/reports/explorer${search}`);
  const table =
    view === 'custom'
      ? page.getByTestId('ex-table')
      : page.getByTestId(`template-${view}`).locator('table.ex-template-table');
  await expect(table).toBeVisible();
  const actualProfile = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
    coarse: matchMedia('(pointer:coarse)').matches,
    touchPoints: navigator.maxTouchPoints,
  }));
  if (profile === 'desktop1440')
    expect(actualProfile).toMatchObject({ width: 1440, height: 900, dpr: 1, coarse: false });
  else if (profile === 'phone844')
    expect(actualProfile).toMatchObject({ width: 390, height: 844, dpr: 1, coarse: true });
  else {
    const configured = info.project.use.viewport;
    expect(configured).toBeTruthy();
    expect(actualProfile.width).toBe(configured!.width);
    expect(actualProfile.height).toBe(configured!.height);
    expect(actualProfile.dpr).toBe(info.project.use.deviceScaleFactor ?? 1);
    expect(actualProfile.coarse).toBe(Boolean(info.project.use.hasTouch));
  }
  // Raw maxTouchPoints is recorded, not promoted to a physical-touch capability claim.
  expect(actualProfile.touchPoints).toBeGreaterThanOrEqual(0);
  if (view === 'custom') {
    await page.getByLabel('Spalten', { exact: true }).selectOption('monat');
    await expect(page.getByRole('button', { name: 'CSV exportieren', exact: true })).toBeEnabled();
  }
  await realTheme(page, color);
  const originalTable = await table.textContent();
  const originalRows = await table.locator('tbody tr').count();
  expect(originalRows).toBeGreaterThan(0);
  const sourceRow =
    view === 'custom'
      ? table
          .locator('tbody tr')
          .filter({ has: page.getByRole('link', { name: 'Kategorie 09', exact: true }) })
      : table.locator('[data-template-row="cat:c09"]');
  await expect(sourceRow).toContainText(view === 'custom' ? 'Kategorie 09' : '9,01 €');
  const sourceHref =
    view === 'custom'
      ? await sourceRow
          .getByRole('link', { name: 'Kategorie 09', exact: true })
          .getAttribute('href')
      : null;
  const tableButton = page.getByRole('button', { name: 'Tabelle', exact: true });
  const chartButton = page.getByRole('button', { name: 'Diagramm', exact: true });
  await expect(tableButton).toHaveAttribute('aria-pressed', 'true');
  await expect(chartButton).toHaveAttribute('aria-pressed', 'false');
  const region = page.locator(view === 'custom' ? '.ex-scroll' : '.ex-template-scroll');
  const regionSize = await region.evaluate((e) => ({
    width: e.clientWidth,
    scrollWidth: e.scrollWidth,
  }));
  if (page.viewportSize()!.width === 390 && (view === 'year' || view === 'total')) {
    expect(regionSize.scrollWidth).toBeGreaterThan(regionSize.width);
  }
  let pan = 0;
  if (regionSize.scrollWidth > regionSize.width) {
    await region.focus();
    await region.evaluate((scroller) => {
      scroller.removeAttribute('data-native-pan-complete');
      scroller.addEventListener(
        'scrollend',
        () => scroller.setAttribute('data-native-pan-complete', 'true'),
        { once: true },
      );
    });
    await region.press('ArrowRight');
    await expect(region).toHaveAttribute('data-native-pan-complete', 'true');
    await expect.poll(() => region.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
    pan = await region.evaluate((e) => e.scrollLeft);
  }
  const originalCell = sourceRow.locator('td[data-chart-point]').first();
  if (view === 'custom' && regionSize.scrollWidth > regionSize.width) {
    // Centre the SAME January cell vertically without changing its native horizontal pan.
    // Measure after scrolling; move the real pointer without another automatic scroll.
    const exposed = await originalCell.evaluate((cell) => {
      const before = cell.getBoundingClientRect();
      window.scrollBy({
        top: before.top + before.height / 2 - innerHeight / 2,
        behavior: 'instant',
      });
      const scroller = cell.closest('.ex-scroll')!;
      const box = cell.getBoundingClientRect();
      const scrollBox = scroller.getBoundingClientRect();
      const sticky = cell.parentElement!.querySelector('th.ex-first')!.getBoundingClientRect();
      const left = Math.max(box.left, scrollBox.left + scroller.clientLeft, sticky.right, 0);
      const right = Math.min(
        box.right,
        scrollBox.left + scroller.clientLeft + scroller.clientWidth,
        innerWidth,
      );
      const borderLeft = parseFloat(getComputedStyle(cell).borderLeftWidth) || 0;
      const pointerX = (left + right) / 2;
      const pointerY = box.top + box.height / 2;
      return {
        pointerX,
        pointerY,
        hitsOriginalCell: cell.contains(document.elementFromPoint(pointerX, pointerY)),
        exposedWidth: right - left,
        x: (left + right) / 2 - box.left - borderLeft,
        y: cell.clientHeight / 2,
        cellWidth: cell.clientWidth,
        cell: { left: box.left, right: box.right, width: box.width },
        sticky: { left: sticky.left, right: sticky.right, width: sticky.width },
        scroller: { left: scrollBox.left, right: scrollBox.right, width: scroller.clientWidth },
        scrollLeft: scroller.scrollLeft,
        viewportWidth: innerWidth,
      };
    });
    const hoverGeometry = info.outputPath('original-cell-hover-geometry.json');
    await writeFile(hoverGeometry, JSON.stringify(exposed, null, 2));
    await info.attach('original-cell-hover-geometry', {
      path: hoverGeometry,
      contentType: 'application/json',
    });
    expect(Number.isFinite(exposed.exposedWidth)).toBe(true);
    expect(exposed.exposedWidth).toBeGreaterThan(0);
    expect(Number.isFinite(exposed.x)).toBe(true);
    expect(exposed.x).toBeGreaterThanOrEqual(0);
    expect(exposed.x).toBeLessThan(exposed.cellWidth);
    expect(exposed.hitsOriginalCell).toBe(true);
    await page.mouse.move(exposed.pointerX, exposed.pointerY);
  } else {
    await originalCell.hover();
  }
  await expect(page.locator('.chart-tooltip[role="status"]')).toContainText('Kategorie 09');
  await expect(page.locator('.chart-tooltip[role="status"]')).toContainText('9,01 €');
  const panBeforeSwitch = await region.evaluate((e) => e.scrollLeft);
  const selectionBefore = new URL(page.url()).search;
  await chartButton.click();
  await expect(chartButton).toHaveAttribute('aria-pressed', 'true');
  expect(new URL(page.url()).search).toBe(selectionBefore);
  const chart = page.locator('.ex-chart-626');
  const cohorts = chart.getByRole('combobox', { name: 'Diagrammzeilen', exact: true });
  if (view === 'year' || view === 'total') {
    await expect(cohorts).toHaveCount(1);
    const labels = await cohorts.locator('option').allTextContents();
    expect(labels).toEqual(
      expect.arrayContaining([
        'Summen',
        'Einnahmenarten',
        'Gruppen',
        'Kategorien',
        'Ergebnisse',
        'Sparquote',
      ]),
    );
  }
  const available = (await cohorts.count())
    ? await cohorts
        .locator('option')
        .evaluateAll((elements) =>
          elements.map((e) => ({ value: (e as HTMLOptionElement).value, label: e.textContent })),
        )
    : [];
  for (const cohort of available) {
    await cohorts.selectOption(cohort.value);
    await expect(chart.getByRole('img', { name: /Diagramm/ })).toBeVisible();
    expect(await chart.locator('.ex-chart-legend li').count()).toBeGreaterThan(0);
  }
  const categories = available.find((option) => option.label === 'Kategorien');
  if (view === 'year' || view === 'total') expect(categories).toBeTruthy();
  if (categories) await cohorts.selectOption(categories.value);
  const legend = chart.getByRole('list', { name: 'Reihenlegende' });
  await expect(legend.locator('li')).toHaveCount(view === 'category' ? 1 : 9);
  if (view !== 'category') {
    await expect(legend).toContainText('Weitere (2 Zeilen)');
    await expect(chart.locator('.ex-chart-originals')).toContainText('Kategorie 09');
    await expect(chart.locator('.ex-chart-originals')).toContainText('Kategorie 10');
    const originals = chart.locator('.ex-chart-originals');
    await originals.locator('summary').click();
    await expect(
      originals.getByRole('rowheader', { name: 'Kategorie 09', exact: true }),
    ).toBeVisible();
    await expect(
      originals.getByRole('rowheader', { name: 'Kategorie 10', exact: true }),
    ).toBeVisible();
    const summaryBox = await originals.locator('summary').boundingBox();
    expect(summaryBox?.width).toBeGreaterThanOrEqual(44);
    expect(summaryBox?.height).toBeGreaterThanOrEqual(44);
    await originals.locator('summary').click();
  }
  const interactive = chart.locator('.chart-interactive').first();
  await interactive.focus();
  const january = await table.locator('thead tr').first().locator('th').allTextContents();
  const januaryIndex =
    january.findIndex((value) => /Jän(?:ner)?(?:\s|\u00a0|\n)*(?:20)?24/.test(value)) - 1;
  expect(januaryIndex).toBeGreaterThanOrEqual(0);
  // Focus shows the first actual source column; real arrows advance to January's table column.
  for (let index = 0; index < januaryIndex; index++) await interactive.press('ArrowRight');
  const tip = page.locator('.chart-tooltip[role="status"]');
  if (view === 'category') await expect(tip).toContainText('9,01 €');
  else {
    await expect(
      tip.locator('.chart-tooltip-row').filter({ hasText: 'Weitere · Zeilensumme (2)' }),
    ).toContainText('5,00 €');
    await interactive.press('ArrowRight');
    await expect(
      tip.locator('.chart-tooltip-row').filter({ hasText: 'Weitere · Zeilensumme (2)' }),
    ).toContainText('1,00 €');
    await interactive.press('ArrowRight');
    await expect(
      tip.locator('.chart-tooltip-row').filter({ hasText: 'Weitere · Zeilensumme (2)' }),
    ).toContainText('0,00 €');
  }
  if (view !== 'category') {
    await interactive.press('ArrowLeft');
    await interactive.press('ArrowLeft');
  }
  const visibleExact = view === 'category' ? '9,01 €' : '5,00 €';
  await expect(tip).toContainText(visibleExact);
  await page.keyboard.press('Control+Shift+H');
  await expect(tip).toContainText('•••');
  await expect(tip).not.toContainText(visibleExact);
  await page.keyboard.press('Control+Shift+H');
  await expect(tip).toContainText(visibleExact);
  await interactive.press('Escape');
  await expect(tip).toHaveCount(0);
  const geometry = await chart.locator('svg.chart').evaluate((svg) => ({
    width: Number(svg.getAttribute('width')),
    height: Number(svg.getAttribute('height')),
    paths: [...svg.querySelectorAll('.l-actual')].map((path) => path.getAttribute('d')),
  }));
  expect(geometry.width).toBeGreaterThan(72);
  expect(geometry.paths.length).toBeGreaterThan(0);
  for (const path of geometry.paths) {
    expect(path).not.toMatch(/NaN|Infinity|undefined/);
    const coordinates = path!.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
    expect(coordinates.length).toBeGreaterThanOrEqual(2);
    coordinates.forEach((value, index) => {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(index % 2 === 0 ? 60 : 16);
      expect(value).toBeLessThanOrEqual(index % 2 === 0 ? geometry.width - 12 : 192);
    });
  }
  for (const button of [tableButton, chartButton]) {
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  if (await cohorts.count()) {
    const box = await cohorts.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  await chartButton.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`chart-${view}-${color}.png`) });
  await tableButton.click();
  await expect(table).toBeVisible();
  await expect(tableButton).toHaveAttribute('aria-pressed', 'true');
  expect(await table.textContent()).toBe(originalTable);
  expect(await table.locator('tbody tr').count()).toBe(originalRows);
  expect(await region.evaluate((e) => e.scrollLeft)).toBe(panBeforeSwitch);
  if (view === 'custom') {
    expect(
      await sourceRow.getByRole('link', { name: 'Kategorie 09', exact: true }).getAttribute('href'),
    ).toBe(sourceHref);
    const originalLink = new URL(sourceHref!, page.url());
    expect(originalLink.searchParams.get('kategorie')).toBe('c09');
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV exportieren', exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('explorer-2024-01-2024-03.csv');
    const file = await download.path();
    expect(file).not.toBeNull();
    const csv = await readFile(file!, 'utf8');
    expect(csv).toContain(';"c09";"Kategorie 09";901;-101;-400;400\r\n');
    expect(csv).toContain(';"c10";"Kategorie 10";-401;201;400;200\r\n');
  } else {
    const cell = sourceRow.getByRole('button', { name: /^Kategorie 09 · Jänner 2024 · 9,01 €/ });
    await cell.click();
    const sources = page.getByTestId('template-sources');
    await expect(sources).toContainText('Gewählte Zelle: 9,01 €');
    await expect(sources).toContainText('Summe der zugeordneten Anteile: 9,01 €');
    await expect(sources.getByRole('link')).toHaveCount(1);
    expect(
      new URL((await sources.getByRole('link').getAttribute('href'))!, page.url()).searchParams.get(
        'buchung',
      ),
    ).toBe(splitId);
    const chosenSearch = new URL(page.url()).search;
    await chartButton.click();
    expect(new URL(page.url()).search).toBe(chosenSearch);
    await expect(sources).toContainText('9,01 €');
    await tableButton.click();
    await sources.getByRole('button', { name: 'Buchungen schließen', exact: true }).click();
    await expect(sources).toHaveCount(0);
    await expect(cell).toBeFocused();
  }
  expect(writes).toEqual([]);
  const physical = {
    view,
    color,
    requestedProfile: profile,
    manualContextOptions:
      profile === 'configured'
        ? null
        : {
            viewport:
              profile === 'phone844' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
            deviceScaleFactor: 1,
            isMobile: profile === 'phone844',
            hasTouch: profile === 'phone844',
            reducedMotion: 'reduce',
          },
    engine: page.context().browser()!.browserType().name(),
    version: page.context().browser()!.version(),
    project: info.project.name,
    projectConfigured: {
      viewport: info.project.use.viewport,
      isMobile: info.project.use.isMobile,
      hasTouch: info.project.use.hasTouch,
      deviceScaleFactor: info.project.use.deviceScaleFactor,
    },
    geometry,
    region: regionSize,
    nativePan: pan,
    panBeforeSwitch,
    sourceRows: originalRows,
    ...(await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
      touchPoints: navigator.maxTouchPoints,
      coarse: matchMedia('(pointer:coarse)').matches,
      theme: document.documentElement.dataset['theme'],
      documentWidth: document.documentElement.scrollWidth,
    }))),
  };
  const path = info.outputPath(`chart-${view}-${color}-physical.json`);
  await writeFile(path, JSON.stringify(physical, null, 2));
  await info.attach('actual-chart-profile', { path, contentType: 'application/json' });
}
for (const profile of profiles)
  for (const view of views)
    for (const color of ['dark', 'light'] as const) {
      test(`626 ${view}: literal same-source lines, table keyboard and read-only ${profile} ${color}`, async ({
        page,
        browser,
        isolatedLedger,
      }, info) => {
        const ids = seed(isolatedLedger.databasePath);
        const before = fingerprint(isolatedLedger.databasePath);
        const context =
          profile === 'configured'
            ? null
            : await browser.newContext({
                baseURL: isolatedLedger.origin,
                storageState: isolatedLedger.storageState,
                viewport: {
                  width: profile === 'phone844' ? 390 : 1440,
                  height: profile === 'phone844' ? 844 : 900,
                },
                deviceScaleFactor: 1,
                isMobile: profile === 'phone844',
                hasTouch: profile === 'phone844',
                reducedMotion: 'reduce',
              });
        try {
          const actual = context ? await context.newPage() : page;
          if (context) await actual.clock.setFixedTime(new Date('2024-04-05T12:00:00+02:00'));
          await proof(actual, info, view, color, ids.splitId, profile);
          expect(fingerprint(isolatedLedger.databasePath)).toBe(before);
        } finally {
          await context?.close();
        }
      });
    }
