import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { sampleTest as test } from './sample';
import { test as ledgerTest } from './isolated-ledger';

test('package: contact history, search URL and developer details preserve navigation context', async ({
  page,
}, info) => {
  await page.goto('/konten/kontakte?verlauf=1');
  const history = page.getByLabel('Auch ausgeglichene Kontakte');
  await expect(history).toBeChecked();
  await page.getByRole('link', { name: 'Kontakt M. Muster', exact: true }).click();
  await expect(page).toHaveURL(/\/konten\/kontakte\/[^?]+\?verlauf=1/);
  const detailUrl = page.url();
  await page.locator('a[href*="panel=buchung"]').filter({ visible: true }).first().click();
  const capture = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
  await expect(capture.getByLabel('Bezahlt von', { exact: true })).not.toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Kontaktkontoauszug' })).toContainText(
    'Kontoblatt',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goBack();
  await expect(history).toBeChecked();
  await page.goForward();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Kontaktkontoauszug' })).toContainText(
    'Kontoblatt',
  );
  await page.screenshot({ path: info.outputPath('contact-page.png'), fullPage: true });
  await page.getByRole('link', { name: 'Zurück zu Kontakte', exact: true }).click();
  await expect(history).toBeChecked();
  const contactId = new URL(detailUrl).pathname.split('/').at(-1)!;
  await page.goto(`/konten/kontakte?kontakt=${contactId}&verlauf=1`);
  await expect(page).toHaveURL(/\/konten\/kontakte\/[^?]+\?verlauf=1/);

  await page.goto('/plan/monat?monat=2026-08');
  await expect(page.getByRole('main')).toBeVisible();
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox', { name: 'Suchen', exact: true });
  await expect(input).toBeFocused();
  await input.fill('Girokonto');
  await expect(page).toHaveURL(/q=Girokonto/);
  await expect(page.getByRole('option').first()).toContainText('Girokonto');
  await page.reload();
  await expect(input).toHaveValue('Girokonto');
  await expect(page.getByRole('option').first()).toContainText('Girokonto');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/konten\/acc-giro$/);
  // Going back while the account page is still loading would leave the old search page mounted.
  await expect(page.getByRole('heading', { name: 'Girokonto', exact: true }).first()).toBeVisible();
  await page.goBack();
  await expect(input).toHaveValue('Girokonto');
  await expect(page.getByRole('option').first()).toContainText('Girokonto');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`search-page-${theme}.png`), fullPage: true });
  }
  await page.getByRole('link', { name: 'Zurück zur vorherigen Ansicht' }).click();
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-08$/);

  await page.goto('/dev/panels');
  await page.getByRole('link', { name: 'Detail lang', exact: true }).click();
  await expect(page).toHaveURL(/\/dev\/details/);
  await expect(page.getByText('Zeile 40 des langen Inhalts')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('link', { name: 'Zurück zum Prüfstand' }).click();
  await expect(page).toHaveURL(/\/dev\/panels$/);
  await page.goto('/dev/bauteile');
  await page.getByRole('button', { name: 'Eingabedialog öffnen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Kontostand prüfen' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Eingabedialog öffnen' })).toBeFocused();
});

ledgerTest(
  'new contact form cancels without writes, returns focus, creates and undoes',
  async ({ page, request, isolatedLedger }, info) => {
    await page.goto('/konten/kontakte');
    const trigger = page.getByRole('button', { name: 'Neuer Kontakt', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Neuer Kontakt', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused();
    await expect(dialog).not.toHaveClass(/panel/);
    await dialog.getByLabel('Name', { exact: true }).fill('Kontakt Abbruch');
    await dialog.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(trigger).toBeFocused();
    const read = async () =>
      (await (await request.get(`${isolatedLedger.origin}/api/contacts?history=1`)).json())
        .contacts;
    expect(await read()).toEqual([]);
    await trigger.click();
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('');
    await dialog.getByLabel('Name', { exact: true }).fill('Kontakt Beispiel');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('new-contact-form.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Kontakt anlegen' }).click();
    await expect(dialog).toBeHidden({ timeout: 30000 });
    await page.locator('.toast.is-open').hover();
    await expect(page.getByRole('link', { name: 'Kontakt Beispiel', exact: true })).toBeVisible();
    await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.getByRole('link', { name: 'Kontakt Beispiel', exact: true })).toHaveCount(0);
    expect(await read()).toEqual([]);
  },
);
