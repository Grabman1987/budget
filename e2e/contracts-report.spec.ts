import { expect, sampleTest as test } from './sample';
import { inspectReport } from './spending-helpers';

// 2.3 Verträge und Abos on the seeded sample ledger (today 17.09.2026).

test('lists the contracts of the expected payments with R10 quote, price history and USD originals', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.goto('/reports/abos');
  await expect(page.getByRole('heading', { name: 'Gebunden je Monat' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('co-bound')).toHaveText(/\d.*,\d\d €$/);

  // The status names the shared rule R10 and its target in words.
  await expect(page.getByText(/Fixkostenquote .* · Ziel ≤ 55 % \(R10\)/)).toBeVisible();

  // The chain: Verträge je Monat + Periodische ÷ 12 = Gebunden.
  const chain = page.getByRole('group', { name: 'Maßkette Verträge' });
  await expect(chain).toContainText('Verträge je Monat');
  await expect(chain).toContainText('Gebunden');

  // The chart has markers for price changes and new contracts (Internet, Strom, KI-Abos …).
  expect(await page.getByTestId('contracts-marker').count()).toBeGreaterThanOrEqual(3);

  // Parts list: groups with positions, a USD subscription keeps its original amount.
  const table = page.getByTestId('contracts-table');
  await expect(table.getByRole('row', { name: /KI-Assistent/ })).toContainText(/USD.20,00/);
  await expect(table.getByRole('row', { name: /Strom/ }).first()).toContainText('Jän 26');
  await expect(table.getByText('unbefristet').first()).toBeVisible();

  // Price hints come from the stored price versions; no notice periods are invented.
  await expect(page.getByRole('heading', { name: 'Preis prüfen' })).toBeVisible();
  await expect(
    page.getByText(/Kündigungsfrist sind im Hauptbuch noch nicht erfasst/),
  ).toBeVisible();

  // Foreign currency: original, EUR today, EUR paid in 12 months and average rate.
  const fx = page.getByTestId('foreign-table');
  await expect(fx.getByRole('row', { name: /KI-Assistent/ })).toContainText('12 Zahlungen');
  await expect(fx.getByRole('row', { name: /KI-Bildtool/ })).toContainText(/USD.10,00/);

  await inspectReport(page, info, 'contracts');
});
