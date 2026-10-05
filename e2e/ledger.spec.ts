import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { again, balance, createAccount, openAccount, pickCategory, toast } from './ledger-helpers';

/**
 * The ledger end to end on the real server: accounts, bookings with split and transfer, edit in
 * place, undo and redo, Alle Buchungen with filter and bulk edit. Desktop and phone run in
 * parallel against the same database, so every name carries the project name.
 */

/** Select-all lives in the table head on desktop and above the list on the phone. */
const selectAll = async (page: Page) => {
  const head = page.getByLabel('Alle sichtbaren Buchungen auswählen');
  if (await head.isVisible()) await head.check();
  else await page.getByLabel('Alle sichtbaren auswählen').check();
};

test('accounts, bookings, split, transfer, undo and redo', async ({ page }, testInfo) => {
  const tag = `${testInfo.project.name}${again(testInfo)}`;
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
  await pickCategory(panel, 'Essen');
  await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
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
  await panel.getByLabel('Kategorie 1').selectOption({ value: 'e2e-essen' });
  await panel.getByLabel('Betrag 1').fill('20');
  await panel.getByLabel('Kategorie 2').selectOption({ value: 'e2e-reise' });
  await panel.getByLabel('Betrag 2').fill('5');
  await expect(panel.getByText('Rest: 5,00 €')).toBeVisible();
  // Saving waits until the split adds up.
  await expect(panel.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
  await panel.getByLabel('Betrag 2').fill('10');
  await expect(panel.getByText('Aufteilung geht auf.')).toBeVisible();
  await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
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
  await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
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
  await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
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
  const tag = `${testInfo.project.name}${again(testInfo)}`;
  const giro = `Sammel ${tag}`;
  await createAccount(page, giro, 'Giro', '500');
  // Uncategorised bookings cannot be captured any more (a category is required), so they are
  // seeded through the API like an import would.
  const headers = { origin: new URL(page.url()).origin };
  const accounts = (await (await page.request.get('/api/accounts')).json()) as {
    accounts: { id: string; name: string }[];
  };
  const accountId = accounts.accounts.find((a) => a.name === giro)?.id ?? '';
  for (const [payee, cents] of [
    [`Bäcker ${tag}`, -400],
    [`Bio-Laden ${tag}`, -800],
    [`Tankstelle ${tag}`, -5000],
  ] as const) {
    const made = await page.request.post('/api/payees', { headers, data: { name: payee } });
    const payeeId = ((await made.json()) as { payee: { id: string } }).payee.id;
    const booked = await page.request.post('/api/bookings', {
      headers,
      data: {
        type: 'booking',
        accountId,
        date: new Date().toISOString().slice(0, 10),
        amountCents: cents,
        payeeId,
        splits: [{ categoryId: null, amountCents: cents }],
      },
    });
    expect(booked.ok()).toBe(true);
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
  const tag = `${testInfo.project.name}${again(testInfo)}`;
  const name = `Prüf ${tag}`;
  await createAccount(page, name, 'Giro', '500');
  await openAccount(page, name);
  const book = async (payee: string, amount: string) => {
    await page.getByRole('button', { name: 'Buchung erfassen' }).click();
    const panel = page.getByRole('dialog', { name: 'Buchung erfassen' });
    await panel.getByLabel('Betrag', { exact: true }).fill(amount);
    await panel.getByLabel('Empfänger').fill(payee);
    await pickCategory(panel, 'Essen');
    // A new booking starts vorgemerkt; only confirmed ones can be checked against the bank.
    await panel.getByRole('button', { name: 'bestätigt', exact: true }).click();
    await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
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
  await expect(
    page
      .getByRole('row', { name: new RegExp(`Laden ${tag}`) })
      .getByLabel('geprüft', { exact: true }),
  ).toBeVisible();

  // The amount cell delegates checked bookings to the dialog's explicit release.
  await page
    .getByRole('row', { name: new RegExp(`Laden ${tag}`) })
    .getByRole('button', { name: /Betrag ändern/ })
    .click();
  const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await edit.getByLabel('Betrag', { exact: true }).fill('21');
  await edit.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(edit.getByRole('alert')).toContainText('geprüft');
  await edit.getByLabel('Trotzdem ändern').check();
  await edit.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(balance(page)).toHaveText('474,00 €');

  // The bank says 470: 4,00 missing; Ausgleich books it and stamps everything, undo reverts it.
  await page.getByRole('button', { name: 'Kontostand prüfen' }).click();
  const second = page.getByRole('dialog', { name: `Kontostand prüfen · ${name}` });
  await second.getByLabel('Saldo laut Bank', { exact: true }).fill('470');
  await expect(second.getByText(/Es fehlt eine Ausgabe/)).toBeVisible();
  await second.getByRole('button', { name: /Differenz ausgleichen/ }).click();
  await expect(toast(page)).toContainText('Ausgleich');
  await expect(balance(page)).toHaveText('470,00 €');
  await expect(
    page
      .getByRole('row', { name: /Korrektur Kontoprüfung/ })
      .getByLabel('geprüft', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(balance(page)).toHaveText('474,00 €');
  await expect(page.getByRole('row', { name: /Korrektur Kontoprüfung/ })).toHaveCount(0);
});

test('ledger pages with data: axe clean in both themes, no sideways scrolling', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const tag = `${testInfo.project.name}${again(testInfo)}`;
  const name = `Axe ${tag}`;
  await createAccount(page, name, 'Giro', '250');
  await openAccount(page, name);
  await page.getByRole('button', { name: 'Buchung erfassen' }).click();
  const panel = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await panel.getByLabel('Betrag', { exact: true }).fill('9,90');
  await panel.getByLabel('Empfänger').fill(`Kiosk ${tag}`);
  await pickCategory(panel, 'Essen');
  await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
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
