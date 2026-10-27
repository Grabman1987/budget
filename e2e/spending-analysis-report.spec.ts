import { formatEuro, cents } from '@budget/domain';
import { referenceModel } from '@budget/fixtures';
import { expect, sampleTest as test } from './sample';
import { inspectReport } from './spending-helpers';

// 2.1 Ausgabenanalyse on the seeded sample ledger (today 17.09.2026, last full month August 2026).

const eur = (c: number) => formatEuro(cents(c));

test('shows the prototype consumption with grouped bars, retained class facts and same-window Explorer heatmap', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const ref = referenceModel();
  await page.goto('/reports/ausgaben?zeitraum=1M');
  const august = Math.round(ref.consumptionOf(34) * 100);
  const lead = page.getByTestId('sa-consumption');
  await expect(lead).toBeVisible({ timeout: 30_000 });
  expect(
    Math.abs(Number.parseInt((await lead.textContent())!.replace(/\D/g, ''), 10) - august),
  ).toBeLessThanOrEqual(2);
  await expect(page.locator('#sa-main')).toHaveText('01 · Konsum nach Gruppe');
  await expect(page.locator('section[aria-labelledby="sa-main"] .sr-state')).toHaveText('August 2026');

  await page.getByRole('button', { name: '1J', exact: true }).click();
  await expect(page).toHaveURL(/zeitraum=1J/);
  await expect(page.locator('section[aria-labelledby="sa-main"] .sr-state')).toHaveText('letzte 12 Monate');
  const year = Array.from({ length: 12 }, (_, i) => ref.consumptionOf(23 + i)).reduce(
    (a, b) => a + b,
    0,
  );
  // Car-insurance refunds of the window (6.495 + 10.183 cents) are netted against their category.
  const yearCents = Math.round(year * 100) - (6_495 + 10_183);
  const shown = Number.parseInt(
    (await page.getByTestId('sa-consumption').textContent())!.replace(/\D/g, ''),
    10,
  );
  expect(Math.abs(shown - yearCents)).toBeLessThanOrEqual(30);
  expect(eur(shown)).toBe(await page.getByTestId('sa-consumption').textContent());

  // The chain adds up as displayed: Bedarf + Wunsch = Konsum.
  await page.locator('section[aria-labelledby="sa-classes"] .section-toggle').click();
  const chain = page.getByRole('group', { name: 'Maßkette Konsum' });
  await expect(chain).toContainText('Bedarf');
  await expect(chain).toContainText('Wunsch');
  await expect(chain).toContainText('Konsum');

  // Class bar and its legend: three whole percentages that add up to 100.
  const bar = page.getByRole('img', { name: /^Bedarf \d+ %, Wunsch \d+ %, Zukunft \d+ %$/ });
  const label = (await bar.getAttribute('aria-label'))!;
  const sum = [...label.matchAll(/(\d+) %/g)].reduce((a, m) => a + Number(m[1]), 0);
  expect(sum).toBe(100);

  // The same twelve-month heatmap now lives in Auswertung, retaining category and total columns.
  await page.locator('section[aria-labelledby="sa-explorer"] .section-toggle').click();
  await page.getByRole('link', { name: 'In Auswertung öffnen', exact: true }).click();
  const heat = page.getByTestId('template-heatmap');
  await expect(heat.locator('thead th')).toHaveCount(14);
  await expect(heat.locator('tbody tr').first().locator('td')).toHaveCount(13);
  await page.goBack();

  // Comparison with the previous 12 months is available for the sample.
  await expect(page.locator('#sa-moves')).toHaveText('02 · Größte Veränderungen');
  await expect(page.locator('.sa-comparison')).toContainText('Vorzeitraum:');

  // A category opens its bookings of the window.
  await page.locator('.sa-group-name').first().click();
  const first = page.locator('.sa-category-rows .sa-amount').first();
  await expect(first).toHaveAttribute('href', /kategorie=.*von=2025-09-01.*bis=2026-08-31/);

  await inspectReport(page, info, 'spending-analysis');
});

test('says honestly that "Alles" has no comparison window', async ({ page }) => {
  await page.goto('/reports/ausgaben?zeitraum=Alles');
  await expect(
    page.getByText('Für diesen Zeitraum ist kein vollständig abgedeckter, gleich langer Vorzeitraum verfügbar.'),
  ).toBeVisible();
  await expect(page.locator('section[aria-labelledby="sa-main"] .sr-state')).toHaveText('seit Okt 23');
});
