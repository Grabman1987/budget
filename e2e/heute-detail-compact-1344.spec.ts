import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';

test('Fällig · alle Zahlungen is one table card without stacked fields and fits the phone', async ({
  page,
}) => {
  await page.goto('/heute/details/due?monat=2026-09&period=payday');
  if ((await page.locator('.app').getAttribute('data-budget-redesign')) !== '1') return;
  const card = page.locator('.hv-due-card');
  await expect(card).toBeVisible();
  await expect(card.getByRole('columnheader')).toHaveText([
    'Datum',
    'Zahlung',
    'Konto',
    'Betrag',
    'Deckung',
  ]);
  await expect(card.getByRole('row')).not.toHaveCount(1);
  await expect(card.locator('.heute-note')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
});

test('Als Nächstes · alle Aufgaben is a compact list with an action per line', async ({ page }) => {
  await page.goto('/heute/details/tasks?monat=2026-09&period=payday');
  if ((await page.locator('.app').getAttribute('data-budget-redesign')) !== '1') return;
  const card = page.getByRole('region', { name: 'Aufgaben', exact: true });
  await expect(card).toBeVisible();
  const rows = card.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) await expect(row.getByRole('link')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
});
