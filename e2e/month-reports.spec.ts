import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cents, formatEuro } from '@budget/domain';
import { sampleTest } from './sample';

/**
 * Reports of "Monat und Einkommen" on the seeded sample server (17.09.2026): the figures on the
 * page are the figures of the API, nothing is typed into the page. Desktop and mobile, light and
 * dark, with axe and a check that the page never scrolls sideways.
 */

const money = (value: number, whole = false) => formatEuro(cents(value), { cents: !whole });
/** Text with every kind of space collapsed, so de-AT number formatting compares equal. */
const flat = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

async function inspect(page: Page, info: TestInfo, name: string) {
  const width = info.project.use.viewport!.width as number;
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await page.evaluate(() => document.fonts.ready);
    const result = await new AxeBuilder({ page }).include('main').analyze();
    expect(
      result.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
    ).toEqual([]);
    expect(
      await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      })),
    ).toEqual({ innerWidth: width, scrollWidth: width });
    const dir = process.env['BUDGET_MONTH_REPORTS_EVIDENCE'];
    if (dir) mkdirSync(dir, { recursive: true });
    await page.screenshot({
      path: dir
        ? join(dir, `${name}-${theme}-${info.project.name}.png`)
        : info.outputPath(`${name}-${theme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.evaluate(() => delete document.documentElement.dataset['theme']);
}

const isIncome = (month: string) => (response: { url(): string }) => {
  const url = new URL(response.url());
  return url.pathname === '/api/reports/month/income' && url.searchParams.get('month') === month;
};

sampleTest('Einnahmen: the page shows the figures of the sample ledger', async ({ page }, info) => {
  const loaded = page.waitForResponse(isIncome('2026-08'));
  await page.goto('/reports/einnahmen?monat=2026-08');
  const response = await loaded;
  expect(response.status()).toBe(200);
  const data = (await response.json()) as {
    income: { earnedCents: number; capitalCents: number };
    expected: { lines: unknown[] };
    window: {
      rows: Array<{ name: string; sumCents: number }>;
      totalCents: number;
      months: string[];
    };
  };
  await expect(page.getByRole('heading', { name: 'Einnahmen August 2026' })).toBeVisible();
  expect(flat(await page.getByTestId('income-total').textContent())).toBe(
    flat(money(data.income.earnedCents)),
  );
  expect(flat(await page.getByTestId('income-capital-total').textContent())).toBe(
    flat(money(data.income.capitalCents)),
  );
  // Kapitalerträge are no household income: neither a type row nor part of the total.
  const types = page.getByTestId('income-types');
  await expect(types.locator('tbody tr')).toHaveCount(data.window.rows.length + 1);
  await expect(types).not.toContainText('Kapitalerträge');
  await expect(types).not.toContainText('Erstattungen');
  await expect(types.locator('tbody tr').last()).toContainText(
    flat(money(data.window.totalCents, true)),
  );
  await expect(page.getByTestId('income-expected').locator('tbody tr')).toHaveCount(
    data.expected.lines.length,
  );
  await expect(page.getByTestId('income-chart')).toBeVisible();
  await expect(page.getByTestId('income-capital-chart')).toBeVisible();
  await inspect(page, info, 'einnahmen');
});

sampleTest(
  'Einnahmen: the running month announces what is still expected',
  async ({ page }, info) => {
    const loaded = page.waitForResponse(isIncome('2026-09'));
    await page.goto('/reports/einnahmen');
    expect((await loaded).status()).toBe(200);
    await expect(page.getByTestId('report-month')).toHaveText('September 2026');
    await expect(page.getByRole('button', { name: 'Nächster Monat' })).toBeDisabled();
    await expect(
      page.getByRole('heading', { name: /Einnahmen September 2026 · bis 17\./ }),
    ).toBeVisible();
    const salary = page.locator('[data-testid="income-expected"] tr[data-status="pending"]');
    await expect(salary).toContainText('Gehalt');
    await expect(salary).toContainText('erwartet');
    // The sample has no materialised occurrences: the schedule stands in, nothing claims a receipt.
    await expect(page.locator('tr[data-status="unlinked"]')).toContainText('nicht zugeordnet');
    await expect(page.getByText(/noch nicht zugeordnet/).first()).toBeVisible();
    await expect(page.getByText('1 erwartet, 3.812 €')).toBeVisible();
    await expect(page.locator('tr[data-status="unlinked"]')).toHaveCount(1);
    await inspect(page, info, 'einnahmen-laufend');

    const previous = page.waitForResponse(isIncome('2026-08'));
    await page.getByRole('button', { name: 'Vormonat' }).click();
    expect((await previous).status()).toBe(200);
    await expect(page).toHaveURL(/monat=2026-08/);
    await expect(page.getByTestId('report-month')).toHaveText('August 2026');
    await expect(page.getByRole('button', { name: 'Nächster Monat' })).toBeEnabled();
  },
);

sampleTest(
  'Einnahmen: before the records, on an error and on an empty ledger',
  async ({ page }) => {
    await page.goto('/reports/einnahmen?monat=2023-05');
    await expect(page.getByText(/gibt es keine Aufzeichnungen/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Vormonat' })).toBeDisabled();

    await page.route('**/api/reports/month/income*', (route) =>
      route.fulfill({ status: 500, json: { error: 'boom', message: 'Fehler' } }),
    );
    await page.goto('/reports/einnahmen?monat=2026-08');
    await expect(page.getByRole('alert')).toContainText('konnten nicht geladen werden');
    await expect(page.getByTestId('income-total')).toHaveCount(0);
    await page.unroute('**/api/reports/month/income*');

    await page.route('**/api/reports/month/income*', (route) =>
      route.fulfill({
        json: {
          month: '2026-08',
          asOf: '2026-08-31',
          partial: false,
          firstMonth: '2023-10',
          beforeRecords: false,
          income: { month: '2026-08', types: [], earnedCents: 0, capitalCents: 0, refundCents: 0 },
          expected: {
            lines: [],
            pendingCount: 0,
            pendingCents: 0,
            missingCount: 0,
            unlinkedCount: 0,
          },
          expectedMaterialised: true,
          foreignCurrencyCount: 0,
          window: {
            months: ['2026-08'],
            rows: [],
            totalCents: 0,
            totalMonthCents: 0,
            totalAverageCents: 0,
            capital: { monthCents: 0, perMonth: [0], sumCents: 0, averageCents: 0 },
          },
        },
      }),
    );
    await page.goto('/reports/einnahmen?monat=2026-08');
    await expect(page.getByText('Für diesen Monat sind keine Einnahmen erwartet.')).toBeVisible();
    await expect(
      page.getByText('In diesem Zeitraum sind keine Kapitalerträge gebucht.'),
    ).toBeVisible();
    await expect(page.getByTestId('income-total')).toContainText('0,00 €');
  },
);
