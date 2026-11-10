import { captureSaveControl } from './ledger-helpers';
import { captureCloseControl } from './ledger-helpers';
import {
  redesignLoaded,
  categoryLineControl,
  again,
  MIN_TARGET_PX,
  openLedgerFilters,
  applyLedgerFilters,
  balance,
  createAccount,
  openAccount,
  pickCategory,
  toast,
  visit,
} from './ledger-helpers';

import AxeBuilder from '@axe-core/playwright';
import { minimumControlHeight } from './control-geometry';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

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
  if (isPhone(info)) {
    // Owner rule (#541): the FAB hides while scrolling down and returns on the way up, like a user.
    const fab = page.getByRole('link', { name: 'Buchung erfassen' });
    if (!(await fab.isVisible())) await page.evaluate(() => window.scrollTo(0, 0));
    await fab.click();
  } else {
    // The key is ignored while a previous dialog is still closing.
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.keyboard.press('n');
  }
  await expect(page).toHaveURL(/panel=buchung/);
  const panel = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await expect(panel).toBeVisible();
  return panel;
}

test('an expense by keyboard: arithmetic, Enter moves on, Ctrl+Enter saves, Available follows', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const account = `Kasse ${tag}${again(testInfo)}`;
  const category = `Cap A ${tag}`;
  await createAccount(page, account, 'Giro', '1000');
  await openAccount(page, account);

  let panel = await openCapture(page, testInfo);
  // The account page is where the booking starts: its account is preselected.
  await expect(panel.getByLabel('Bezahlt von', { exact: true })).toHaveValue(/.+/);
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

  // The new row flashes once (tx-in, half a second): checked first, before the dialog is gone.
  const row = page.getByRole('row', { name: new RegExp(`Markt ${tag}`) });
  await expect(row).toHaveClass(/tx-flash/);
  await expect(page.getByRole('dialog', { name: 'Buchung erfassen' })).toBeHidden();
  await expect(page).not.toHaveURL(/panel=/);
  await expect(toast(page)).toContainText('Buchung gespeichert');
  await expect(row).toBeVisible();
  // The balance follows without a reload.
  await expect(balance(page)).toHaveText('979,30 €');

  // The category's Available of the month dropped by the amount, also without a reload.
  panel = await openCapture(page, testInfo);
  await pickCategory(panel, category);
  await expect(panel.locator('.kavail strong')).toHaveText('−20,70 €');
});

test('an income: Zu verteilen by default, income type, payee', async ({ page }, testInfo) => {
  const tag = testInfo.project.name;
  const account = `Lohn ${tag}${again(testInfo)}`;
  await createAccount(page, account, 'Giro', '0');
  await openAccount(page, account);

  const panel = await openCapture(page, testInfo);
  await panel.getByRole('button', { name: 'Einnahme' }).click();
  await panel.getByLabel('Betrag', { exact: true }).fill('2500');
  await panel.getByLabel('Von (Zahler)').fill(`Firma ${tag}`);
  await expect(panel.getByLabel('Kategorie', { exact: true })).toHaveValue('Zu verteilen');
  await panel.getByLabel('Einnahmeart').selectOption({ label: 'Gehalt' });
  await captureSaveControl(panel).click();

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
  const giro = `Umbuchung Giro ${tag}${again(testInfo)}`;
  const spar = `Umbuchung Spar ${tag}${again(testInfo)}`;
  const depot = `Umbuchung Depot ${tag}${again(testInfo)}`;
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
  await captureSaveControl(panel).click();
  await expect(page.getByRole('row', { name: /Umbuchung nach/ })).toBeVisible();
  await expect(balance(page)).toHaveText('800,00 €');

  panel = await openCapture(page, testInfo);
  await panel.getByRole('button', { name: 'Umbuchung' }).click();
  await panel.getByLabel('Nach Konto').selectOption({ label: depot });
  await panel.getByLabel('Betrag', { exact: true }).fill('100');
  if ((await redesignLoaded(page)) && page.viewportSize()!.width < 768) {
    await expect(captureSaveControl(panel)).toBeDisabled();
    await expect(captureSaveControl(panel)).toHaveAccessibleDescription(/brauchen eine Kategorie/);
    await panel.getByLabel('Betrag', { exact: true }).press('Control+Enter');
  } else await captureSaveControl(panel).click();
  await expect(panel.getByRole('alert')).toContainText('brauchen eine Kategorie');
  await pickCategory(panel, `Cap C ${tag}`);
  await captureSaveControl(panel).click();
  await expect(page.getByRole('dialog', { name: 'Buchung erfassen' })).toBeHidden();
  await expect(balance(page)).toHaveText('700,00 €');
});

