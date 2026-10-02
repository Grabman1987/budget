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

  // The stored consumer price series (synthetic on the sample server) ends in December 2025: the
  // headline compares with its newest month and says so, and names the source.
  await expect(page.getByTestId('pi-reference-state')).toContainText(/VPI .* \(Dez 25\)/);
  await expect(page.getByText(/Synthetische Beispielreihe statt VPI/)).toBeVisible();
  await expect(page.getByText(/höchstens einmal im Monat neu/)).toBeVisible();

  // Monthly: the 12-month change per month, personal against the VPI; the VPI is missing from
  // January 2026 on and the table shows a dash instead of inventing a value.
  await expect(page.getByTestId('inflation-monthly-chart')).toBeVisible();
  const monthly = page.getByTestId('monthly-table');
  await expect(monthly.getByRole('row').nth(1)).toContainText('Aug 26');
  await expect(monthly.getByRole('row').nth(1)).toContainText('–');
  await expect(monthly.getByRole('row', { name: /^Dez 25/ })).not.toContainText('–');

  // Yearly: annual averages; changes only between two complete years.
  const yearly = page.getByTestId('yearly-table');
  await expect(yearly.getByRole('row', { name: /^2025/ })).not.toContainText('–');
  await expect(yearly.getByRole('row', { name: /^2023/ })).toContainText('3 Monate eigen');
  await expect(yearly.getByRole('row', { name: /^2026/ })).toContainText('0 VPI');

  // The index chart and the contribution table (Strom raised its price in January 2026).
  await expect(page.getByTestId('inflation-chart')).toBeVisible();
  const table = page.getByTestId('contributions-table');
  await expect(table.getByRole('row').nth(1)).toContainText('Strom');
  await expect(table.getByRole('row', { name: /Miete/ })).toContainText('0 %');

  // What is out of the basket is named.
  await expect(page.getByText(/Variable Kategorien/)).toBeVisible();

  await inspectReport(page, info, 'personal-inflation');
});
