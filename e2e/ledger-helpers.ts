import { expect, type Locator, type Page } from '@playwright/test';

/** Helpers shared by the ledger and capture specs. */

/** The open toast (the dialog hosts its own region, the page has another one). */
export const toast = (page: Page) => page.locator('.toast.is-open');

export const openAccount = async (page: Page, name: string) => {
  await page.goto('/konten');
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
};

export const createAccount = async (page: Page, name: string, type: string, opening: string) => {
  await page.goto('/konten');
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
  await panel
    .getByRole('option', { name: new RegExp(`^${name}`) })
    .first()
    .click();
};

export const balance = (page: Page) => page.getByTestId('account-balance');
