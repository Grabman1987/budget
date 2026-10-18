import type { CashflowReport } from '@budget/db';
import { cashflowMonth, cashflowTotals, monthsBetween, type Period } from '@budget/domain';
import { expect, sampleTest as test } from './sample';

test('January cashflow YTD steps to the complete previous year', async ({ page }, info) => {
  await page.clock.setFixedTime(new Date('2027-01-15T12:00:00Z'));
  // The sample server keeps its September clock; the API has separate fixed-January unit tests.
  await page.route('**/api/cashflow?*', async (route) => {
    const period = new URL(route.request().url()).searchParams.get('period') as Period;
    const windowMonths = period === 'YTD' ? ['2027-01'] : monthsBetween('2026-01', '2026-12');
    const months = windowMonths.map((month) => ({
      ...cashflowMonth({
        month,
        incomeCents: 10_000,
        needCents: 1_000,
        wantCents: 0,
        futureCents: 0,
        capitalCents: 0,
      }),
      inWindow: true,
    }));
    const data: CashflowReport = {
      period,
      asOf: '2027-01-15',
      firstMonth: '2023-10',
      windowMonths,
      months,
      totals: cashflowTotals(months),
    };
    await route.fulfill({ json: data });
  });
  await page.goto('/reports/cashflow?zeitraum=YTD');
  const rows = page.getByTestId('cf-table').locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('2027');
  // The report-head subtitle is hidden on the phone layout; the body note is shown everywhere.
  await expect(page.getByText(/Der laufende Monat ist bis .* enthalten/)).toBeVisible();
  if (info.project.name === 'desktop') {
    await expect(page.getByText(/laufender Monat bis/)).toBeVisible();
  }
  await expect(page.getByText(/Der laufende Monat ist nicht enthalten/)).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('cashflow-january-ytd.png'), fullPage: true });
  await page.getByRole('button', { name: 'Voriger Zeitraum' }).click();
  await expect(page).toHaveURL(/zeitraum=2026-01\.\.2026-12/);
  await expect(rows).toHaveCount(13);
  await expect(rows.first()).toContainText('Dezember 2026');
  await expect(rows.nth(11)).toContainText('2026');
  await expect(page.getByText(/Der laufende Monat ist nicht enthalten/)).toBeVisible();
});
