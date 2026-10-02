import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/** Helpers shared by the ledger and capture specs. */

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
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
};

export const createAccount = async (page: Page, name: string, type: string, opening: string) => {
  await visit(page, '/konten');
  await page.getByRole('button', { name: 'Konto anlegen', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Konto anlegen' });
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByLabel('Kontotyp', { exact: true }).selectOption({ label: type });
  await dialog.getByLabel('Startsaldo', { exact: true }).fill(opening);
  await dialog.getByRole('button', { name: 'Konto anlegen', exact: true }).click();
  await expect(toast(page)).toContainText(`Konto „${name}“ angelegt`);
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
};

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
