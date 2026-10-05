import { expect, sampleTest as test } from './sample';
import { inspectReport } from './spending-helpers';
import type { InflationReport } from '@budget/db';

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

  // The stored consumer price series (synthetic on the sample server) runs through August 2026: the
  // headline compares the same window and names the source.
  await expect(page.getByTestId('pi-reference-state')).toContainText('(Aug 26)');
  await expect(
    page.getByTestId('pi-reference-state').getByRole('button', { name: 'VPI', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Synthetische Beispielreihe statt VPI/)).toBeVisible();
  await expect(page.getByText(/höchstens einmal im Monat neu/)).toBeVisible();

  // Monthly: the 12-month change per month, personal against the VPI.
  await expect(page.getByTestId('inflation-monthly-chart')).toBeVisible();
  await expect(page.getByTestId('monthly-table')).toHaveCount(0);
  const yearly = page.getByTestId('yearly-table');
  await expect(yearly.getByRole('row', { name: /^2025/ })).toContainText('Prozentpunkte');
  await expect(yearly.getByRole('row', { name: /^2023/ })).toContainText(
    'fehlt der Vergleichsmonat',
  );
  await expect(yearly.getByRole('row', { name: /^2026/ })).toContainText('bis Aug 26');
  const basket = page.getByTestId('inflation-basket');
  await expect(basket).toContainText('Miete');
  const history = basket.locator('details').first();
  const disclosure = history.locator('summary');
  await disclosure.click();
  await expect(history.locator('li').first()).toBeVisible();
  expect((await disclosure.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await disclosure.press('Enter');
  await expect(history.locator('li').first()).toBeHidden();
  await page.getByRole('button', { name: 'Pp', exact: true }).first().focus();
  await expect(
    page.getByRole('tooltip').filter({ hasText: 'Differenz zweier Prozentwerte' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: 'Pp', exact: true }).first().click();
  await expect(
    page.getByRole('tooltip').filter({ hasText: 'Differenz zweier Prozentwerte' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  // The index chart and the contribution table (Strom raised its price in January 2026).
  await expect(page.getByTestId('inflation-chart')).toBeVisible();
  const table = page.getByTestId('contributions-table');
  await expect(table.getByRole('row').nth(1)).toContainText('Strom');
  await expect(table.getByRole('row', { name: /Miete/ })).toContainText('0 %');

  // Sample contracts with only their current price are priced from their matched bookings, and
  // the method names them.
  await expect(page.getByTestId('pi-derived')).toContainText('Aus Buchungen abgeleitet');

  // What is out of the basket is named.
  await expect(page.getByText(/Nicht im Warenkorb/)).toBeVisible();

  await inspectReport(page, info, 'personal-inflation');
});

test('shows yearly basket prices and exact contributions matching the calendar-year table', async ({
  page,
  request,
}, info) => {
  test.setTimeout(120_000);
  const data = (await (
    await request.get('/api/reports/spending/inflation')
  ).json()) as InflationReport;
  await page.goto('/reports/inflation');
  await expect(page.getByTestId('pi-rate')).toBeVisible({ timeout: 30_000 });
  const toggle = page.getByRole('group', { name: 'Warenkorbansicht' });
  await expect(toggle.getByRole('button', { name: 'Seit Basis' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const yearlyButton = toggle.getByRole('button', { name: 'Je Jahr' });
  await yearlyButton.focus();
  await yearlyButton.press('Enter');
  await expect(yearlyButton).toHaveAttribute('aria-pressed', 'true');
  expect((await yearlyButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const basket = page.getByTestId('inflation-basket-yearly');
  await expect(basket.getByRole('columnheader', { name: /2026/ })).toContainText('bis Aug 26');
  const number = new Intl.NumberFormat('de-AT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const percent = (bp: number | null) =>
    bp === null ? '–' : `${bp < 0 ? '−' : bp > 0 ? '+' : ''}${number.format(Math.abs(bp) / 100)} %`;
  const totals = basket.getByRole('row', { name: /^Deine Teuerung/ });
  const vpi = basket.getByRole('row', { name: /^VPI/ });
  for (const [i, year] of data.years.entries()) {
    await expect(totals.getByRole('cell').nth(i)).toHaveText(percent(year.ownChangeBp));
    await expect(vpi.getByRole('cell').nth(i)).toHaveText(percent(year.referenceChangeBp));
    if (year.ownChangeBp !== null) {
      await expect(
        page
          .getByTestId('yearly-table')
          .getByRole('row', { name: new RegExp(`^${year.year}`) })
          .getByRole('cell')
          .first(),
      ).toHaveText(percent(year.ownChangeBp));
      const texts = await basket
        .locator(`tbody td[data-year="${year.year}"][data-contribution]`)
        .allTextContents();
      const sum = texts.reduce(
        (total, value) =>
          total + Math.round(Number(value.replace('−', '-').replace(',', '.')) * 100),
        0,
      );
      expect(sum).toBe(year.ownChangeBp);
    }
  }
  await expect(basket).toContainText('Ø je Monat');
  await inspectReport(page, info, 'personal-inflation-yearly');
  await toggle.getByRole('button', { name: 'Seit Basis' }).click();
  await expect(page.getByTestId('inflation-basket')).toBeVisible();
  await expect(basket).toHaveCount(0);
});
