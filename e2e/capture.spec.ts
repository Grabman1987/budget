import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { balance, createAccount, openAccount, pickCategory, toast } from './ledger-helpers';

/**
 * "+ Buchung" end to end: the capture panel opens by shortcut (desktop) or button (phone), takes
 * an expense by keyboard, an income with income type, transfers, keeps its context with "Speichern
 * und neu", asks before discarding input and learns a payee's category. Desktop and phone run in
 * parallel on one database, so names and categories carry the viewport name.
 */

const isPhone = (info: TestInfo) => info.project.name === 'mobile';

/** Opens the capture panel the way the viewport does it: key N or the floating button. */
async function openCapture(page: Page, info: TestInfo): Promise<Locator> {
  // The shortcut only exists once the app has rendered.
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  if (isPhone(info)) await page.getByRole('link', { name: 'Buchung erfassen' }).click();
  else await page.keyboard.press('n');
  await expect(page).toHaveURL(/panel=buchung/);
  const panel = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await expect(panel).toBeVisible();
  return panel;
}

test('an expense by keyboard: arithmetic, Enter moves on, Ctrl+Enter saves, Available follows', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const account = `Kasse ${tag}`;
  const category = `Cap A ${tag}`;
  await createAccount(page, account, 'Giro', '1000');
  await openAccount(page, account);

  let panel = await openCapture(page, testInfo);
  // The account page is where the booking starts: its account is preselected.
  await expect(panel.getByLabel('Konto', { exact: true })).toHaveValue(/.+/);
  const amount = panel.getByLabel('Betrag', { exact: true });
  await expect(amount).toBeFocused();
  await amount.fill('12,50+8,20');
  await page.keyboard.press('Enter');
  await expect(amount).toHaveValue('20,70');
  await expect(panel.getByLabel('Empfänger')).toBeFocused();
  await page.keyboard.type(`Markt ${tag}`);
  await page.keyboard.press('Enter');
  const categoryField = panel.getByLabel('Kategorie', { exact: true });
  await expect(categoryField).toBeFocused();
  await page.keyboard.type(category);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(categoryField).toHaveValue(category);
  // Nothing is assigned to the test category, so its Available starts at 0.
  await expect(panel.locator('.kavail strong')).toHaveText('0,00 €');
  await page.keyboard.press('Control+Enter');

  await expect(page.getByRole('dialog', { name: 'Buchung erfassen' })).toBeHidden();
  await expect(page).not.toHaveURL(/panel=/);
  await expect(toast(page)).toContainText('Buchung gespeichert');
  const row = page.getByRole('row', { name: new RegExp(`Markt ${tag}`) });
  await expect(row).toBeVisible();
  // The new row flashes once (tx-in) and the balance follows without a reload.
  await expect(row).toHaveClass(/tx-flash/);
  await expect(balance(page)).toHaveText('979,30 €');

  // The category's Available of the month dropped by the amount, also without a reload.
  panel = await openCapture(page, testInfo);
  await pickCategory(panel, category);
  await expect(panel.locator('.kavail strong')).toHaveText('−20,70 €');
});

test('an income: Zu verteilen by default, income type, payee', async ({ page }, testInfo) => {
  const tag = testInfo.project.name;
  const account = `Lohn ${tag}`;
  await createAccount(page, account, 'Giro', '0');
  await openAccount(page, account);

  const panel = await openCapture(page, testInfo);
  await panel.getByRole('button', { name: 'Einnahme' }).click();
  await panel.getByLabel('Betrag', { exact: true }).fill('2500');
  await panel.getByLabel('Von (Zahler)').fill(`Firma ${tag}`);
  await expect(panel.getByLabel('Kategorie', { exact: true })).toHaveValue('Zu verteilen');
  await panel.getByLabel('Einnahmeart').selectOption({ label: 'Gehalt' });
  await panel.getByRole('button', { name: 'Speichern', exact: true }).click();

  const row = page.getByRole('row', { name: new RegExp(`Firma ${tag}`) });
  await expect(row).toContainText('Zu verteilen');
  await expect(balance(page)).toHaveText('2.500,00 €');
  // The income type is kept when the booking is opened again.
  await row.getByRole('button', { name: /bearbeiten/ }).click();
  const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await expect(edit.getByLabel('Einnahmeart')).toHaveValue(/.+/);
  await expect(edit.getByLabel('Einnahmeart').locator('option:checked')).toHaveText('Gehalt');
});

