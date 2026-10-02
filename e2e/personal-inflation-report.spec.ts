import { expect, sampleTest as test } from './sample';
import { inspectReport } from './spending-helpers';

// 2.4 Persönliche Inflation on the seeded sample ledger (today 17.09.2026).

test('indexes the fixed contracts, attributes the change and says what is not in the basket', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.goto('/reports/inflation');
  await expect(page.getByTestId('pi-rate')).toHaveText(/^\+\d+(,\d)? %$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Eigene Teuerung, 12 Monate' })).toBeVisible();

  // The chain names its start, end and result.
  const chain = page.getByRole('group', { name: 'Maßkette persönliche Inflation' });
  await expect(chain).toContainText('Warenkorb Aug 25');
  await expect(chain).toContainText('Aug 26');
  await expect(chain).toContainText('Teuerung');

  // No consumer price index is stored: the report says so instead of showing sample values.
  await expect(page.getByText(/Verbraucherpreisindex .* nicht gespeichert/).first()).toBeVisible();

  // The index chart and the contribution table (Strom raised its price in January 2026).
  await expect(page.getByTestId('inflation-chart')).toBeVisible();
  const table = page.getByTestId('contributions-table');
  await expect(table.getByRole('row').nth(1)).toContainText('Strom');
  await expect(table.getByRole('row', { name: /Miete/ })).toContainText('0 %');

  // What is out of the basket is named.
  await expect(page.getByText(/Variable Kategorien/)).toBeVisible();

  await inspectReport(page, info, 'personal-inflation');
});