test('discard question, Speichern und neu keeps the context, the payee brings its category', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const account = `Bar ${tag}${again(testInfo)}`;
  const category = `Cap D ${tag}`;
  const payee = `Bäckerei ${tag}`;
  await createAccount(page, account, 'Bargeld', '100');
  await openAccount(page, account);

  // Esc with input asks first; "Weiter bearbeiten" keeps everything.
  let panel = await openCapture(page, testInfo);
  await panel.getByLabel('Betrag', { exact: true }).fill('5,00');
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
  await panel.getByLabel('Betrag', { exact: true }).fill('5,00');
  await panel.getByLabel('Empfänger').fill(payee);
  await pickCategory(panel, category);
  const date = await panel.getByLabel('Datum', { exact: true }).inputValue();
  await page.keyboard.press('Control+Shift+Enter');
  await expect(panel.getByLabel('Betrag', { exact: true })).toHaveValue('');
  await expect(panel.getByLabel('Betrag', { exact: true })).toBeFocused();
  await expect(panel.getByLabel('Empfänger')).toHaveValue(payee);
  await expect(panel.getByLabel('Kategorie', { exact: true })).toHaveValue(category);
  await expect(panel.getByLabel('Datum', { exact: true })).toHaveValue(date);
  await panel.getByLabel('Betrag', { exact: true }).fill('3,00');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('row', { name: new RegExp(payee) })).toHaveCount(2);
  await expect(balance(page)).toHaveText('92,00 €');

  // A new capture: the payee's category is filled in once the payee is chosen (here: Enter moves
  // on), not while its name is still being typed.
  panel = await openCapture(page, testInfo);
  await panel.getByLabel('Empfänger').fill(payee);
  await expect(panel.getByLabel('Kategorie', { exact: true })).toHaveValue('');
  await page.keyboard.press('Enter');
  await expect(panel.getByLabel('Kategorie', { exact: true })).toHaveValue(category);
  // The last used account is preselected (the list itself is grouped like the sidebar).
  await expect(
    panel.getByLabel('Bezahlt von', { exact: true }).locator('option:checked'),
  ).toHaveText(account);
  // Phone redesign explains disabled save quietly; desktop and OFF keep after-input timing.
  // Invalid dates remain refused while payee suggestions are open.
  await expect(panel.getByRole('button', { name: 'Speichern und neu' })).toBeDisabled();
  const phoneRedesign = (page.viewportSize()?.width ?? 1440) < 768 && (await redesignLoaded(page));
  if (phoneRedesign)
    await expect(panel.locator('.bk-save-hint')).toHaveText('Jede Zeile braucht einen Betrag.');
  else await expect(panel.locator('.bk-save-reason')).toHaveCount(0);
  await panel.getByLabel('Betrag', { exact: true }).fill('0');
  await expect(panel.locator('#booking-save-reason')).toContainText(
    'Jede Zeile braucht einen Betrag.',
  );
  await expect(panel.getByRole('button', { name: 'Speichern und neu' })).toBeDisabled();
  await panel.getByLabel('Betrag', { exact: true }).fill('1,00');
  await panel.getByLabel('Datum', { exact: true }).fill('31.02.2026');
  await panel.getByLabel('Empfänger', { exact: true }).press('ArrowDown');
  await expect(panel.getByRole('listbox')).toBeVisible();
  if (phoneRedesign) {
    await expect(panel.getByRole('button', { name: 'Speichern und neu' })).toBeDisabled();
    await panel.getByLabel('Empfänger', { exact: true }).press('Control+Shift+Enter');
  } else await panel.getByRole('button', { name: 'Speichern und neu' }).click();
  await expect(panel.getByRole('alert').first()).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(payee) })).toHaveCount(2);
  if (phoneRedesign) {
    await expect(panel.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel.getByRole('listbox')).toBeHidden();
  }
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Verwerfen' }).click();
});

