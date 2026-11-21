import type { CashflowReport, IncomeExpenseReportData } from '@budget/db';
import { redesignReportsOn } from './report-frame';
import { cashflowMonth, cashflowTotals, monthsBetween, type Period } from '@budget/domain';
import { expect, sampleTest as test } from './sample';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (ids) => {
      for (const id of ids) localStorage.setItem(`budget-report-r8-${id}`, '1');
    },
    ['cashflow-months'],
  );
});

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
  const integrated: IncomeExpenseReportData = {
    asOf: '2027-01-15',
    currentMonth: '2027-01',
    firstMonth: '2026-01',
    lastFullMonth: '2026-12',
    incomeTypes: [{ id: 'salary', name: 'Gehalt', role: 'income' }],
    categories: [
      {
        id: 'need',
        name: 'Bedarf',
        groupId: 'group',
        groupName: 'Gruppe',
        class: 'need',
        kind: 'variable',
      },
    ],
    months: monthsBetween('2026-01', '2027-01').map((month) => ({
      month,
      income: { salary: 10_000 },
      spending: { need: 1_000 },
      assigned: {},
      netWorthCents: null,
      moneyAgeDays: null,
    })),
    payees: {},
    targets: { savingsRateBp: 0, moneyAgeDays: 0 },
    netWorth: 'omitted',
    splits: [],
  };
  await page.route('**/api/report-tables/income-expense', (route) =>
    route.fulfill({ json: integrated }),
  );
  await page.goto('/reports/cashflow?zeitraum=YTD');
  if (await redesignReportsOn(page)) {
    const section = page.getByTestId('income-expense-cashflow');
    const months = section.locator('tbody th');
    await expect(months).toHaveText(['Jän 27 · laufend']);
    await expect(section.getByTestId('cashflow-statement')).toContainText('inkl. laufendem Monat');
    await page.screenshot({ path: info.outputPath('cashflow-january-ytd.png'), fullPage: true });
    await page.getByRole('button', { name: 'Voriger Zeitraum' }).click();
    await expect(page).toHaveURL(/zeitraum=2026-01\.\.2026-12/);
    await expect(months).toHaveCount(12);
    await expect(months.first()).toHaveText('Jän 26');
    await expect(months.last()).toHaveText('Dez 26');
    await expect(section.getByTestId('cashflow-statement')).not.toContainText(
      'inkl. laufendem Monat',
    );
    return;
  }
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
