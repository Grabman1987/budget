import { captureSaveControl, redesignLoaded } from './ledger-helpers';
import { expect, test } from '@playwright/test';
import {
  openAccountCapture,
  again,
  balance,
  createAccount,
  openAccount,
  pickCategory,
  toast,
} from './ledger-helpers';

/**
 * Issue #672: a toast must never cover the primary action of the dialog it is shown over. The
 * "Kontostand geprüft" toast is the widest one; it was still on screen when the booking dialog
 * opened and sat on its Speichern button. The click below is a plain `click()`: no waiting for
 * the toast to disappear and no forced click. A toast stays in the layer it was raised in: the
 * one raised on the page stays on the page (behind the dialog backdrop) and is not moved into the
 * dialog that opens afterwards, so it can never cover the dialog's buttons.
 */
test('a visible toast does not cover the Speichern button of an open dialog', async ({
  page,
}, testInfo) => {
  const tag = `${testInfo.project.name}${again(testInfo)}`;
  const name = `Toast ${tag}`;
  const payee = `Laden ${tag}`;
  await createAccount(page, name, 'Giro', '500');
  await openAccount(page, name);

  await openAccountCapture(page);
  const capture = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await capture.getByLabel('Betrag', { exact: true }).fill('20');
  await capture.getByLabel('Empfänger').fill(payee);
  await pickCategory(capture, 'Essen');
  // Only a confirmed booking can be checked against the bank.
  await capture.getByRole('button', { name: 'Vorgemerkt', exact: true }).click();
  await captureSaveControl(capture).click();
  await expect(page.getByRole('row', { name: new RegExp(payee) })).toBeVisible();
  await expect(balance(page)).toHaveText('480,00 €');

  await page.getByRole('button', { name: 'Kontostand prüfen' }).click();
  const check = page.getByRole('dialog', { name: `Kontostand prüfen · ${name}` });
  await check.getByLabel('Saldo laut Bank', { exact: true }).fill('480');
  await check.getByRole('button', { name: 'Kontostand stimmt' }).click();
  await expect(toast(page)).toContainText('Kontostand geprüft');

  // The toast is still open (6 s) when the edit dialog opens; it must stay on the page.
  await page
    .getByRole('row', { name: new RegExp(payee) })
    .getByRole('button', { name: /Betrag ändern/ })
    .click();
  const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await expect(edit).toBeVisible();
  await expect(toast(page)).toContainText('Kontostand geprüft');
  await edit.getByLabel('Betrag', { exact: true }).fill('21');

  // The open toast is not part of the dialog; the page toast is still there.
  await expect(edit.locator('.toast.is-open')).toHaveCount(0);
  await expect(toast(page)).toHaveCount(1);

  const save = captureSaveControl(edit);
  if ((await redesignLoaded(page)) && page.viewportSize()!.width < 768) {
    // Phone save exposes the existing lock guard before submitting a protected change.
    await expect(save).toBeDisabled();
    await expect(save).toHaveAccessibleDescription(/geprüft/);
    await edit.getByLabel('Betrag', { exact: true }).press('Control+Enter');
    await expect(edit.getByRole('alert')).toContainText('geprüft');
    // A note is freely editable on a checked booking, so exercise a valid plain click too.
    await edit.getByLabel('Betrag', { exact: true }).fill('20');
    const note = `Synthetic toast note ${tag}`;
    await edit.getByLabel('Notiz', { exact: true }).fill(note);
    await expect(save).toBeEnabled();
    await expect(toast(page)).toBeVisible();
    await expect(toast(page)).toContainText('Kontostand geprüft');
    await save.click();
    await expect(edit).toBeHidden();
    await expect(balance(page)).toHaveText('480,00 €');
    await page
      .getByRole('row', { name: new RegExp(payee) })
      .getByRole('button', { name: /Betrag ändern/ })
      .click();
    await expect(edit.getByLabel('Notiz', { exact: true })).toHaveValue(note);
  } else {
    await save.click();
    // The checked booking answers with the release prompt: proof the click landed.
    await expect(edit.getByRole('alert')).toContainText('geprüft');
  }
});
