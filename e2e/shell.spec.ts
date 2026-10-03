import { expect, test, type Page } from '@playwright/test';
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
      ['/einstellungen', '/einstellungen/konten'],
    ] as const) {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`${to}$`));
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
    await expect(page.locator('.registers [aria-current="page"]')).toHaveText('Alle Buchungen');
    await page.goto('/reports/geldfluss');
    await expect(page.locator('.registers [aria-current="page"]')).toHaveText(
      'Monat und Einkommen',
    );
    await page.goto('/einstellungen/sicherheit');
    await expect(page.locator('.registers [aria-current="page"]')).toHaveText('Sicherheit');
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

  test('the report catalog lists 30 reports in five assemblies with positions', async ({
    page,
  }) => {
    await page.goto('/reports');
    await expect(page.locator('.rcat-row')).toHaveCount(30);
    await expect(page.locator('.rcat-grp')).toHaveCount(5);
    await expect(page.locator('.rcat-row .col-pos').first()).toHaveText('1.1');
    await expect(page.locator('.rcat-row .col-pos').last()).toHaveText('5.5');
    // As in the prototype: chart form and Steuerung per row; a click on the row opens the report.
    await expect(page.locator('.rcat-row').first().locator('.rcat-form')).toHaveText(
      'Druckblatt A4',
    );
    await page.locator('.rcat-row').nth(3).locator('.rcat-q').click();
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
      await page.getByRole('combobox', { name: 'Suchen', exact: true }).focus();
      await page.keyboard.type('n');
      await expect(page.getByRole('combobox', { name: 'Suchen', exact: true })).toHaveValue('n');
      await expect(page).not.toHaveURL(/panel=/);
      await page.getByRole('combobox', { name: 'Suchen', exact: true }).blur();
    }
    await page.keyboard.press('n');
    await expect(page).toHaveURL(/panel=buchung/);
    const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/plan\/monat$/);
  });

  test('is linkable: a deep link opens the panel, Esc removes the param', async ({ page }) => {
    await page.goto('/konten?panel=posteingang');
    const dialog = page.getByRole('dialog', { name: 'Posteingang' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/konten$/);
  });

  test('the browser back button closes the panel', async ({ page }) => {
    await page.goto('/einstellungen/anlageklassen');
    await page.getByRole('link', { name: 'Seitenpanel testen' }).click();
    const dialog = page.getByRole('dialog', { name: 'Details' });
    await expect(dialog).toBeVisible();
    await page.goBack();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/einstellungen\/anlageklassen$/);
  });

  test('the close button closes the panel without leaving a duplicate history entry', async ({
    page,
  }) => {
    await page.goto('/plan/monat');
    await page.goto('/einstellungen/anlageklassen');
    await page.getByRole('link', { name: 'Seitenpanel testen' }).click();
    await page.getByRole('button', { name: 'Schließen' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.goBack();
    await expect(page).toHaveURL(/\/plan\/monat$/);
  });

  test('phone: the panel is a bottom sheet, desktop: a 420 px side panel', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?panel=beispiel');
    const box = await page.getByRole('dialog', { name: 'Details' }).boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport).toBeTruthy();
    if (!box || !viewport) return;
    if (isPhone(testInfo)) {
      expect(Math.round(box.y + box.height)).toBe(viewport.height);
      expect(Math.round(box.width)).toBe(viewport.width);
    } else {
      expect(Math.round(box.width)).toBe(420);
      expect(Math.round(box.x + box.width)).toBe(viewport.width);
    }
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
    await expect(items.locator('.sheet-no')).toHaveText(['01', '02', '03', '04', '05']);
    await expect(items.locator('.label')).toHaveText([
      'Heute',
      'Plan',
      'Konten',
      'Vermögen',
      'Reports',
    ]);
    expect(Math.round((await items.first().boundingBox())?.height ?? 0)).toBe(42);
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

  test('theme button names the other theme as in the prototype and persists the choice', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const html = page.locator('html');
    const button = page.locator('.sidebar').getByTitle('Hell/Dunkel umschalten');
    // Follows the system until the first switch; the button names the target theme.
    await expect(button).toHaveText('Dunkle Blaupause');
    await expect(html).not.toHaveAttribute('data-theme', /.+/);
    await button.click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(button).toHaveText('Heller Zeichenfilm');
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(button).toHaveText('Heller Zeichenfilm');
    await button.click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(button).toHaveText('Dunkle Blaupause');
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

  test('phone header opens the inbox as a bottom sheet', async ({ page }) => {
    await page.goto('/konten');
    await page.getByRole('link', { name: /Posteingang, \d+ offen/ }).click();
    await expect(page.getByRole('dialog', { name: 'Posteingang' })).toBeVisible();
  });
});

test.describe('regression baselines of the shell (own screenshots)', () => {
  // The pages show the current month; the baselines are from September 2026. A fixed browser clock
  // (the prototype's reference day) keeps them valid in every month.
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-17T08:30:00+02:00'));
    // Preserve the original deterministic visual input; functional inbox tests use real counts.
    await page.route('**/api/inbox/count', (route) => route.fulfill({ json: { count: 9 } }));
  });

  for (const [name, path] of [
    ['heute', '/'],
    // Plan › Monat (P2c) and Plan › Jahr show live data; the plan-year spec covers that page.
    ['reports', '/reports'],
  ] as const) {
    test(`light ${name}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      if (name === 'heute') await freezeHeuteVisual(page);
      await page.goto(name === 'heute' ? '/?monat=2026-09' : path);
      await expect(page.locator('main')).toBeVisible();
      if (name === 'heute') {
        await expectHeuteVisualReady(page);
        await page.screenshot({ path: test.info().outputPath('heute-viewport-light.png') });
      }
      await page.evaluate(() => document.fonts.ready);
      await expectScreenshot(page, `shell-${name}-light.png`);
    });
  }

  test('dark heute', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await freezeHeuteVisual(page);
    await page.goto('/?monat=2026-09');
    await expect(page.locator('main')).toBeVisible();
    await expectHeuteVisualReady(page);
    await page.screenshot({ path: test.info().outputPath('heute-viewport-dark.png') });
    await expectScreenshot(page, 'shell-heute-dark.png');
  });
});
