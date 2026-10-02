import { formatEuro, cents } from '@budget/domain';
import { referenceModel } from '@budget/fixtures';
import { expect, sampleTest as test } from './sample';
import { inspectReport } from './spending-helpers';

// 2.1 Ausgabenanalyse on the seeded sample ledger (today 17.09.2026, last full month August 2026).

const eur = (c: number) => formatEuro(cents(c));

test('shows the prototype consumption of the last 12 months with a chain, class bar and heatmap', async ({
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
  await expect(page.getByRole('heading', { name: /^Konsum · August 2026$/ })).toBeVisible();

  await page.getByRole('button', { name: '1J', exact: true }).click();
  await expect(page).toHaveURL(/zeitraum=1J/);
  await expect(page.getByRole('heading', { name: /^Konsum · letzte 12 Monate$/ })).toBeVisible();
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
  const chain = page.getByRole('group', { name: 'Maßkette Konsum' });
  await expect(chain).toContainText('Bedarf');
  await expect(chain).toContainText('Wunsch');
  await expect(chain).toContainText('Konsum');

  // Class bar and its legend: three whole percentages that add up to 100.
  const bar = page.getByRole('img', { name: /^Bedarf \d+ %, Wunsch \d+ %, Zukunft \d+ %$/ });
  const label = (await bar.getAttribute('aria-label'))!;
  const sum = [...label.matchAll(/(\d+) %/g)].reduce((a, m) => a + Number(m[1]), 0);
  expect(sum).toBe(100);

  // Heatmap: twelve month columns plus category and total.
  const heat = page.locator('.sr-heat');
  await expect(heat.locator('thead th')).toHaveCount(14);
  await expect(heat.locator('tbody tr').first().locator('td')).toHaveCount(13);

  // Comparison with the previous 12 months is available for the sample.
  await expect(page.getByRole('heading', { name: 'Größte Veränderungen' })).toBeVisible();
  await expect(page.getByText(/Gegen die gleich lange Vorperiode/)).toBeVisible();

  // A category opens its bookings of the window.
  const first = page.locator('.sr-bars.is-cols a').first();
  await expect(first).toHaveAttribute('href', /kategorie=.*von=2025-09-01.*bis=2026-08-31/);

  await inspectReport(page, info, 'spending-analysis');
});

test('says honestly that "Alles" has no comparison window', async ({ page }) => {
  await page.goto('/reports/ausgaben?zeitraum=Alles');
  await expect(
    page.getByText('Für diesen Zeitraum gibt es keine gleich lange Vorperiode.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Konsum · seit Okt 23$/ })).toBeVisible();
});
