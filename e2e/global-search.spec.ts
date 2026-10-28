import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { join } from 'node:path';
import { sampleTest as test, expect } from './sample';

test.describe.configure({ timeout: 120_000 });

async function openSearch(page: Page, mobile: boolean) {
  const existing = page.getByRole('dialog', { name: 'Suchen', exact: true });
  if (await existing.isVisible()) {
    const input = existing.getByRole('combobox', { name: 'Suchen', exact: true });
    await input.focus();
    return input;
  }
  await expect(page.getByRole('main')).toBeVisible();
  if (new URL(page.url()).pathname !== '/suche') {
    // Router URLs can change before the previous search view has unmounted.
    await expect(page.locator('#search-query')).toHaveCount(0);
  }
  if (!mobile) await expect(page.locator('#global-search')).toBeVisible();
  if (mobile) await page.getByRole('button', { name: 'Suchen', exact: true }).click();
  else await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Suchen', exact: true });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('combobox', { name: 'Suchen', exact: true });
  await expect(input).toBeFocused();
  return input;
}

test('global search: keyboard, account navigation, and unchanged booking-list search', async ({
  page,
}, info) => {
  await page.goto('/plan/monat');
  const mobile = info.project.name !== 'desktop';
  const input = await openSearch(page, mobile);
  await input.fill('Girokonto');
  const list = page.getByRole('listbox', { name: 'Suchergebnisse' });
  await expect(list.getByRole('option').first()).toContainText('Konto');
  await expect(list.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowDown');
  await expect(list.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowUp');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/konten\/acc-giro$/);
  await expect(page.getByRole('heading', { name: 'Girokonto', exact: true }).first()).toBeVisible();
  await page.goto('/konten/buchungen');
  const listSearch = page.getByRole('searchbox');
  await listSearch.fill('Supermarkt');
  await expect(page).toHaveURL(/q=Supermarkt/);
  await expect(page.locator('.ktable')).toBeVisible();
});

test('result types open existing category, payee, contact and exact booking views', async ({
  page,
}, info) => {
  const mobile = info.project.name !== 'desktop';
  await page.goto('/konten');
  for (const [query, kind, url] of [
    ['Lebensmittel', 'Kategorie', /kategorie=/],
    ['Supermarkt', 'Empfänger', /empfaenger=/],
    ['Muster', 'Kontakt', /\/konten\/kontakte\//],
    ['Supermarkt', 'Buchung', /buchung=/],
  ] as const) {
    const input = await openSearch(page, mobile);
    await input.fill(query);
    await page
      .getByRole('listbox')
      .getByRole('option')
      .filter({ has: page.locator('.global-search-kind', { hasText: new RegExp(`^${kind}$`) }) })
      .first()
      .click();
    await expect(page).toHaveURL(url);
    if (kind === 'Kontakt') {
      const panel = page.getByRole('region', { name: 'Kontaktkontoauszug' });
      await expect(panel).toContainText('Kontakt M. Muster');
      await page.reload();
      await expect(page.getByRole('region', { name: 'Kontaktkontoauszug' })).toContainText(
        'Kontakt M. Muster',
      );
      await page.getByRole('link', { name: 'Zurück zu Kontakte', exact: true }).click();
    }
    if (kind === 'Buchung') {
      await expect(page.getByText('1 Buchung', { exact: false }).first()).toBeVisible();
      await page.reload();
      await expect(page.getByText('1 Buchung', { exact: false }).first()).toBeVisible();
    }
  }
});

test('loading, empty and failed searches are explicit, retry works, Escape returns mobile focus', async ({
  page,
}, info) => {
  await page.goto('/');
  const mobile = info.project.name !== 'desktop';
  const input = await openSearch(page, mobile);
  await expect(page.getByRole('option', { name: /Neue Buchung/ })).toBeVisible();
  await input.fill('nichtvorhandenesuchfolge');
  await expect(page.getByText('Keine Treffer.', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.route('**/api/search?*', async (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  await input.fill('Girokonto');
  await expect(page.getByText('Die Suche ist nicht verfügbar.')).toBeVisible();
  await page.unroute('**/api/search?*');
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.getByRole('listbox').getByRole('option').first()).toContainText('Girokonto');
  await input.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  if (mobile) await expect(page.getByRole('button', { name: 'Suchen', exact: true })).toBeFocused();
});

test('overlay preserves the source URL, history, scroll, focus and month on Escape', async ({
  page,
}, info) => {
  await page.goto('/plan/monat?monat=2026-08');
  const trigger = page.getByRole('button', {
    name:
      info.project.name === 'desktop' ? 'Suchen: Seiten, Reports, Buchungen, Aktionen' : 'Suchen',
    exact: true,
  });
  await trigger.focus();
  await page.evaluate(() => window.scrollTo(0, 240));
  const scroll = await page.evaluate(() => scrollY);
  const before = await page.evaluate(() => history.length);
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Suchen', exact: true });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('combobox', { name: 'Suchen', exact: true });
  await expect(input).toBeFocused();
  await expect(page.getByRole('group', { name: 'Aktionen' }).getByRole('option')).toHaveCount(4);
  await expect(page.getByRole('group', { name: 'Seiten', exact: true })).toHaveCount(0);
  await input.fill('Girokonto');
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-08$/);
  await input.press('Escape');
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-08$/);
  expect(await page.evaluate(() => history.length)).toBe(before);
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  await expect(trigger).toBeFocused();
});

test('keyboard search returns focus to the field that opened it', async ({ page }) => {
  await page.goto('/konten/buchungen');
  const sourceField = page.getByRole('searchbox');
  await sourceField.fill('Supermarkt');
  await expect(page).toHaveURL(/\/konten\/buchungen\?q=Supermarkt$/);
  const sourceUrl = page.url();
  await sourceField.focus();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Suchen', exact: true });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('combobox', { name: 'Suchen', exact: true });
  await expect(input).toBeFocused();
  await input.fill('Girokonto');
  await input.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(sourceUrl);
  await expect(sourceField).toHaveValue('Supermarkt');
  await expect(sourceField).toBeFocused();
});

test('pending responses cannot replace a newer query and search is accessible in both themes', async ({
  page,
}, info) => {
  await page.goto('/');
  const mobile = info.project.name !== 'desktop';
  const input = await openSearch(page, mobile);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/search?q=Girokonto', async (route) => {
    await gate;
    await route.continue();
  });
  const pending = page.waitForRequest('**/api/search?q=Girokonto');
  await input.fill('Girokonto');
  await pending;
  await expect(page.getByText('Suche wird geladen …')).toBeVisible();
  await input.fill('Lebensmittel');
  await expect(page.getByRole('listbox').getByRole('option').first()).toContainText('Lebensmittel');
  release();
  await expect(page.getByRole('listbox').getByRole('option').first()).toContainText('Lebensmittel');
  await page.unroute('**/api/search?q=Girokonto');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    const audit = await new AxeBuilder({ page }).analyze();
    expect(audit.violations).toEqual([]);
    const file = `search-${theme}-${info.project.name}.png`;
    await page.screenshot({
      animations: 'disabled',
      path: process.env['BUDGET_SEARCH_EVIDENCE']
        ? join(process.env['BUDGET_SEARCH_EVIDENCE'], file)
        : info.outputPath(file),
    });
  }
});

test('the live server denies unauthenticated search', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const response = await context.request.get(`${baseURL}/api/search?q=Girokonto`);
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({ error: 'unauthorized' });
  await context.close();
});

