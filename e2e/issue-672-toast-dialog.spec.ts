import { expect, test, type Locator } from '@playwright/test';
import { again, balance, createAccount, openAccount, pickCategory, toast } from './ledger-helpers';

type Box = { x: number; y: number; width: number; height: number };
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (inner: Box, outer: Box) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5;
async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element has no box');
  return b;
}

/**
 * Issue #672: a toast must never cover the primary action of the dialog it is shown over. The
 * "Kontostand geprüft" toast is the widest one; it was still on screen when the booking dialog
 * opened and sat on its Speichern button. The click below is a plain `click()`: no waiting for
 * the toast to disappear and no forced click. Inside a dialog the toast is part of the card flow,
 * so its box also never intersects the boxes of the dialog's buttons and lies inside the card.
 */
test('a visible toast does not cover the Speichern button of an open dialog', async ({
  page,
}, testInfo) => {
  const tag = `${testInfo.project.name}${again(testInfo)}`;
  const name = `Toast ${tag}`;
  const payee = `Laden ${tag}`;
  await createAccount(page, name, 'Giro', '500');
  await openAccount(page, name);

  await page.getByRole('button', { name: 'Buchung erfassen' }).click();
  const capture = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await capture.getByLabel('Betrag', { exact: true }).fill('20');
  await capture.getByLabel('Empfänger').fill(payee);
  await pickCategory(capture, 'Essen');
  // Only a confirmed booking can be checked against the bank.
  await capture.getByRole('button', { name: 'Vorgemerkt', exact: true }).click();
  await capture.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('row', { name: new RegExp(payee) })).toBeVisible();
  await expect(balance(page)).toHaveText('480,00 €');

  await page.getByRole('button', { name: 'Kontostand prüfen' }).click();
  const check = page.getByRole('dialog', { name: `Kontostand prüfen · ${name}` });
  await check.getByLabel('Saldo laut Bank', { exact: true }).fill('480');
  await check.getByRole('button', { name: /Festschreiben/ }).click();
  await expect(toast(page)).toContainText('Kontostand geprüft');

  // The toast is still open (6 s) when the edit dialog opens and takes it over.
  await page
    .getByRole('row', { name: new RegExp(payee) })
    .getByRole('button', { name: /Betrag ändern/ })
    .click();
  const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await expect(edit).toBeVisible();
  await expect(toast(page)).toContainText('Kontostand geprüft');
  await edit.getByLabel('Betrag', { exact: true }).fill('21');

  // Geometry: the open toast lies inside the dialog and overlaps none of its buttons.
  const toastBox = await box(toast(page).locator('.toast-body'));
  expect(inside(toastBox, await box(edit))).toBe(true);
  const buttons = edit.locator('.bk-foot').getByRole('button');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    expect(intersects(toastBox, await box(buttons.nth(i)))).toBe(false);
  }
  expect(
    intersects(toastBox, await box(edit.getByRole('button', { name: 'Speichern', exact: true }))),
  ).toBe(false);

  await edit.getByRole('button', { name: 'Speichern', exact: true }).click();
  // The booking is checked, so Speichern answers with the release prompt: proof the click landed.
  await expect(edit.getByRole('alert')).toContainText('geprüft');
});
