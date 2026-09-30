import { expect, test, type Page } from '@playwright/test';

/**
 * The ledger end to end on the real server: accounts, bookings with split and transfer, edit in
 * place, undo and redo, Alle Buchungen with filter and bulk edit. Desktop and phone run in
 * parallel against the same database, so every name carries the project name.
 */

/** The open toast (the dialog hosts its own region, the page has another one). */
const toast = (page: Page) => page.locator('.toast.is-open');

const openAccount = async (page: Page, name: string) => {
  await page.goto('/konten');
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
};

const createAccount = async (page: Page, name: string, type: string, opening: string) => {
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

/** Select-all lives in the table head on desktop and above the list on the phone. */
const selectAll = async (page: Page) => {
  const head = page.getByLabel('Alle sichtbaren Buchungen auswählen');
  if (await head.isVisible()) await head.check();
  else await page.getByLabel('Alle sichtbaren auswählen').check();
};

const balance = (page: Page) => page.getByTestId('account-balance');

test('accounts, bookings, split, transfer, undo and redo', async ({ page }, testInfo) => {
  const tag = testInfo.project.name;
  const giro = `Giro ${tag}`;
  const spar = `Tagesgeld ${tag}`;
  const shop = `Supermarkt ${tag}`;

  await createAccount(page, giro, 'Giro', '1000');
  await createAccount(page, spar, 'Tagesgeld', '0');

  await openAccount(page, giro);
  await expect(balance(page)).toHaveText('1.000,00 €');
  await expect(page.getByTestId('balance-chart')).toBeVisible();

  // A plain expense with category.
  await page.getByRole('button', { name: 'Buchung erfassen' }).click();
  let panel = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await panel.getByLabel('Betrag', { exact: true }).fill('12,50');
  await panel.getByLabel('Empfänger').fill(shop);
  await panel.getByLabel('Kategorie', { exact: true }).selectOption({ label: 'Essen' });
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('row', { name: new RegExp(shop) })).toBeVisible();
  await expect(balance(page)).toHaveText('987,50 €');

  // Undo brings the balance back, redo books it again.
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(balance(page)).toHaveText('1.000,00 €');
  await expect(page.getByRole('row', { name: new RegExp(shop) })).toHaveCount(0);
  await page.getByRole('button', { name: 'Wiederholen' }).click();
  await expect(balance(page)).toHaveText('987,50 €');

  // A split booking: 30,00 as 20,00 Essen and 10,00 Reise; a wrong sum is refused first.
  await page.getByRole('button', { name: 'Buchung erfassen' }).click();
  panel = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await panel.getByLabel('Betrag', { exact: true }).fill('30');
  await panel.getByLabel('Empfänger').fill(`Markt ${tag}`);
  await panel.getByRole('button', { name: 'Aufteilen' }).click();
  await panel.getByLabel('Kategorie 1').selectOption({ label: 'Essen' });
  await panel.getByLabel('Betrag 1').fill('20');
  await panel.getByLabel('Kategorie 2').selectOption({ label: 'Reise' });
  await panel.getByLabel('Betrag 2').fill('5');
  await expect(panel.getByText('Rest: 5,00 €')).toBeVisible();
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(panel.getByRole('alert')).toContainText('nicht den Gesamtbetrag');
  await panel.getByLabel('Betrag 2').fill('10');
  await expect(panel.getByText('Aufteilung geht auf.')).toBeVisible();
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('row', { name: new RegExp(`Markt ${tag}`) })).toContainText(
    'Aufgeteilt (2)',
  );
  await expect(balance(page)).toHaveText('957,50 €');

  // A transfer to the savings account: both balances move.
  await page.getByRole('button', { name: 'Buchung erfassen' }).click();
  panel = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await panel.getByRole('button', { name: 'Umbuchung' }).click();
  await panel.getByLabel('Nach Konto').selectOption({ label: spar });
  await panel.getByLabel('Betrag', { exact: true }).fill('100');
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('row', { name: /Umbuchung nach/ })).toBeVisible();
  await expect(balance(page)).toHaveText('857,50 €');
  await openAccount(page, spar);
  await expect(balance(page)).toHaveText('100,00 €');
  await expect(page.getByRole('row', { name: /Umbuchung von/ })).toBeVisible();

  // Edit in place: change the category of the first expense without opening it.
  await openAccount(page, giro);
  const row = page.getByRole('row', { name: new RegExp(shop) });
  await row.getByRole('button', { name: /Kategorie ändern/ }).click();
  await page.getByLabel(/Kategorie für/).selectOption({ label: 'Miete' });
  await expect(row).toContainText('Miete');
  await expect(toast(page)).toContainText('Buchung geändert');

  // Edit the amount in the panel; the running balance follows.
  await row.getByRole('button', { name: /bearbeiten/ }).click();
  panel = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await panel.getByLabel('Betrag', { exact: true }).fill('10');
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(balance(page)).toHaveText('860,00 €');

  // Delete with undo.
  await row.getByRole('button', { name: /bearbeiten/ }).click();
  panel = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await panel.getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByRole('row', { name: new RegExp(shop) })).toHaveCount(0);
  await expect(balance(page)).toHaveText('870,00 €');
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByRole('row', { name: new RegExp(shop) })).toBeVisible();
});

test('Alle Buchungen: filter in the URL, search, bulk edit with undo', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const giro = `Sammel ${tag}`;
  await createAccount(page, giro, 'Giro', '500');
  await openAccount(page, giro);
  for (const [payee, amount] of [
    [`Bäcker ${tag}`, '4'],
    [`Bio-Laden ${tag}`, '8'],
    [`Tankstelle ${tag}`, '50'],
  ] as const) {
    await page.getByRole('button', { name: 'Buchung erfassen' }).click();
    const panel = page.getByRole('dialog', { name: 'Buchung erfassen' });
    await panel.getByLabel('Betrag', { exact: true }).fill(amount);
    await panel.getByLabel('Empfänger').fill(payee);
    await panel.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('row', { name: new RegExp(payee) })).toBeVisible();
  }

  // The account filter is a URL parameter and survives a reload.
  await page.goto('/konten/buchungen');
  await page.getByLabel('Konto', { exact: true }).selectOption({ label: giro });
  await expect(page).toHaveURL(/konto=/);
  await page.reload();
  await expect(page.getByLabel('Konto', { exact: true })).toHaveValue(/.+/);
  await expect(page.getByText('3 Buchungen ·')).toBeVisible();

  // Search narrows the list and lands in the URL.
  await page.getByLabel('In Buchungen suchen').fill('Bio-Laden');
  await expect(page).toHaveURL(/q=Bio-Laden/);
  await expect(page.getByText('1 Buchung ·')).toBeVisible();
  await page.getByLabel('In Buchungen suchen').fill('');
  await expect(page.getByText('3 Buchungen ·')).toBeVisible();

  // Select all, set a category for all, undo it.
  await selectAll(page);
  await expect(page.getByText('3 ausgewählt')).toBeVisible();
  await page.getByLabel('Kategorie für die Auswahl setzen').selectOption({ label: 'Essen' });
  await expect(toast(page)).toContainText('3 Buchungen geändert');
  for (const row of await page.getByRole('row', { name: new RegExp(tag) }).all()) {
    await expect(row).toContainText('Essen');
  }
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByRole('row', { name: new RegExp(tag) }).first()).toContainText(
    'ohne Kategorie',
  );

  // Bulk delete with undo.
  await selectAll(page);
  await page.getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('Keine Buchungen für diese Filter.')).toBeVisible();
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByText('3 Buchungen ·')).toBeVisible();
});