test('mobile header search preserves the month and stays clear of the capture action', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'Phone layout only');
  await page.goto('/');
  const title = page.locator('.m-title-text');
  // The phone title strip names the page; the month sits in the Heute month switch below it.
  await expect(title).toHaveText('Heute');
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => title.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const trigger = page.locator('.m-head').getByRole('button', { name: 'Suchen', exact: true });
  const search = (await trigger.boundingBox())!;
  const capture = (await page.locator('.fab').boundingBox())!;
  const bar = (await page.locator('.tabbar').boundingBox())!;
  expect(search.width).toBe(44);
  expect(search.height).toBe(44);
  expect(search.y + search.height).toBeLessThan(bar.y);
  expect(search.y + search.height).toBeLessThan(capture.y);
  await trigger.focus();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('combobox', { name: 'Suchen', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    const file = `search-access-${theme}-mobile.png`;
    await page.screenshot({
      animations: 'disabled',
      path: process.env['BUDGET_SEARCH_EVIDENCE']
        ? join(process.env['BUDGET_SEARCH_EVIDENCE'], file)
        : info.outputPath(file),
    });
  }
});

test('palette: reports, pages, recent choices, actions and shortcut help', async ({
  page,
}, info) => {
  const mobile = info.project.name !== 'desktop';
  await page.goto('/plan/monat?monat=2026-08');
  let input = await openSearch(page, mobile);
  await input.fill('1.10 ein');
  await expect(page.getByRole('option', { name: /1.10 Einnahmen und Cashflow/ })).toBeVisible();
  await input.press('Enter');
  await expect(page).toHaveURL(/\/reports\/einnahmen-ausgaben$/);
  input = await openSearch(page, mobile);
  await expect(
    page.getByRole('group', { name: 'Zuletzt verwendet' }).getByRole('option').first(),
  ).toContainText('1.10 Einnahmen und Cashflow');
  await input.fill('vrmgn prtf');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/vermoegen\/portfolio$/);
  for (const [label, panel] of [
    ['Neue Buchung', 'buchung'],
    ['Prüfen öffnen', 'posteingang'],
  ] as const) {
    input = await openSearch(page, mobile);
    await input.fill(label);
    await input.press('Enter');
    if (panel === 'buchung') {
      await expect(page).toHaveURL(/panel=buchung/);
      await expect(
        page.getByRole('dialog', { name: 'Buchung erfassen', exact: true }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
    } else {
      await expect(page).toHaveURL(/\/konten\/pruefen/);
      await expect(
        page.getByRole('region', { name: 'Aufgaben nach Quelle', exact: true }),
      ).toBeVisible();
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  input = await openSearch(page, mobile);
  await input.fill('Monatsabschluss starten');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/monatsabschluss\/\d{4}-\d{2}/);
  input = await openSearch(page, mobile);
  await input.fill('Datenschutz-Modus umschalten');
  await input.press('Enter');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('budget-amounts-hidden')))
    .toBe('1');
  input = await openSearch(page, mobile);
  await input.fill('Supermarkt');
  const booking = page
    .getByRole('option')
    .filter({ has: page.locator('.global-search-kind', { hasText: /^Buchung$/ }) })
    .first();
  await expect(booking).toContainText('••• EUR');
  await expect(booking).not.toContainText(/\d+,\d{2} EUR/);
  await page.getByRole('button', { name: 'Tastenkürzel anzeigen (?)', exact: true }).click();
  const help = page.getByRole('dialog', { name: 'Tastenkürzel', exact: true });
  await expect(help).toBeVisible();
  await expect(help).toContainText(
    'Enter speichert gültige Eingaben · Strg Enter speichert · Strg Umschalt Enter speichert und beginnt neu · Esc schließt',
  );
  await expect(help).toContainText('6 Violett');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`shortcuts-${theme}-${info.project.name}.png`),
      animations: 'disabled',
    });
  }
  await page.keyboard.press('Escape');
  await expect(help).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Tastenkürzel anzeigen (?)', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  if (mobile) await expect(page.getByRole('button', { name: 'Suchen', exact: true })).toBeFocused();
  else await expect(page.locator('#global-search')).toBeFocused();
  // Click below the sticky top bar: on a page taller than the window Playwright's retry scrolls
  // the top of main under the bar, where (8, 8) would be covered.
  await page.locator('main').click({ position: { x: 8, y: 96 } });
  await page.keyboard.press('?');
  await expect(help).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).not.toBeVisible();
});