test('a transfer between accounts; to a tracking account it needs a category', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const giro = `Umbuchung Giro ${tag}`;
  const spar = `Umbuchung Spar ${tag}`;
  const depot = `Umbuchung Depot ${tag}`;
  await createAccount(page, giro, 'Giro', '1000');
  await createAccount(page, spar, 'Tagesgeld', '0');
  await createAccount(page, depot, 'Depot', '0');
  await openAccount(page, giro);

  let panel = await openCapture(page, testInfo);
  await panel.getByRole('button', { name: 'Umbuchung' }).click();
  await panel.getByLabel('Nach Konto').selectOption({ label: spar });
  await panel.getByLabel('Betrag', { exact: true }).fill('200');
  // Between budget accounts the transfer is neutral: no category is asked for.
  await expect(panel.getByLabel('Kategorie', { exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('row', { name: /Umbuchung nach/ })).toBeVisible();
  await expect(balance(page)).toHaveText('800,00 €');

  panel = await openCapture(page, testInfo);
  await panel.getByRole('button', { name: 'Umbuchung' }).click();
  await panel.getByLabel('Nach Konto').selectOption({ label: depot });
  await panel.getByLabel('Betrag', { exact: true }).fill('100');
  await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('brauchen eine Kategorie');
  await pickCategory(panel, `Cap C ${tag}`);
  await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Buchung erfassen' })).toBeHidden();
  await expect(balance(page)).toHaveText('700,00 €');
});

test('discard question, Speichern und neu keeps the context, the payee brings its category', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const account = `Bar ${tag}`;
  const category = `Cap D ${tag}`;
  const payee = `Bäckerei ${tag}`;
  await createAccount(page, account, 'Bargeld', '100');
  await openAccount(page, account);

  // Esc with input asks first; "Weiter bearbeiten" keeps everything.
  let panel = await openCapture(page, testInfo);
  await panel.getByLabel('Betrag', { exact: true }).fill('5');
  await page.keyboard.press('Escape');
  await expect(panel.getByText('Eingaben verwerfen?')).toBeVisible();
  await panel.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await expect(panel.getByText('Eingaben verwerfen?')).toBeHidden();
  await expect(panel.getByLabel('Betrag', { exact: true })).toHaveValue('5,00');
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Verwerfen' }).click();
  await expect(page.getByRole('dialog', { name: 'Buchung erfassen' })).toBeHidden();

  // Speichern und neu (Ctrl+Umschalt+Enter): the panel stays with payee, category and date.
  panel = await openCapture(page, testInfo);
  await panel.getByLabel('Betrag', { exact: true }).fill('5');
  await panel.getByLabel('Empfänger').fill(payee);
  await pickCategory(panel, category);
  const date = await panel.getByLabel('Datum', { exact: true }).inputValue();
  await page.keyboard.press('Control+Shift+Enter');
  await expect(panel.getByLabel('Betrag', { exact: true })).toHaveValue('');
  await expect(panel.getByLabel('Betrag', { exact: true })).toBeFocused();
  await expect(panel.getByLabel('Empfänger')).toHaveValue(payee);
  await expect(panel.getByLabel('Kategorie', { exact: true })).toHaveValue(category);
  await expect(panel.getByLabel('Datum', { exact: true })).toHaveValue(date);
  await panel.getByLabel('Betrag', { exact: true }).fill('3');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('row', { name: new RegExp(payee) })).toHaveCount(2);
  await expect(balance(page)).toHaveText('92,00 €');

  // A new capture: the payee's category is filled in as soon as the name is there.
  panel = await openCapture(page, testInfo);
  await panel.getByLabel('Empfänger').fill(payee);
  await expect(panel.getByLabel('Kategorie', { exact: true })).toHaveValue(category);
  // The last used account comes first.
  await expect(panel.getByLabel('Konto', { exact: true }).locator('option').first()).toHaveText(
    account,
  );
  // The open suggestion list must not shift the page: a click below it still lands.
  await expect(panel.getByRole('listbox')).toBeVisible();
  await panel.getByText('Mehr', { exact: true }).click();
  await expect(panel.getByLabel('Markierung')).toBeVisible();
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Verwerfen' }).click();
});

test('the capture panel is axe clean in both themes and never scrolls sideways', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const tag = testInfo.project.name;
  await createAccount(page, `Axe Kasse ${tag}`, 'Giro', '10');
  await createAccount(page, `Axe Spar ${tag}`, 'Tagesgeld', '0');
  await openAccount(page, `Axe Kasse ${tag}`);
  const violations = async () =>
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ rule: v.id, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme });
    await page.goto(page.url().replace(/\?.*$/, ''));
    const panel = await openCapture(page, testInfo);
    // Expense with the category list open, then income, then transfer.
    await panel.getByLabel('Kategorie', { exact: true }).focus();
    await expect(panel.getByRole('listbox')).toBeVisible();
    expect(await violations(), `${scheme} expense`).toEqual([]);
    await page.keyboard.press('Escape');
    await panel.getByRole('button', { name: 'Einnahme' }).click();
    expect(await violations(), `${scheme} income`).toEqual([]);
    await panel.getByRole('button', { name: 'Umbuchung' }).click();
    await panel.getByLabel('Nach Konto').selectOption({ label: `Axe Spar ${tag}` });
    expect(await violations(), `${scheme} transfer`).toEqual([]);
    // The split editor with a contact line and a transfer line.
    await panel.getByRole('button', { name: 'Ausgabe' }).click();
    await panel.getByLabel('Betrag', { exact: true }).fill('30');
    await panel.getByRole('button', { name: 'Aufteilen' }).click();
    const second = panel.getByRole('group', { name: 'Zeile 2', exact: true });
    await second.getByRole('button', { name: 'Kontakt' }).click();
    expect(await violations(), `${scheme} split contact line`).toEqual([]);
    await second.getByRole('button', { name: 'Umbuchung' }).click();
    expect(await violations(), `${scheme} split transfer line`).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      `${scheme} scrolls sideways`,
    ).toBe(true);
    // There is input in the panel: Esc asks before it goes away.
    await page.keyboard.press('Escape');
    await panel.getByRole('button', { name: 'Verwerfen' }).click();
    await expect(page.getByRole('dialog', { name: 'Buchung erfassen' })).toBeHidden();
  }
});

