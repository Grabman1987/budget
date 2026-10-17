import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const toast = (page: Page) => page.locator('.toast.is-open');
const noOverflow = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

test('rename retains contact bookings and supports undo from list and statement', async ({
  page,
  request,
}, info) => {
  const tag = `Musterkontakt ${info.project.name}-${Date.now()}`;
  const origin = new URL(info.project.use.baseURL!).origin;
  const created = await request.post('/api/contacts', { headers: { origin }, data: { name: tag } });
  expect(created.ok()).toBe(true);
  const { contact } = await created.json();
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { group } = await post('/categories/groups', { name: `Auslagen ${tag}` });
  const { category } = await post('/categories', {
    name: `Auslage ${tag}`,
    groupId: group.id,
    class: null,
    kind: 'advance',
  });
  const { account } = await post('/accounts', {
    name: `Musterkonto ${tag}`,
    type: 'checking',
    openingDate: '2026-09-01',
    openingBalanceCents: 10000,
  });
  const booking = await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-09-02',
    amountCents: -2300,
    splits: [{ categoryId: category.id, contactId: contact.id, amountCents: -2300 }],
  });
  await page.goto('/konten/kontakte?verlauf=1');
  const pencil = page.getByRole('button', { name: `${tag} umbenennen`, exact: true });
  await expect(pencil).toBeVisible();
  const box = await pencil.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await pencil.click();
  const dialog = page.getByRole('dialog', { name: 'Kontakt umbenennen' });
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(tag);
  await dialog.getByLabel('Name', { exact: true }).fill(`${tag} Neu`);
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('link', { name: `${tag} Neu`, exact: true })).toBeVisible();
  await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByRole('link', { name: tag, exact: true })).toBeVisible();
  await toast(page).getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await page.getByRole('link', { name: `${tag} Neu`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/konten/kontakte/${contact.id}`));
  await page.getByRole('button', { name: `${tag} Neu umbenennen`, exact: true }).click();
  await dialog.getByLabel('Name', { exact: true }).fill(`${tag} Seite`);
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  // The updated contact name appears once, in the detail heading; the area remains Konten.
  await expect(page.getByRole('heading', { name: `${tag} Seite`, exact: true })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Konten');
  await expect(page.locator('.contacts-balance')).toContainText('23,00 €');
  const saved = await (await request.get(`/api/bookings/${booking.id}`)).json();
  expect(saved.booking.splits[0].contactId).toBe(contact.id);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath('contact-renamed.png'), fullPage: true });
});

test('Plan month creates an empty group and categories through the existing forms', async ({
  page,
}, info) => {
  const group = `Mustergruppe ${info.project.name}-${Date.now()}`;
  const category = `Musterkategorie ${info.project.name}`;
  await page.goto('/plan/monat?monat=2026-10');
  // The table head carries the plus of the group list next to "Kategoriegruppe".
  const groupPlus = page.getByRole('button', { name: 'Gruppe anlegen', exact: true });
  await groupPlus.first().click();
  const groupDialog = page.getByRole('dialog', { name: 'Gruppe anlegen' });
  await groupDialog.getByLabel('Name', { exact: true }).fill(group);
  await groupDialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(toast(page)).toContainText(`Gruppe „${group}“ angelegt`);
  await page.getByLabel('Ansicht', { exact: true }).selectOption('group');
  const plus = page.getByRole('button', { name: `Kategorie in ${group} anlegen`, exact: true });
  await expect(plus).toBeVisible();
  const box = await plus.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(info.project.name === 'mobile' ? 44 : 28);
  await plus.click();
  const dialog = page.getByRole('dialog', { name: 'Kategorie anlegen' });
  await expect(dialog.getByLabel('Gruppe', { exact: true })).toHaveValue(
    await dialog
      .getByLabel('Gruppe', { exact: true })
      .getByRole('option', { name: group, exact: true })
      .getAttribute('value'),
  );
  await dialog.getByLabel('Name', { exact: true }).fill(category);
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.locator('.ptable .prow').filter({ hasText: category })).toBeVisible();
  await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.locator('.ptable .prow').filter({ hasText: category })).toHaveCount(0);
  await expect(plus).toBeVisible();
  await toast(page).getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect(page.locator('.ptable .prow').filter({ hasText: category })).toBeVisible();
  await noOverflow(page);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`plan-plus-${colorScheme}.png`),
      fullPage: true,
    });
  }
});
