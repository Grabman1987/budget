import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/** Helpers shared by the ledger and capture specs. */

/**
 * Touch targets are 44 CSS px. Layout can report 43.99999986 for a 44 px box (observed in CI run
 * 40686588523, capture.spec.ts), so assert with a 0.1 px tolerance instead of exactly 44.
 */
export const MIN_TARGET_PX = 43.9;

/** Account capture uses the retained global entry in ON; OFF keeps its local button. */
export async function openAccountCapture(page: Page) {
  if (!(await redesignLoaded(page))) {
    await page.getByRole('button', { name: 'Buchung erfassen', exact: true }).click();
  } else if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
    // The FAB reappears on upward scroll, including after a long account register.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.getByRole('link', { name: 'Buchung erfassen', exact: true }).click();
  } else {
    await page.getByTitle('Buchung erfassen (N)', { exact: true }).click();
  }
}

/** Phone filters live in a sheet; desktop keeps the inline controls. */
export async function openLedgerFilters(page: Page) {
  await page.getByLabel('In Buchungen suchen').waitFor({ state: 'visible' });
  const trigger = page.getByRole('button', { name: /^Filter \(/ });
  if (await trigger.isVisible()) await trigger.click();
}

export async function applyLedgerFilters(page: Page) {
  const sheet = page.getByRole('dialog', { name: 'Buchungen filtern', exact: true });
  if (await sheet.isVisible())
    await sheet.getByRole('button', { name: 'Fertig', exact: true }).click();
}

/** The open toast (the dialog hosts its own region, the page has another one). */
export const toast = (page: Page) => page.locator('.toast.is-open');

/**
 * Suffix for names a test creates: a retry (or a repeat) starts on the same database, so the
 * accounts of the earlier attempt are still there and a second one with the same name would be
 * ambiguous.
 */
export const again = (info: TestInfo) => {
  const n = info.retry + info.repeatEachIndex;
  return n > 0 ? ` r${n}` : '';
};

/**
 * `page.goto` that survives a client-side navigation still in flight: Chrome then aborts the
 * load (net::ERR_ABORTED) although nothing is wrong, so it is tried again.
 */
export const visit = async (page: Page, url: string) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.goto(url);
      return;
    } catch (error) {
      if (attempt >= 2 || !String(error).includes('ERR_ABORTED')) throw error;
    }
  }
};

export const openAccount = async (page: Page, name: string) => {
  await visit(page, '/konten');
  await overviewAccountLink(page, name).click();
  const level = (await redesignLoaded(page)) && (page.viewportSize()?.width ?? 1440) < 768 ? 1 : 2;
  await expect(page.getByRole('heading', { level, name })).toBeVisible();
};