test('the capture panel is axe clean in both themes and never scrolls sideways', async ({
  page,
}, testInfo) => {
  test.setTimeout(Math.max(90_000, testInfo.timeout));
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
    if (!(await redesignLoaded(page)) || page.viewportSize()!.width >= 768)
      await panel.locator('.kmore > summary').click();
    await (await categoryLineControl(panel)).click();
    const second = panel.getByRole('group', { name: 'Zeile 2', exact: true });
    await second.getByLabel('Kategorie 2').fill('Anna Muster');
    await second.getByRole('option', { name: /Anna Muster/ }).click();
    expect(await violations(), `${scheme} split contact line`).toEqual([]);
    await second.getByLabel('Kategorie 2').fill('Umbuchung');
    await second.getByRole('option', { name: new RegExp(`Axe Spar ${tag}`) }).click();
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
  const account = `Teilen ${tag}${again(testInfo)}`;
  await createAccount(page, account, 'Giro', '500');
  await openAccount(page, account);

  const panel = await openCapture(page, testInfo);
  await panel.getByLabel('Betrag', { exact: true }).fill('50');
  await panel.getByLabel('Empfänger').fill(`Restaurant ${tag}`);
  if (!(await redesignLoaded(page)) || page.viewportSize()!.width >= 768)
    await panel.locator('.kmore > summary').click();
  await (await categoryLineControl(panel)).click();
  const chain = panel.locator('.bk-lines > .kdiff');
  const save = captureSaveControl(panel);

  // Line 1: 30,00 for the category, line 2 (still empty) is Anna's share.
  const line1 = panel.getByRole('group', { name: 'Zeile 1', exact: true });
  const line2 = panel.getByRole('group', { name: 'Zeile 2', exact: true });
  await line1.getByLabel('Kategorie 1').fill(`Cap E ${tag}`);
  await line1.getByRole('option', { name: new RegExp(`^Cap E ${tag}`) }).click();
  await line1.getByLabel('Betrag 1').fill('30');
  await expect(chain).toContainText('20,00 €');
  await expect(save).toBeDisabled();
  await line2.getByLabel('Kategorie 2').fill('Anna Muster');
  await line2.getByRole('option', { name: /Anna Muster/ }).click();
  await line2.getByRole('button', { name: 'Rest verteilen in Zeile 2' }).click();
  await expect(line2.getByLabel('Betrag 2')).toHaveValue('20,00');
  await expect(chain).toContainText(/\d,\d\d €/);
  await expect(chain).toContainText('Rest: 0,00');
  await expect(save).toBeEnabled();
  await save.click();

  const row = page.getByRole('row', { name: new RegExp(`Restaurant ${tag}`) });
  await expect(row).toContainText('Aufgeteilt (2)');
  await expect(balance(page)).toHaveText('450,00 €');

  // Opening it again keeps each line: the contact share is still Anna's.
  await row.getByRole('button', { name: /bearbeiten/ }).click();
  const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await expect(edit.getByLabel('Kategorie 2')).toHaveValue(/Anna Muster/);
});

