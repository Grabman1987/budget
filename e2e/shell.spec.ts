import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectScreenshot } from './visual';
import { monthLabel, monthOf } from '../apps/web/src/nav/month';
import { ROUTES } from './routes';
import { sampleTest } from './sample';
import { expectHeuteVisualReady, freezeHeuteVisual } from './heute-visual-fixture';

const isPhone = (testInfo: { project: { name: string } }) => testInfo.project.name === 'mobile';

function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(msg.text());
  });
  page.on('pageerror', (err) => problems.push(err.message));
  return problems;
}

test.describe('routes', () => {
  // The route sweep needs a complete ledger; writable main intentionally contains unavailable valuations.
  sampleTest(
    `all ${ROUTES.length} routes are reachable by URL with title, h1 and main landmark`,
    async ({ page }) => {
      // 66 sequential page loads can exceed the 30 s default on a loaded CI runner.
      test.setTimeout(120_000);
      const problems = collectProblems(page);
      for (const path of ROUTES) {
        const response = await page.goto(path);
        expect(response?.status(), path).toBe(200);
        await expect(page.locator('main'), path).toHaveCount(1);
        const h1 = page.getByRole('heading', { level: 1 });
        await expect(h1, path).toHaveCount(1);
        await expect(h1, path).not.toHaveText('');
        await expect(page, path).toHaveTitle(/ · Budget$|^Budget$/);
      }
      expect(problems).toEqual([]);
    },
  );

  test('area roots redirect to their first register', async ({ page }) => {
    for (const [from, to] of [
      ['/plan', '/plan/monat'],
      ['/vermoegen', '/vermoegen/nettovermoegen'],
    ] as const) {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`${to}$`));
    }
  });

  test('/einstellungen opens the first page on desktop and the grouped index on the phone', async ({
    page,
  }, testInfo) => {
    await page.goto('/einstellungen');
    if (isPhone(testInfo)) {
      await expect(page).toHaveURL(/\/einstellungen$/);
      await expect(page.getByRole('navigation', { name: 'Einstellungen' })).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/einstellungen\/konten$/);
    }
  });

  test('unknown URLs and unknown reports show a not-found page', async ({ page }) => {
    await page.goto('/gibt-es-nicht');
    await expect(page.getByText('Seite nicht gefunden')).toBeVisible();
    await page.goto('/reports/gibt-es-nicht');
    await expect(page.getByText('Report nicht gefunden')).toBeVisible();
  });

  test('the active area is marked in the navigation and registers mark the current view', async ({
    page,
  }, testInfo) => {
    const nav = isPhone(testInfo) ? page.locator('.tabbar') : page.locator('.sheetlist');
    const cases = [
      ['/', 'Heute'],
      ['/plan/jahr', 'Plan'],
      ['/konten/buchungen', 'Konten'],
      ['/konten/demo-konto', 'Konten'],
      ['/vermoegen/portfolio', 'Vermögen'],
      ['/reports/geldfluss', 'Reports'],
    ] as const;
    for (const [path, area] of cases) {
      await page.goto(path);
      await expect(nav.locator('[aria-current="page"]'), path).toHaveText(new RegExp(area));
    }
    await page.goto('/konten/buchungen');
    await expect(page.locator('.registers [aria-current="page"]')).toHaveText('Buchungen');
    await page.goto('/reports/geldfluss');
    await expect(page.locator('.registers')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Geldfluss');
    const reports = page.getByRole('navigation', { name: 'Weitere Berichte' });
    await reports.locator('summary').click();
    await expect(reports.locator('[aria-current="page"]')).toHaveText('4. Geldfluss');
    await expect(reports.locator('[aria-current="page"]')).toHaveAttribute('href', '/reports/geldfluss');
    // Einstellungen have a grouped navigation instead of register tabs (rail on desktop).
    await page.goto('/einstellungen/sicherheit');
    if (!isPhone(testInfo))
      await expect(
        page.getByRole('navigation', { name: 'Einstellungen' }).locator('[aria-current="page"]'),
      ).toHaveText('Sicherheit');
  });

  test('navigation by clicking: areas, registers, catalog and report', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    const nav = isPhone(testInfo) ? page.locator('.tabbar') : page.locator('.sidebar');
    await nav.getByRole('link', { name: 'Plan', exact: true }).click();
    await expect(page).toHaveURL(/\/plan\/monat$/);
    await page
      .getByRole('navigation', { name: 'Register von Plan' })
      .getByRole('link', { name: 'Jahr' })
      .click();
    await expect(page).toHaveURL(/\/plan\/jahr$/);
    await nav.getByRole('link', { name: 'Reports', exact: true }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await page.getByRole('link', { name: 'Geldfluss' }).click();
    await expect(page).toHaveURL(/\/reports\/geldfluss$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Geldfluss');
    await expect(page).toHaveTitle('Geldfluss · Budget');
  });

  test('the report hub lists sixteen reports in four groups with continuous positions', async ({
    page,
  }, info) => {
    await page.goto('/reports');
    await expect(page.locator('.report-hub-list > li')).toHaveCount(16);
    await expect(
      page.getByRole('group', { name: 'Berichtsgruppen' }).getByRole('button'),
    ).toHaveText(['Alle', 'Einnahmen/Ausgaben', 'Vermögen', 'Portfolio', 'Berichte']);
    await expect(page.locator('.report-hub-number')).toHaveText([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
    ]);
    // The catalog keeps the question; chart implementation and period controls belong to reports.
    const first = page.locator('.report-hub-list > li > a').first();
    await expect(first.locator('.report-hub-question')).toHaveText(
      'Woher kommt das Geld, und was bleibt nach den Ausgaben?',
    );
    await expect(page.locator('.rcat-form, .rcat-ctl')).toHaveCount(0);
    await expect(
      page.locator('.report-hub-list form, .report-hub-list input, .report-hub-list select'),
    ).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Kontoprognose in Plan öffnen' })).toHaveCount(0);
    if ((page.viewportSize()?.width ?? 0) >= 1440) {
      const rows = page.locator('.report-hub-list > li');
      const top = await rows.nth(0).boundingBox();
      const below = await rows.nth(1).boundingBox();
      expect(top!.x).toBe(below!.x);
      expect(below!.y).toBeGreaterThanOrEqual(top!.y + top!.height);
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await first.hover();
      const colors = await first.evaluate((row) => ({
        row: getComputedStyle(row).backgroundColor,
        cells: Array.from(row.children, (cell) => getComputedStyle(cell).backgroundColor),
      }));
      expect(colors.row).not.toBe('rgba(0, 0, 0, 0)');
      expect(colors.cells.every((color) => color === 'rgba(0, 0, 0, 0)')).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: info.outputPath(`catalog-${theme}.png`), fullPage: true });
    }
    await page.locator('.report-hub-list > li').nth(3).locator('.report-hub-question').click();
    await expect(page).toHaveURL(/\/reports\/geldfluss$/);
  });
});