export const createAccount = async (page: Page, name: string, type: string, opening: string) => {
  await visit(page, '/konten');
  await overviewActions(page);
  await page.getByRole('button', { name: 'Konto anlegen', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Konto anlegen' });
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByLabel('Kontotyp', { exact: true }).selectOption({ label: type });
  await dialog.getByLabel('Startsaldo', { exact: true }).fill(opening);
  await dialog.getByRole('button', { name: 'Konto anlegen', exact: true }).click();
  await expect(toast(page)).toContainText(`Konto „${name}“ angelegt`);
  await expect(overviewAccountLink(page, name)).toBeVisible();
};

/** Account links include their visible review state after the account's literal name. */
const overviewAccountLink = (page: Page, name: string) =>
  page.locator('.overview-account-row').getByRole('link', {
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `),
  });

/** Category field of the capture panel: type to search, pick from the list. */
export const pickCategory = async (panel: Locator, name: string) => {
  await panel.getByLabel('Kategorie', { exact: true }).fill(name);
  // Scoped to the open list: an account select earlier in the dialog may have an option of the
  // same name.
  await panel
    .getByRole('listbox')
    .getByRole('option', { name: new RegExp(`^${name}`) })
    .first()
    .click();
};

export const balance = (page: Page) => page.getByTestId('account-balance');

/** Branch on the loaded shell: OFF retains each original control and label. */
export const redesignLoaded = async (page: Page) => {
  await page.locator('.app').waitFor({ state: 'visible' });
  return (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
};

export async function overviewActions(page: Page) {
  const menu = page.locator('.overview-actions-menu');
  if (
    (await redesignLoaded(page)) &&
    (await menu.count()) &&
    (await menu.getAttribute('open')) === null
  )
    await menu.locator(':scope > summary').click();
}

export async function categoryLineControl(scope: Locator) {
  return scope.getByRole('button', {
    name: (await redesignLoaded(scope.page())) ? 'Kategorie hinzufügen' : '+ Weitere Kategorie',
    exact: true,
  });
}

export async function contactShareControl(scope: Locator) {
  return scope.getByRole('button', {
    name: (await redesignLoaded(scope.page())) ? 'Kontakt hinzufügen' : 'Teilen',
    exact: true,
  });
}

export async function captureFlagControl(scope: Locator, name: string | RegExp) {
  const page = scope.page();
  if ((await redesignLoaded(page)) && (page.viewportSize()?.width ?? 1440) < 768) {
    const more = scope.locator('.kmore');
    if ((await more.getAttribute('open')) === null) await more.locator(':scope > summary').click();
  }
  return scope.getByRole('button', { name });
}

export async function inboxFilters(page: Page) {
  if (await redesignLoaded(page)) {
    const menu = page.locator('.konten-inbox-filters-slot .konten-menu');
    if ((await menu.getAttribute('open')) === null) await menu.locator(':scope > summary').click();
  }
}

export async function chartOptions(page: Page) {
  if (await redesignLoaded(page)) {
    const menu = page.locator('.account-chart-options');
    if ((await menu.getAttribute('open')) === null) await menu.locator(':scope > summary').click();
  }
}

export async function bankPreviewControl(scope: Locator | Page) {
  const page = 'page' in scope ? scope.page() : scope;
  const action = scope.getByRole('button', { name: /^(Prüfen|Bestätigen)$/, exact: true });
  return (await redesignLoaded(page))
    ? action
    : scope.getByRole('button', { name: 'Übernehmen', exact: true });
}

export async function registerContext(page: Page, open = true) {
  if (await redesignLoaded(page)) {
    const legend = page.locator('.redesign-register-toolbar .kbooking-legend');
    if (((await legend.getAttribute('open')) !== null) !== open)
      await legend.locator(':scope > summary').click();
  }
}

export async function bankDismissControl(scope: Locator | Page) {
  const page = 'page' in scope ? scope.page() : scope;
  const action = scope.getByRole('button', { name: 'Nicht übernehmen', exact: true });
  if ((await redesignLoaded(page)) && !(await action.isVisible()))
    await scope.locator('.bank-v1-more > .konten-menu > summary').first().click();
  return action;
}

export async function accountBankReview(page: Page) {
  if (await redesignLoaded(page)) {
    const queue = page.locator('.account-bank-queue');
    if ((await queue.count()) && (await queue.getAttribute('open')) === null)
      await queue.locator(':scope > summary').click();
  }
}

export async function historyChart(page: Page) {
  const toggle = page.getByTestId('account-chart-toggle');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await chartOptions(page);
  if (await redesignLoaded(page))
    await page
      .getByRole('group', { name: 'Saldoverlauf Zeitraum' })
      .getByRole('button', { name: '3M', exact: true })
      .click();
}

export async function bankSelection(page: Page) {
  if (await redesignLoaded(page)) {
    const menu = page.locator('.bank-selection-menu');
    if ((await menu.getAttribute('open')) === null) await menu.locator(':scope > summary').click();
  }
}

export async function categorySuggestions(scope: Locator, open = true) {
  const menu = scope.locator('.bk-category-context');
  if (
    (await redesignLoaded(scope.page())) &&
    (await menu.count()) &&
    ((await menu.getAttribute('open')) !== null) !== open
  )
    await menu.locator(':scope > summary').click();
}

/** Statement intake remains in the account's document disclosure in the new layout. */
export async function accountDocuments(scope: Locator | Page) {
  const page = 'page' in scope ? scope.page() : scope;
  if (await redesignLoaded(page)) {
    const documents = scope.locator('.account-documents-redesign');
    if ((await documents.getAttribute('open')) === null)
      await documents.locator(':scope > summary').click();
  }
}