test('a split with a contact share: the chain shows what is left, saving waits until it is 0', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const account = `Teilen ${tag}`;
  await createAccount(page, account, 'Giro', '500');
  await openAccount(page, account);

  const panel = await openCapture(page, testInfo);
  await panel.getByLabel('Betrag', { exact: true }).fill('50');
  await panel.getByLabel('Empfänger').fill(`Restaurant ${tag}`);
  await panel.getByRole('button', { name: 'Aufteilen' }).click();
  const chain = panel.getByRole('group', { name: /Aufteilung: Betrag minus Verteilt/ });
  const save = panel.getByRole('button', { name: 'Speichern', exact: true });

  // Line 1: 30,00 for the category, line 2 (still empty) is Anna's share.
  const line1 = panel.getByRole('group', { name: 'Zeile 1', exact: true });
  const line2 = panel.getByRole('group', { name: 'Zeile 2', exact: true });
  await line1.getByLabel('Kategorie 1').selectOption({ value: `e2e-cap-E-${tag}` });
  await line1.getByLabel('Betrag 1').fill('30');
  await expect(chain).toContainText('20,00 €');
  await expect(save).toBeDisabled();
  await line2.getByRole('button', { name: 'Kontakt' }).click();
  await line2.getByLabel('Kontakt 2').selectOption({ label: 'Anna Muster' });
  await line2.getByRole('button', { name: 'Rest einsetzen' }).click();
  await expect(line2.getByLabel('Betrag 2')).toHaveValue('20,00');
  await expect(chain).toContainText('0,00 €');
  await expect(panel.getByText('Aufteilung geht auf.')).toBeVisible();
  await expect(save).toBeEnabled();
  await save.click();

  const row = page.getByRole('row', { name: new RegExp(`Restaurant ${tag}`) });
  await expect(row).toContainText('Aufgeteilt (2)');
  await expect(balance(page)).toHaveText('450,00 €');

  // Opening it again keeps each line: the contact share is still Anna's.
  await row.getByRole('button', { name: /bearbeiten/ }).click();
  const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await expect(edit.getByLabel('Kontakt 2').locator('option:checked')).toHaveText('Anna Muster');
  await expect(
    edit
      .getByRole('group', { name: 'Zeile 2', exact: true })
      .getByRole('button', { name: 'Kontakt' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('a transfer line in a split moves money to the other account', async ({ page }, testInfo) => {
  const tag = testInfo.project.name;
  const giro = `Zeile Giro ${tag}`;
  const spar = `Zeile Spar ${tag}`;
  await createAccount(page, giro, 'Giro', '300');
  await createAccount(page, spar, 'Tagesgeld', '0');
  await openAccount(page, giro);

  const panel = await openCapture(page, testInfo);
  await panel.getByLabel('Betrag', { exact: true }).fill('60');
  await panel.getByLabel('Empfänger').fill(`Bank ${tag}`);
  await panel.getByRole('button', { name: 'Aufteilen' }).click();
  const line1 = panel.getByRole('group', { name: 'Zeile 1', exact: true });
  const line2 = panel.getByRole('group', { name: 'Zeile 2', exact: true });
  await line1.getByLabel('Kategorie 1').selectOption({ value: `e2e-cap-E-${tag}` });
  await line1.getByLabel('Betrag 1').fill('40');
  await line2.getByRole('button', { name: 'Umbuchung' }).click();
  await line2.getByLabel('Nach Konto 2').selectOption({ label: spar });
  await line2.getByLabel('Betrag 2').fill('20');
  await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(balance(page)).toHaveText('240,00 €');
  await openAccount(page, spar);
  await expect(balance(page)).toHaveText('20,00 €');
});

test('an income with a contact share (repayment) books through Auslagen', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const account = `Rück ${tag}`;
  await createAccount(page, account, 'Giro', '0');
  await openAccount(page, account);

  const panel = await openCapture(page, testInfo);
  await panel.getByRole('button', { name: 'Einnahme' }).click();
  await panel.getByLabel('Betrag', { exact: true }).fill('40');
  await panel.getByLabel('Von (Zahler)').fill(`Anna ${tag}`);
  await panel.getByLabel('Rückzahlung von Kontakt').selectOption({ label: 'Anna Muster' });
  // The contact share has its own category (Auslagen): the category field is gone.
  await expect(panel.getByLabel('Kategorie', { exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
  const row = page.getByRole('row', { name: new RegExp(`Anna ${tag}`) });
  await expect(row).toContainText('Auslagen');
  await expect(balance(page)).toHaveText('40,00 €');
});
