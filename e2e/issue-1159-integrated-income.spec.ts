import { createBooking, INCOME_TYPES, openDatabase } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { redesignReportsOn } from './report-frame';
import { withShellControls } from './shell-actions';

test.use({ ledgerToday: '2026-03-15' });

test('1159 YTD keeps the running month and the include-Zukunft cashflow from the shared report facts', async ({
  page,
  isolatedLedger,
}, info) => {
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date)
      VALUES ('giro','Synthetic budget','checking','budget',1,'2025-01-01');
      INSERT INTO category_group (id,name) VALUES ('g','Synthetic group');
      INSERT INTO category (id,group_id,name,class,kind) VALUES
      ('need','g','Synthetic need','need','variable'),
      ('want','g','Synthetic want','want','variable'),
      ('future','g','Synthetic future','future','saving');
      INSERT INTO envelope_month (category_id,month,assigned_cents) VALUES ('need','2026-03',1000);
    `);
    for (const [date, amountCents, field] of [
      ['2025-01-10', 60_000, 'salary'],
      ['2025-02-10', -10_000, 'need'],
      ['2025-03-10', 20_000, 'salary'],
      ['2025-03-16', 9_999, 'salary'],
      ['2026-01-10', 100_000, 'salary'],
      ['2026-01-10', -20_000, 'need'],
      ['2026-01-10', -10_000, 'future'],
      ['2026-02-10', 40_000, 'salary'],
      ['2026-02-10', -60_000, 'want'],
      ['2026-03-10', 60_001, 'salary'],
      ['2026-03-10', -70_002, 'need'],
      ['2026-03-10', 700, 'capital'],
    ] as const) {
      createBooking(
        opened.db,
        {
          accountId: 'giro',
          date,
          amountCents,
          splits: [
            {
              amountCents,
              ...(field === 'salary' || field === 'capital'
                ? { incomeTypeId: INCOME_TYPES[field].id }
                : { categoryId: field }),
            },
          ],
        },
        { actor: 'synthetic-1159' },
      );
    }
    const financialRows = () =>
      ['account', 'booking', 'booking_split', 'envelope_month', 'trade', 'valuation'].map((table) =>
        opened.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      );
    const original = financialRows();
    await page.goto('/reports/cashflow-verlauf?zeitraum=YTD&monat=2026-03#cf-months');
    await expect(page).toHaveURL(/\/reports\/einnahmen-ausgaben\?.*#cf-months$/);
    expect(new URL(page.url()).searchParams.get('zeitraum')).toBe('YTD');
    expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-03');
    if (!(await redesignReportsOn(page))) {
      await expect(page.getByTestId('cf-figure')).toHaveText('600,00 €');
      await page.goto('/reports/cashflow?zeitraum=2026-01..2026-03');
      await expect(page.getByTestId('cf-figure')).toHaveText('499,99 €');
      expect(financialRows()).toEqual(original);
      return;
    }
    const section = page.getByTestId('income-expense-cashflow');
    const chart = section.getByTestId('cashflow-development-chart');
    await expect(section.getByRole('heading', { name: 'Cashflow' })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Einnahmen nach Art' })).toBeVisible();
    await expect(page.getByTestId('income-period-types')).toContainText('2.000,01 €');
    await expect(page.getByTestId('income-period-types')).toContainText('7,00 €');
    await expect(page.getByTestId('report-frame-result')).toHaveText('+399,99 €');
    await expect(page.getByTestId('cashflow-statement')).toContainText(
      'Cashflow inkl. laufendem Monat: 399,99 €, durchschnittlich 133,33 € pro Monat',
    );
    await expect(page.getByTestId('cashflow-statement')).toContainText('Vorjahr 700,00 €');
    await expect(section).toContainText('im laufenden Monat bis zum gleichen Kalendertag');
    await expect(section).toContainText('Cashflow = Einnahmen − Ausgaben');
    await expect(section).toContainText(
      'Der frühere Cashflow-Verlauf zog nur Bedarf und Wunsch ab.',
    );
    await expect(chart.getByTestId('cashflow-previous-year-series').locator('.l-prev')).toHaveCount(
      1,
    );
    await expect(chart.locator('[data-chart-point] rect')).toHaveCount(3);
    await expect(chart.locator('[data-chart-point="1"] rect')).toHaveAttribute('fill', 'none');
    await expect(chart.locator('[data-chart-point="2"] rect')).toHaveAttribute(
      'stroke-opacity',
      '0.55',
    );
    await expect(chart.locator('[data-chart-point="1"] rect')).not.toHaveAttribute(
      'stroke-opacity',
      '0.55',
    );
    await expect(chart.locator('[data-chart-point="2"] rect')).toHaveAttribute('fill', 'none');
    const rows = section.locator('tbody tr');
    await expect(rows.getByRole('rowheader')).toHaveText(['Jän 26', 'Feb 26', 'Mär 26 · laufend']);
    await expect(rows.nth(0).getByRole('cell')).toHaveText([
      '1.000,00 €',
      '300,00 €',
      '700,00 €',
      '700,00 €',
    ]);
    await expect(rows.nth(1).getByRole('cell')).toHaveText([
      '400,00 €',
      '600,00 €',
      '−200,00 €',
      '500,00 €',
    ]);
    await expect(rows.nth(2).getByRole('cell')).toHaveText([
      '600,01 €',
      '700,02 €',
      '−100,01 €',
      '399,99 €',
    ]);
    await expect(section.locator('tfoot td')).toHaveText([
      '2.000,01 €',
      '1.600,02 €',
      '399,99 €',
      '399,99 €',
    ]);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await expect(section.getByRole('table')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath(`integrated-income-${theme}.png`),
        fullPage: true,
      });
    }
    await withShellControls(page, async ({ privacy }) => {
      await privacy.click();
    });
    await expect(section).not.toContainText(/\d[.,]\d{2} €/);
    await expect(page.getByTestId('income-period-types')).toContainText('••• €');
    expect(financialRows()).toEqual(original);
  } finally {
    opened.close();
  }
});
