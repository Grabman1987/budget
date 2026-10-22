import { expect, test } from '@playwright/test';
import { again, balance, createAccount, openAccount, pickCategory, toast } from './ledger-helpers';

test('a saved booking toast leaves the mobile capture action reachable', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const tag = `${info.project.name}${again(info)}`;
  const account = `Toast FAB ${tag}`;
  await createAccount(page, account, 'Giro', '500');
  await openAccount(page, account);
  const fab = page.getByRole('link', { name: 'Buchung erfassen', exact: true });
  await fab.click();
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
  await dialog.getByLabel('Betrag', { exact: true }).fill('20');
  await dialog.getByLabel('Empfänger').fill(`Toast shop ${tag}`);
  await pickCategory(dialog, 'Essen');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(balance(page)).toHaveText('480,00 €');
  await expect(toast(page)).toContainText('Buchung gespeichert');
  // Ordinary focus keeps the real Undo toast open throughout the reachability check.
  await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).focus();
  const geometry = await fab.evaluate((element) => ({
    fabTop: element.getBoundingClientRect().top,
    toastBottom: document.querySelector('.toast.is-open .toast-body')!.getBoundingClientRect()
      .bottom,
  }));
  expect(geometry.toastBottom).toBeLessThanOrEqual(geometry.fabTop);
  await page.screenshot({ path: info.outputPath('toast-fab.png'), animations: 'disabled' });
  await fab.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Betrag', { exact: true })).toBeFocused();
  // This toast originated in capture, so reopening the same host returns it to that layer.
  await expect(dialog.locator('.toast.is-open')).toHaveCount(1);
  await expect(toast(page)).toContainText('Buchung gespeichert');
  await expect(balance(page)).toHaveText('480,00 €');
});