test('all results retain the query and source with reload-safe type filtering', async ({
  page,
}, info) => {
  await page.goto('/plan/monat?monat=2026-08');
  const input = await openSearch(page, info.project.name !== 'desktop');
  await input.fill('Supermarkt');
  await expect(page.getByRole('group', { name: 'Buchungen' })).toBeVisible();
  await page.getByRole('button', { name: 'Alle Ergebnisse', exact: true }).click();
  await expect(page).toHaveURL(/\/suche\?/);
  await expect(page.getByRole('combobox', { name: 'Suchen', exact: true })).toHaveValue(
    'Supermarkt',
  );
  await page.getByLabel('Ergebnistyp').selectOption('booking');
  await expect(page).toHaveURL(/typ=booking/);
  await page.reload();
  await expect(page.getByLabel('Ergebnistyp')).toHaveValue('booking');
  // Result options live inside the listbox; native select choices are separate.
  await expect(page.getByRole('listbox').getByRole('option').first()).toContainText('Buchung');
  await expect(
    page.getByRole('listbox').locator('.global-search-kind', { hasText: /^Empfänger$/ }),
  ).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.getByRole('link', { name: 'Zurück zur vorherigen Ansicht' }).click();
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-08$/);
});

test('palette fits the viewport with touch targets, trapped focus and light/dark accessibility', async ({
  page,
}, info) => {
  await page.goto('/konten');
  const input = await openSearch(page, info.project.name !== 'desktop');
  const dialog = page.getByRole('dialog', { name: 'Suchen', exact: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (info.project.name !== 'desktop') {
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.width).toBe(390);
      expect(bounds.y).toBe(0);
      for (const control of await dialog.locator('button:visible, input:visible').all()) {
        const box = (await control.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }
    if (process.env['BUDGET_SEARCH_EVIDENCE'])
      await page.screenshot({
        path: join(
          process.env['BUDGET_SEARCH_EVIDENCE'],
          `overlay-${theme}-${info.project.name}.png`,
        ),
        animations: 'disabled',
      });
  }
  await input.fill('Plan');
  await expect(page.getByRole('group', { name: 'Seiten', exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