test('a transfer line in a split moves money to the other account', async ({ page }, testInfo) => {
  const tag = testInfo.project.name;
  const giro = `Zeile Giro ${tag}${again(testInfo)}`;
  const spar = `Zeile Spar ${tag}${again(testInfo)}`;
  await createAccount(page, giro, 'Giro', '300');
  await createAccount(page, spar, 'Tagesgeld', '0');
  await openAccount(page, giro);

  const panel = await openCapture(page, testInfo);
  await panel.getByLabel('Betrag', { exact: true }).fill('60');
  await panel.getByLabel('Empfänger').fill(`Bank ${tag}`);
  if (!(await redesignLoaded(page)) || page.viewportSize()!.width >= 768)
    await panel.locator('.kmore > summary').click();
  await (await categoryLineControl(panel)).click();
  const line1 = panel.getByRole('group', { name: 'Zeile 1', exact: true });
  const line2 = panel.getByRole('group', { name: 'Zeile 2', exact: true });
  await line1.getByLabel('Kategorie 1').fill(`Cap E ${tag}`);
  await line1.getByRole('option', { name: new RegExp(`^Cap E ${tag}`) }).click();
  await line1.getByLabel('Betrag 1').fill('40');
  await line2.getByLabel('Kategorie 2').fill(spar);
  await line2.getByRole('option', { name: new RegExp(spar) }).click();
  await line2.getByLabel('Betrag 2').fill('20');
  await captureSaveControl(panel).click();
  await expect(balance(page)).toHaveText('240,00 €');
  await expect(panel).toBeHidden();
  await openAccount(page, spar);
  await expect(balance(page)).toHaveText('20,00 €');
});

test('an income with a contact share (repayment) books through Auslagen', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const account = `Rück ${tag}${again(testInfo)}`;
  await createAccount(page, account, 'Giro', '0');
  await openAccount(page, account);

  const panel = await openCapture(page, testInfo);
  await panel.getByRole('button', { name: 'Einnahme' }).click();
  await panel.getByLabel('Betrag', { exact: true }).fill('40');
  await panel.getByLabel('Von (Zahler)').fill(`Anna ${tag}`);
  await panel.getByLabel('Kategorie', { exact: true }).fill('Anna Muster');
  await panel.getByRole('option', { name: /Anna Muster/ }).click();
  await expect(panel.getByLabel('Kategorie', { exact: true })).toHaveValue(/Anna Muster/);
  await captureSaveControl(panel).click();
  const row = page.getByRole('row', { name: new RegExp(`Anna ${tag}`) });
  await expect(row).toContainText('Auslagen');
  await expect(balance(page)).toHaveText('40,00 €');
});

test('Ctrl+Enter held or pressed twice sends the booking once', async ({ page }, testInfo) => {
  const tag = testInfo.project.name;
  await createAccount(page, `Doppelt ${tag}${again(testInfo)}`, 'Giro', '100');
  await openAccount(page, `Doppelt ${tag}${again(testInfo)}`);
  // A slow answer keeps the first save in flight while the second key press arrives.
  let posts = 0;
  await page.route('**/api/bookings', async (route) => {
    if (route.request().method() === 'POST') {
      posts += 1;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    await route.continue();
  });
  const panel = await openCapture(page, testInfo);
  await panel.getByLabel('Betrag', { exact: true }).fill('7,00');
  await pickCategory(panel, `Cap A ${tag}`);
  await page.keyboard.press('Control+Enter');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('dialog', { name: 'Buchung erfassen' })).toBeHidden();
  await expect(balance(page)).toHaveText('93,00 €');
  expect(posts).toBe(1);
});

