import AxeBuilder from '@axe-core/playwright';
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

  // A broken link drops the bad values instead of failing: impossible day, overlong id.
  await page.goto(`/konten/buchungen?von=2026-02-30&konto=${'x'.repeat(80)}`);
  await expect(page.getByText(/\d+ Buchung(en)? ·/)).toBeVisible();
  await expect(page.getByText(/konnte(n)? nicht geladen/)).toHaveCount(0);
  await page.goBack();
  await expect(page.getByLabel('Konto', { exact: true })).toHaveValue(/.+/);

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

  // Bulk delete asks first; cancelling keeps everything, confirming deletes, undo restores.
  await selectAll(page);
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await expect(page.getByText('3 Buchungen löschen?')).toBeVisible();
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(page.getByText('3 Buchungen ·')).toBeVisible();
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await page.getByRole('button', { name: 'Ja, löschen', exact: true }).click();
  await expect(page.getByText('Keine Buchungen für diese Filter.')).toBeVisible();
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByText('3 Buchungen ·')).toBeVisible();
});

test('Kontostand prüfen: doppelt, Ausgleich, geprüft sperrt, undo', async ({ page }, testInfo) => {
  const tag = testInfo.project.name;
  const name = `Prüf ${tag}`;
  await createAccount(page, name, 'Giro', '500');
  await openAccount(page, name);
  const book = async (payee: string, amount: string) => {
    await page.getByRole('button', { name: 'Buchung erfassen' }).click();
    const panel = page.getByRole('dialog', { name: 'Buchung erfassen' });
    await panel.getByLabel('Betrag', { exact: true }).fill(amount);
    await panel.getByLabel('Empfänger').fill(payee);
    await panel.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('row', { name: new RegExp(payee) }).first()).toBeVisible();
  };
  await book(`Laden ${tag}`, '20');
  await book(`Doppel ${tag}`, '5');
  await book(`Doppel ${tag}`, '5');
  await expect(balance(page)).toHaveText('470,00 €');

  // The bank knows "Doppel" once: the app is 5,00 too low, and the duplicate explains it.
  await page.getByRole('button', { name: 'Kontostand prüfen' }).click();
  const check = page.getByRole('dialog', { name: `Kontostand prüfen · ${name}` });
  await check.getByLabel('Saldo laut Bank', { exact: true }).fill('475');
  await expect(check.getByText('Doppelt:')).toBeVisible();
  await check.getByRole('button', { name: 'Doppelte Buchung entfernen' }).click();
  await expect(check.getByText('Differenz 0,00 € · stimmt überein')).toBeVisible();
  await expect(balance(page)).toHaveText('475,00 €');
  await check.getByRole('button', { name: /Festschreiben/ }).click();
  await expect(toast(page)).toContainText('Kontostand geprüft');
  await expect(page.getByRole('row', { name: new RegExp(`Laden ${tag}`) })).toContainText(
    'geprüft',
  );

  // A geprüft booking is locked: the amount needs the explicit release.
  await page
    .getByRole('row', { name: new RegExp(`Laden ${tag}`) })
    .getByRole('button', { name: /bearbeiten/ })
    .click();
  const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await edit.getByLabel('Betrag', { exact: true }).fill('21');
  await edit.getByRole('button', { name: 'Speichern' }).click();
  await expect(edit.getByRole('alert')).toContainText('geprüft');
  await edit.getByLabel('Trotzdem ändern').check();
  await edit.getByRole('button', { name: 'Speichern' }).click();
  await expect(balance(page)).toHaveText('474,00 €');

  // The bank says 470: 4,00 missing; Ausgleich books it and stamps everything, undo reverts it.
  await page.getByRole('button', { name: 'Kontostand prüfen' }).click();
  const second = page.getByRole('dialog', { name: `Kontostand prüfen · ${name}` });
  await second.getByLabel('Saldo laut Bank', { exact: true }).fill('470');
  await expect(second.getByText(/Es fehlt eine Ausgabe/)).toBeVisible();
  await second.getByRole('button', { name: /Differenz ausgleichen/ }).click();
  await expect(toast(page)).toContainText('Ausgleich');
  await expect(balance(page)).toHaveText('470,00 €');
  await expect(page.getByRole('row', { name: /Korrektur Kontoprüfung/ })).toContainText('geprüft');
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(balance(page)).toHaveText('474,00 €');
  await expect(page.getByRole('row', { name: /Korrektur Kontoprüfung/ })).toHaveCount(0);
});

test('ledger pages with data: axe clean in both themes, no sideways scrolling', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const tag = testInfo.project.name;
  const name = `Axe ${tag}`;
  await createAccount(page, name, 'Giro', '250');
  await openAccount(page, name);
  await page.getByRole('button', { name: 'Buchung erfassen' }).click();
  const panel = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await panel.getByLabel('Betrag', { exact: true }).fill('9,90');
  await panel.getByLabel('Empfänger').fill(`Kiosk ${tag}`);
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('row', { name: new RegExp(`Kiosk ${tag}`) })).toBeVisible();
  const accountUrl = page.url();

  const violations = async () =>
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ rule: v.id, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  const noSidewaysScroll = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme });
    for (const url of ['/konten', accountUrl, '/konten/buchungen']) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('main table, main .kview').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await violations(), `${scheme} ${url}`).toEqual([]);
      expect(await noSidewaysScroll(), `${scheme} ${url} scrolls sideways`).toBe(true);
    }
    // The panels: booking form and Kontostand prüfen.
    await page.goto(accountUrl);
    await page.getByRole('button', { name: 'Buchung erfassen' }).click();
    await expect(page.getByRole('dialog', { name: 'Buchung erfassen' })).toBeVisible();
    expect(await violations(), `${scheme} booking panel`).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Kontostand prüfen' }).click();
    const check = page.getByRole('dialog', { name: /Kontostand prüfen/ });
    await check.getByLabel('Saldo laut Bank', { exact: true }).fill('999');
    await expect(check.getByText(/Es fehlt eine Einnahme/)).toBeVisible();
    expect(await violations(), `${scheme} reconcile panel`).toEqual([]);
    await page.keyboard.press('Escape');
  }
});
