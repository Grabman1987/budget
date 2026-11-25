import type { Locator } from '@playwright/test';
import { sampleTest as test, expect } from './sample';

/** Review 25.11 (#1348): Nettovermögen · Herleitung sits in cards; its funding links open their target. */
test('Nettovermögen · Herleitung: four cards, and every "Ziele finanzieren" link opens its target view', async ({
  page,
}) => {
  await page.goto('/?monat=2026-09&period=payday');
  await expect(page.locator('.app')).toBeVisible();
  if ((await page.locator('.app').getAttribute('data-budget-redesign')) !== '1') return;
  await page.locator('a[href*="/heute/details/wealth"]').first().click();
  await expect(
    page.getByRole('heading', { name: 'Nettovermögen · Herleitung', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Zurück zu Heute', exact: true })).toBeVisible();

  const cards = page.getByTestId('wealth-detail-cards');
  for (const name of ['Übersicht', 'Aufteilung', 'Verlauf', 'Ziele finanzieren']) {
    await expect(cards.getByRole('region', { name, exact: true })).toBeVisible();
    await expect(cards.getByRole('region', { name, exact: true })).toHaveClass(/\bcard\b/);
  }
  await expect(page.getByRole('button', { name: 'Mehr zum Monat' })).toHaveCount(0);

  const funding = cards.getByRole('region', { name: 'Ziele finanzieren', exact: true });
  const targets: Array<[string | RegExp, RegExp, () => Locator]> = [
    [/Envelope-Ziele/, /\/plan\/monat/, () => page.getByRole('button', { name: 'Geld verteilen' })],
    [
      '50/30/20 und Budgettreue erklären',
      /\/reports\/budgettreue/,
      () => page.getByRole('heading', { name: 'Budgettreue' }).first(),
    ],
  ];
  for (const [label, url, view] of targets) {
    await funding.getByRole('link', { name: label }).click();
    await expect(page).toHaveURL(url);
    // The detail page must be gone and the target view rendered, not just the address changed.
    await expect(page.getByTestId('wealth-detail-cards')).toHaveCount(0);
    await expect(view()).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('wealth-detail-cards')).toBeVisible();
  }
});