test('a second Esc without any interaction still asks before discarding', async ({
  page,
}, testInfo) => {
  await visit(page, '/');
  const panel = await openCapture(page, testInfo);
  await panel.getByLabel('Betrag', { exact: true }).fill('5,00');
  // Chrome lets a repeated Esc close a dialog without a cancel event unless it is handled.
  await page.keyboard.press('Escape');
  await expect(panel.getByText('Eingaben verwerfen?')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Eingaben verwerfen?')).toBeVisible();
  // The question now takes focus (#314), so the amount field blurs and shows its canonical form.
  await expect(panel.getByLabel('Betrag', { exact: true })).toHaveValue('5,00');
});

test('the dialog is a centred card on the desktop and a sheet on the phone with a direct date input', async ({
  page,
}, testInfo) => {
  await visit(page, '/');
  const panel = await openCapture(page, testInfo);
  const box = await panel.boundingBox();
  const viewport = page.viewportSize()!;
  if (isPhone(testInfo)) {
    // Bottom sheet: full width, resting on the bottom edge.
    expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(viewport.height - 1);
  } else {
    // The redesigned two-column card is wider; both builds keep a gap to every edge.
    expect(Math.round(box!.width)).toBe(960);
    expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(2);
    expect(box!.y).toBeGreaterThan(8);
    expect(box!.x + box!.width).toBeLessThan(viewport.width);
  }
  await expect(panel.getByRole('group', { name: 'Schnellwahl' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Gestern' })).toHaveCount(0);
  // The mobile redesign puts category before account/date in visual and keyboard order.
  const wanted = ['Betrag', 'Empfänger', 'Bezahlt von', 'Datum', 'Kategorie', 'Notiz'];
  const order = await panel.evaluate(
    (el, names) =>
      Array.from(el.querySelectorAll('label'))
        .map((l) => l.textContent?.trim() ?? '')
        .filter((t) => names.includes(t)),
    wanted,
  );
  expect(order).toEqual(
    (await redesignLoaded(page))
      ? isPhone(testInfo)
        ? ['Betrag', 'Empfänger', 'Kategorie', 'Bezahlt von', 'Datum', 'Notiz']
        : ['Betrag', 'Empfänger', 'Datum', 'Bezahlt von', 'Kategorie', 'Notiz']
      : wanted,
  );
  // The phone save action is reachable at the end of the scrolling form.
  await captureSaveControl(panel).scrollIntoViewIfNeeded();
  await expect(captureSaveControl(panel)).toBeInViewport();
});

test('no flag UI in the register or dialog; editing keeps a stored flag', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const account = `Flagge ${tag}${again(testInfo)}`;
  await createAccount(page, account, 'Giro', '100');
  await openAccount(page, account);

  const panel = await openCapture(page, testInfo);
  await expect(panel.getByRole('button', { name: /^Markierung/ })).toHaveCount(0);
  await expect(panel.getByLabel('Markierung', { exact: true })).toHaveCount(0);
  await expect(panel.getByTitle('Markieren')).toHaveCount(0);

  await panel.getByLabel('Betrag', { exact: true }).fill('9,00');
  await panel.getByLabel('Empfänger').fill(`Kiosk ${tag}`);
  await pickCategory(panel, `Cap A ${tag}`);
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('dialog', { name: 'Buchung erfassen' })).toBeHidden();

  // The register has no flag column, glyph or button (#1040).
  const row = page.getByRole('row', { name: new RegExp(`Kiosk ${tag}`) });
  await expect(page.getByRole('columnheader', { name: 'Markierung' })).toHaveCount(0);
  await expect(row.getByRole('button', { name: /Markierung/ })).toHaveCount(0);

  // Pre-flag the booking through the API (the UI cannot set it any more); an edit must keep it.
  const id = await row.getAttribute('data-booking');
  const origin = new URL(page.url()).origin;
  const flagged = await page.request.patch(`/api/bookings/${id}`, {
    headers: { origin },
    data: { flag: 'yellow' },
  });
  expect(flagged.ok(), await flagged.text()).toBe(true);
  await page.reload();

  await row.getByRole('button', { name: /bearbeiten/ }).click();
  const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await expect(edit.getByRole('button', { name: /^Markierung/ })).toHaveCount(0);
  await edit.getByLabel('Notiz').fill('Notiz geändert');
  await captureSaveControl(edit).click();
  await expect(edit).toBeHidden();
  const stored = await (await page.request.get(`/api/bookings/${id}`)).json();
  expect(stored.booking.flag).toBe('yellow');
  expect(stored.booking.memo).toBe('Notiz geändert');
});

test('the checkmark: a new booking starts pending and can be confirmed', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const account = `Status ${tag}${again(testInfo)}`;
  await createAccount(page, account, 'Giro', '100');
  await openAccount(page, account);

  const panel = await openCapture(page, testInfo);
  const toggle = panel.getByRole('button', { name: 'Vorgemerkt', exact: true });
  // Status is labelled beside the account, with the same state-specific accessible name.
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveAttribute('title', 'Vorgemerkt');
  await expect(toggle).toHaveText('Vorgemerkt');
  await expect(panel.getByLabel('Budgetmonat')).toHaveCount(0);
  await panel.getByLabel('Betrag', { exact: true }).fill('4,00');
  await panel.getByLabel('Empfänger').fill(`Vormerk ${tag}`);
  await pickCategory(panel, `Cap B ${tag}`);
  await page.keyboard.press('Control+Enter');
  const row = page.getByRole('row', { name: new RegExp(`Vormerk ${tag}`) });
  await expect(row.getByRole('button', { name: 'vorgemerkt', exact: true })).toBeVisible();

  // Opened again it shows the stored status; pressing the toggle confirms the booking.
  await row.getByRole('button', { name: /bearbeiten/ }).click();
  const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  const editToggle = edit.locator('.bk-status');
  await expect(editToggle).toHaveAttribute('aria-pressed', 'false');
  await editToggle.click();
  await expect(editToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(editToggle).toHaveAccessibleName('Bestätigt');
  await expect(editToggle).toHaveAttribute('title', 'Bestätigt');
  await captureSaveControl(edit).click();
  await expect(edit).toBeHidden();
  await expect(row.getByRole('button', { name: 'bestätigt', exact: true })).toBeVisible();
  await row.getByRole('button', { name: /bearbeiten/ }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Buchung bearbeiten' })
      .getByRole('button', { name: 'Bestätigt', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('Auslage für Kontakt: a new contact is created in place and selected at once', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const account = `Neuer Kontakt ${tag}${again(testInfo)}`;
  const name = `Bea ${tag}${again(testInfo)}`;
  await createAccount(page, account, 'Giro', '200');
  await openAccount(page, account);

  const panel = await openCapture(page, testInfo);
  await panel.getByLabel('Betrag', { exact: true }).fill('15');
  await panel.getByLabel('Empfänger').fill(`Kino ${tag}`);
  const contact = panel.getByLabel('Kategorie', { exact: true });
  await contact.fill('Kontakt neu');
  await panel.getByRole('option', { name: 'Kontakt neu anlegen' }).click();
  const field = panel.getByLabel('Name des neuen Kontakts');
  await expect(field).toBeFocused();
  // Enter creates the contact; it does not move on in the booking form.
  await field.fill(name);
  await page.keyboard.press('Enter');
  await expect(field).toBeHidden();
  await expect(contact).toHaveValue(new RegExp(name));
  await expect(toast(page)).toContainText(`Kontakt „${name}“ angelegt`);
  // The contact is there for the contacts API as well.
  const response = await page.request.get('/api/contacts?history=1');
  expect(JSON.stringify(await response.json())).toContain(name);
  await page.keyboard.press('Control+Enter');
  const row = page.getByRole('row', { name: new RegExp(`Kino ${tag}`) });
  await expect(row).toContainText('Auslagen');
  await expect(balance(page)).toHaveText('185,00 €');
  // The booking has its own undo; the contact stays with the contacts.
  await row.getByRole('button', { name: /bearbeiten/ }).click();
  const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await expect(edit.getByLabel('Kategorie', { exact: true })).toHaveValue(new RegExp(name));
});

test('the category list: grouped by category group, no archived ones, Verfügbar on each option', async ({
  page,
}, testInfo) => {
  await visit(page, '/');
  const panel = await openCapture(page, testInfo);
  await panel.getByLabel('Kategorie', { exact: true }).focus();
  const list = panel.getByRole('listbox', { name: /Kategorie, Vorschläge/ });
  await expect(list).toBeVisible();
  // Group headers are the category groups (here "Fixkosten"), the column says Verfügbar.
  await expect(list.locator('.combo-group', { hasText: 'Fixkosten' })).toBeVisible();
  await expect(list.locator('.combo-head')).toHaveText('Verfügbar');
  await expect(list.getByRole('option', { name: /^Essen/ })).toContainText(/\d,\d\d €/);
  // The archived category is not offered.
  await expect(list.getByRole('option', { name: /Archiv Alt/ })).toHaveCount(0);
  // The same list filters the bookings.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await visit(page, '/konten/buchungen');
  await openLedgerFilters(page);
  await page.getByLabel('Kategorie', { exact: true }).focus();
  const filter = page.getByRole('listbox', { name: /Kategorie, Vorschläge/ });
  await expect(filter.getByRole('option', { name: 'Alle Kategorien' })).toBeVisible();
  await expect(filter.getByRole('option', { name: 'ohne Kategorie' })).toBeVisible();
  await expect(filter.locator('.combo-group', { hasText: 'Fixkosten' })).toBeVisible();
  await expect(filter.getByRole('option', { name: /Archiv Alt/ })).toHaveCount(0);
  await filter.getByRole('option', { name: /^Essen/ }).click();
  await applyLedgerFilters(page);
  await expect(page).toHaveURL(/kategorie=e2e-essen/);
  await openLedgerFilters(page);
  await expect(page.getByLabel('Kategorie', { exact: true })).toHaveValue('Essen');
});

test('visible growing note, direct split and responsive account note column', async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name;
  const account = `Notiz Muster ${tag}${again(testInfo)}`;
  const payee = `Notizladen Muster ${tag}${again(testInfo)}`;
  await createAccount(page, account, 'Giro', '100');
  await openAccount(page, account);
  let panel = await openCapture(page, testInfo);
  const memo =
    ((await redesignLoaded(page)) ? 'Zusätzliche synthetische Zeile.\n'.repeat(8) : '') +
    'Synthetische Notiz mit langem Inhalt zur Darstellung im Register.\nZweite Zeile zur Prüfung des wachsenden Feldes.\nDritte Zeile.';
  const note = panel.getByLabel('Notiz', { exact: true });
  const split = await categoryLineControl(panel);
  await expect(panel.locator('.kmore')).not.toHaveAttribute('open', '');
  await expect(note).toBeVisible();
  await expect(split).toBeVisible();
  // Compare intrinsic heights only after the phone sheet's opening transform has settled.
  await panel.evaluate(async (element) => {
    const finite = element
      .getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
  const initialHeight = (await note.boundingBox())!.height;
  await note.fill(memo);
  expect((await note.boundingBox())!.height).toBeGreaterThan(initialHeight);
  await note.fill('Kurz');
  expect((await note.boundingBox())!.height).toBe(initialHeight);
  await note.fill(memo);
  // Measure controls after the finite phone-sheet transform, using the existing dialog pattern.
  await panel.evaluate(async (element) => {
    const finite = element
      .getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
  for (const control of [note, split, panel.locator('.bk-status'), captureCloseControl(panel)]) {
    const box = (await control.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(await minimumControlHeight(control));
    expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  }
  await panel.getByLabel('Betrag', { exact: true }).fill('5,00');
  await panel.getByLabel('Empfänger').fill(payee);
  await pickCategory(panel, `Cap A ${tag}`);
  await page.screenshot({ path: testInfo.outputPath(`dialog-${tag}.png`) });
  await captureSaveControl(panel).click();
  await expect(panel).toBeHidden({ timeout: 30_000 });
  const row = page.getByRole('row', { name: new RegExp(payee) });
  await expect(row).toBeVisible({ timeout: 30_000 });
  if (isPhone(testInfo)) {
    await expect(page.getByRole('columnheader', { name: 'Notiz', exact: true })).toBeHidden();
    await expect(row.locator('.kx-mobile-note')).toHaveText(memo);
    await expect(row.locator('.kx-mobile-note')).toBeVisible();
    await expect(row.locator('.kx-note')).toBeHidden();
  } else {
    await expect(page.getByRole('columnheader', { name: 'Notiz', exact: true })).toBeVisible();
    await expect(row.locator('.kx-mobile-note')).toBeHidden();
    await expect(row.locator('.kx-note span')).toHaveAttribute('title', memo);
    expect(
      await row.locator('.kx-note span').evaluate((el) => el.scrollWidth > el.clientWidth),
    ).toBe(true);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`register-${tag}.png`) });
  await row.getByRole('button', { name: /bearbeiten/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'Buchung bearbeiten' }).getByLabel('Notiz'),
  ).toHaveValue(memo);
  const editor = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await editor.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  panel = await openCapture(page, testInfo);
  await (await categoryLineControl(panel)).click();
  await expect(panel.getByRole('group', { name: 'Zeile 1', exact: true })).toBeVisible();
  await expect(panel.getByRole('group', { name: 'Zeile 2', exact: true })).toBeVisible();
  await expect(panel.locator('.kmore')).not.toHaveAttribute('open', '');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
