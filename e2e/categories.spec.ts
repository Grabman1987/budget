import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Einstellungen › Kategorien end to end: group, category with emoji and target, hide, keyboard
 * sort, merge with one undo. Desktop and phone share the database; names carry the project.
 */

const redesign = async (page: Page) =>
  (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
const categoryRow = (page: Page, name: string) =>
  page.locator('.settings-category-row, .cat-table .krow').filter({ hasText: name });
async function actions(page: Page, name: string) {
  if (await redesign(page)) {
    const summary = page.getByLabel(`Aktionen für ${name}`, { exact: true });
    if (!(await summary.locator('..').evaluate((node) => (node as HTMLDetailsElement).open)))
      await summary.click();
  }
}

const toast = (page: Page) => page.locator('.toast.is-open');
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name });

async function newCategory(
  page: Page,
  group: string,
  name: string,
  extra?: (d: ReturnType<typeof dialog>) => Promise<void>,
) {
  await actions(page, `Gruppe ${group}`);
  await page.getByRole('button', { name: `Kategorie in ${group} anlegen` }).click();
  const d = dialog(page, 'Kategorie anlegen');
  await expect(page.locator('dialog.panel[open]')).toHaveCount(0);
  await d.getByLabel('Name', { exact: true }).fill(name);
  if (extra) await extra(d);
  await d.getByRole('button', { name: 'Speichern' }).click();
  await expect(toast(page)).toContainText(`Kategorie „${name}“ angelegt`);
}

test('categories: create, target, hide, sort, merge and undo', async ({ page }, testInfo) => {
  // Unique per run: retries write into the same database.
  const tag = `${testInfo.project.name}-${Date.now().toString(36).slice(-5)}`;
  const group = `Alltag ${tag}`;
  await page.goto('/einstellungen/kategorien');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Gruppe', exact: true }).click();
  await dialog(page, 'Gruppe anlegen').getByLabel('Name').fill(group);
  await dialog(page, 'Gruppe anlegen').getByRole('button', { name: 'Speichern' }).click();
  await expect(toast(page)).toContainText(`Gruppe „${group}“ angelegt`);

  await newCategory(page, group, `Lebensmittel ${tag}`, async (d) => {
    await d.getByLabel(/Symbol/).fill('🛒');
    await d.getByLabel('Stufe im Wasserfall').selectOption('2');
    await d.getByLabel('Art des Ziels').selectOption('monthly');
    await d.getByLabel('Betrag', { exact: true }).fill('600');
  });
  await newCategory(page, group, `Café ${tag}`, async (d) => {
    await d.getByRole('button', { name: 'Wunsch' }).click();
  });
  const row = categoryRow(page, `Lebensmittel ${tag}`);
  await expect(row).toContainText('Stufe 2 · Laufend');
  await expect(row).toContainText('Ziel 600,00 € jeden Monat');
  // The emoji is drawn with the monochrome Noto Emoji font, never as colour emoji.
  const icon = row.locator('.cat-icon');
  await expect(icon).toHaveText('🛒');
  expect(await icon.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Noto Emoji');

  // Sort: Café moves above Lebensmittel, with the keyboard on the desktop and with the ↑ button
  // on the phone (touch has no HTML5 drag; the buttons exist only in the phone layout).
  const up = page.getByRole('button', { name: `Café ${tag} nach oben` });
  if (testInfo.project.name === 'desktop') {
    await expect(up).toBeHidden();
    await page.getByRole('button', { name: `Café ${tag} verschieben` }).press('ArrowUp');
  } else {
    await actions(page, `Lebensmittel ${tag}`);
    await expect(
      page.getByRole('button', { name: `Lebensmittel ${tag} nach unten` }),
    ).toBeVisible();
    if (await redesign(page))
      await page.getByLabel(`Aktionen für Lebensmittel ${tag}`, { exact: true }).click();
    await actions(page, `Café ${tag}`);
    await up.click();
  }
  await expect(toast(page)).toContainText('Reihenfolge gespeichert');
  const names = await page
    .locator('.cat-table .krow .kname-s, .settings-category-name')
    .allTextContents();
  const at = (n: string) => names.findIndex((x) => x.includes(n));
  expect(at(`Café ${tag}`)).toBeLessThan(at(`Lebensmittel ${tag}`));

  // Hide: gone from the list until "Ausgeblendete zeigen".
  await actions(page, `Café ${tag}`);
  await page.getByRole('button', { name: `Café ${tag} bearbeiten` }).click();
  await dialog(page, 'Kategorie')
    .getByRole('switch', { name: /Ausblenden/ })
    .click();
  await dialog(page, 'Kategorie').getByRole('button', { name: 'Speichern' }).click();
  await expect(categoryRow(page, `Café ${tag}`)).toHaveCount(0);
  await page.getByRole('switch', { name: /Ausgeblendete zeigen/ }).click();
  await expect(categoryRow(page, `Café ${tag}`)).toContainText('ausgeblendet');

  // Merge Café into Lebensmittel, then undo the whole action.
  await actions(page, `Café ${tag}`);
  await page.getByRole('button', { name: `Café ${tag} bearbeiten` }).click();
  await dialog(page, 'Kategorie').getByRole('button', { name: 'Zusammenführen …' }).click();
  await dialog(page, 'Zusammenführen')
    .getByLabel('Zusammenführen in')
    .selectOption({ label: `Lebensmittel ${tag}` });
  await dialog(page, 'Zusammenführen').getByRole('button', { name: 'Zusammenführen' }).click();
  await expect(toast(page)).toContainText('zusammengeführt');
  await expect(categoryRow(page, `Café ${tag}`)).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(categoryRow(page, `Café ${tag}`)).toHaveCount(1);

  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath(`kategorien-${testInfo.project.name}.png`),
    fullPage: true,
  });
});