test.describe('panel via route param', () => {
  test('opens from a link, Esc closes it and focus returns to the trigger', async ({
    page,
  }, testInfo) => {
    await page.goto('/plan/monat');
    const trigger = isPhone(testInfo)
      ? page.getByRole('link', { name: 'Buchung erfassen' })
      : page.getByRole('link', { name: /^Buchung$/ });
    await trigger.click();
    await expect(page).toHaveURL(/panel=buchung/);
    const dialog = page.getByRole('dialog', { name: 'Buchung' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/panel=/);
    await expect(page).toHaveURL(/\/plan\/monat$/);
    await expect(trigger).toBeFocused();
  });

  test('the key N opens "Buchung erfassen" with its own URL, but not while typing', async ({
    page,
  }, testInfo) => {
    await page.goto('/plan/monat');
    await expect(page.locator('main')).toBeVisible();
    if (!isPhone(testInfo)) {
      // The search field now lives on the result page, opened from the header.
      await page.locator('#global-search').click();
      const field = page.getByRole('combobox', { name: 'Suchen', exact: true });
      await expect(field).toBeFocused();
      await page.keyboard.type('n');
      await expect(field).toHaveValue('n');
      await expect(page).not.toHaveURL(/panel=/);
      await field.press('Escape');
      await expect(page).toHaveURL(/\/plan\/monat$/);
    }
    await page.keyboard.press('n');
    await expect(page).toHaveURL(/panel=buchung/);
    const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/plan\/monat$/);
  });

  test('legacy inbox links redirect to the page', async ({ page }) => {
    await page.goto('/konten?panel=posteingang');
    await expect(page).toHaveURL(/\/konten\/pruefen/);
    await expect(page.getByRole('dialog', { name: 'Posteingang' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Offene Entscheidungen' })).toBeVisible();
  });

  // Opens the "Buchung" panel through the real shell trigger (top bar / phone FAB), so these tests
  // do not depend on which pages are still placeholders.
  const openBookingPanel = async (page: Page, testInfo: TestInfo) => {
    const trigger = isPhone(testInfo)
      ? page.getByRole('link', { name: 'Buchung erfassen' })
      : page.getByRole('link', { name: /^Buchung$/ });
    await trigger.click();
    await expect(page).toHaveURL(/panel=buchung/);
  };

  test('the browser back button closes the panel', async ({ page }, testInfo) => {
    await page.goto('/plan/monat');
    await openBookingPanel(page, testInfo);
    const dialog = page.getByRole('dialog', { name: 'Buchung' });
    await expect(dialog).toBeVisible();
    await page.goBack();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/plan\/monat$/);
  });

  test('the close button closes the panel without leaving a duplicate history entry', async ({
    page,
  }, testInfo) => {
    await page.goto('/konten');
    await page.goto('/plan/monat');
    await openBookingPanel(page, testInfo);
    await page.getByRole('button', { name: 'Schließen' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.goBack();
    await expect(page).toHaveURL(/\/konten$/);
  });

  test('retired example panel does not open product content', async ({ page }) => {
    await page.goto('/?panel=beispiel');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('desktop shell', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('layout metrics follow DESIGN.md (sidebar 236, top bar 64, search max 460)', async ({
    page,
  }) => {
    await page.goto('/');
    const sidebar = await page.locator('.sidebar').boundingBox();
    const topbar = await page.locator('.topbar').boundingBox();
    const search = await page.locator('.search').boundingBox();
    expect(Math.round(sidebar?.width ?? 0)).toBe(236);
    expect(Math.round(topbar?.height ?? 0)).toBe(64);
    expect(Math.round(search?.width ?? 0)).toBeLessThanOrEqual(460);
    await expect(page.locator('.tabbar')).toBeHidden();
    await expect(page.locator('.m-head')).toBeHidden();
    const items = page.locator('.sheetlist li');
    await expect(items).toHaveCount(5);
    await expect(items.locator('.sheet-no')).toHaveCount(0);
    await expect(items.locator('svg.icon')).toHaveCount(5);
    await expect(items.locator('.label')).toHaveText([
      'Heute',
      'Plan',
      'Konten',
      'Vermögen',
      'Reports',
    ]);
    expect(Math.round((await items.first().boundingBox())?.height ?? 0)).toBe(42);
  });

  test('top bar content ends where the page column ends (the page gutter)', async ({ page }) => {
    await page.setViewportSize({ width: 2000, height: 900 });
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();
    const sheet = await page.locator('main.sheet').boundingBox();
    const topbar = await page.locator('.topbar').boundingBox();
    const actions = await page.locator('.topbar-actions').boundingBox();
    const primary = await page.getByRole('link', { name: /^Buchung$/ }).boundingBox();
    const search = await page.locator('.search').boundingBox();
    expect(sheet && topbar && actions && primary && search).toBeTruthy();
    if (!sheet || !topbar || !actions || !primary || !search) return;
    // The bar spans the window (background, hairline); its content spans the page column.
    expect(Math.round(topbar.width)).toBe(2000 - 236);
    // Same right edge as the content column (sheet padding 40 px), same row for search and actions.
    expect(Math.round(primary.x + primary.width)).toBe(Math.round(sheet.x + sheet.width - 40));
    expect(Math.round(search.y + search.height / 2)).toBe(
      Math.round(primary.y + primary.height / 2),
    );
    expect(search.x + search.width).toBeLessThan(actions.x);
    // Full page width: the actions end at the page gutter (40 px), not far from the window edge.
    expect(Math.round(2000 - (primary.x + primary.width))).toBe(40);
  });

  test('sidebar collapses to 72 px and the state is remembered', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Seitenleiste einklappen' });
    await toggle.click();
    await expect(page.locator('.app')).toHaveClass(/is-collapsed/);
    expect(Math.round((await page.locator('.sidebar').boundingBox())?.width ?? 0)).toBe(72);
    // Links keep their accessible names without visible labels.
    await expect(
      page.locator('.sidebar').getByRole('link', { name: 'Plan', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator('.app')).toHaveClass(/is-collapsed/);
    await page.getByRole('button', { name: 'Seitenleiste ausklappen' }).click();
    expect(Math.round((await page.locator('.sidebar').boundingBox())?.width ?? 0)).toBe(236);
  });

  test('Ctrl K focuses the search from anywhere', async ({ page }) => {
    await page.goto('/plan/monat');
    await expect(page.locator('main')).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('combobox', { name: 'Suchen', exact: true })).toBeFocused();
  });

  test('keyboard: skip link jumps to the content, sidebar links work with Enter', async ({
    page,
  }) => {
    await page.goto('/');
    // Tab only counts once the app has rendered; under load the first Tab could hit a bare page.
    await expect(page.locator('main')).toBeVisible();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Zum Inhalt springen' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();

    await page.getByRole('link', { name: 'Konten', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/konten$/);
  });

  test('theme icon announces the current dark state and persists the choice', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const html = page.locator('html');
    const button = page.locator('.sidebar').getByTitle('Hell/Dunkel umschalten');
    await expect(button).toHaveAccessibleName('Hell/Dunkel umschalten');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(html).not.toHaveAttribute('data-theme', /.+/);
    await button.click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await button.click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('phone shell', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone only');

  test('tab bar with the same five areas in the same order, header and floating button', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.locator('.topbar')).toBeHidden();
    const tabs = page.locator('.tabbar a');
    await expect(tabs).toHaveText(['Heute', 'Plan', 'Konten', 'Vermögen', 'Reports']);
    const bar = await page.locator('.tabbar').boundingBox();
    expect(Math.round(bar?.height ?? 0)).toBe(64);
    const fab = await page.locator('.fab').boundingBox();
    expect(Math.round(fab?.width ?? 0)).toBe(58);
    expect(Math.round(fab?.height ?? 0)).toBe(58);
    // The header names the area; the month (with its switch) sits in the strip below.
    await expect(page.locator('.m-head .m-title-text')).toHaveText('Heute');
    await expect(
      page.getByRole('heading', { name: monthLabel(monthOf(new Date())), exact: true }),
    ).toBeVisible();
    await page.goto('/reports/geldfluss');
    await expect(page.locator('.m-head .m-title-text')).toHaveText('Geldfluss');
  });

  test('touch targets in header, tab bar and registers are at least 44 px', async ({ page }) => {
    await page.goto('/plan/monat');
    const small = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '.m-head a, .m-head button, .tabbar a, .registers a, .fab, main .btn',
        ),
      ]
        .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
        .map((el) => {
          const box = el.getBoundingClientRect();
          return {
            text: (el.getAttribute('aria-label') || el.textContent || '').trim(),
            w: box.width,
            h: box.height,
          };
        })
        .filter((el) => el.h < 43.5 || el.w < 43.5),
    );
    expect(small).toEqual([]);
  });

  test('phone header links to the inbox page and retains return context', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/inbox/count', (route) => route.fulfill({ json: { count: 4 } }));
    await page.goto('/konten?monat=2026-09');
    await page.locator('.m-status').getByRole('link', { name: '4 zu prüfen' }).click();
    await expect(page).toHaveURL(/\/konten\/pruefen/);
    await expect(page.getByRole('dialog', { name: 'Posteingang' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Offene Entscheidungen' })).toBeVisible();
    await page.getByRole('link', { name: 'Zur\u00fcck zur vorherigen Ansicht' }).click();
    await expect(page).toHaveURL(/\/konten\?monat=2026-09$/);
  });
});

sampleTest.describe('regression baselines of the shell (own screenshots)', () => {
  // Runs on the seeded sample server (clock fixed to 17.09.2026 by `sampleTest`): the sidebar and
  // the attention list show live data, and the writable main server holds whatever the other specs
  // of the same run (or shard) created, which made these baselines depend on spec order.
  sampleTest.beforeEach(async ({ page }) => {
    await page.route('**/api/inbox/count', (route) => route.fulfill({ json: { count: 9 } }));
  });

  for (const [name, path] of [
    ['heute', '/'],
    // Plan › Monat (P2c) and Plan › Jahr show live data; the plan-year spec covers that page.
    ['reports', '/reports'],
  ] as const) {
    sampleTest(`light ${name}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      if (name === 'heute') await freezeHeuteVisual(page);
      await page.goto(name === 'heute' ? '/?monat=2026-09&period=payday' : path);
      await expect(page.locator('main')).toBeVisible();
      if (name === 'heute') {
        await expectHeuteVisualReady(page);
        await page.screenshot({ path: test.info().outputPath('heute-viewport-light.png') });
      }
      await page.evaluate(() => document.fonts.ready);
      await expectScreenshot(page, `shell-${name}-light.png`);
    });
  }

  sampleTest('dark heute', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await freezeHeuteVisual(page);
    await page.goto('/?monat=2026-09&period=payday');
    await expect(page.locator('main')).toBeVisible();
    await expectHeuteVisualReady(page);
    await page.screenshot({ path: test.info().outputPath('heute-viewport-dark.png') });
    await expectScreenshot(page, 'shell-heute-dark.png');
  });
});
