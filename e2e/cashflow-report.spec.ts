import AxeBuilder from '@axe-core/playwright';
import { expect as baseExpect, type Page, type TestInfo } from '@playwright/test';
import type { CashflowReport } from '@budget/db';
import { eur } from '../apps/web/src/ledger/format';
import { sampleTest as test } from './sample';

// The read model builds the budget of every month; the shared test machine can be slow.
const expect = baseExpect.configure({ timeout: 15_000 });
test.beforeEach(() => test.slow());

async function api(page: Page, period: string) {
  const res = await page.request.get(`/api/cashflow?period=${period}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as CashflowReport;
}

async function inspect(page: Page, info: TestInfo, label: string) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      fullPage: true,
      animations: 'disabled',
      path: info.outputPath(`${label}-${theme}.png`),
    });
  }
}

test('figure, chain, Kapitalerträge line, charts and table agree with the cashflow API', async ({
  page,
}, info) => {
  const data = await api(page, '1J');
  const t = data.totals;
  expect(t.incomeCents - t.consumptionCents).toBe(t.netCents);
  await page.goto('/reports/cashflow?zeitraum=1J');
  await expect(
    page.getByRole('heading', { name: /Nettocashflow · letzte 12 Monate/ }),
  ).toBeVisible();
  await expect(page.getByTestId('cf-figure')).toHaveText(eur(t.netCents));
  await expect(page.getByTestId('cf-state')).toContainText(
    `${t.positiveMonths} von ${t.months} Monaten positiv`,
  );
  // Kapitalerträge: labelled and separate, never inside the chain
  await expect(page.getByTestId('cf-capital')).toContainText(eur(t.capitalCents));
  await expect(page.getByTestId('cf-capital')).toContainText('weder zu den Einnahmen');
  await expect(page.getByTestId('cashflow-chart')).toBeVisible();
  await expect(page.getByTestId('cashflow-net-chart')).toBeVisible();
  const rows = page.getByTestId('cf-table').locator('tbody tr');
  await expect(rows).toHaveCount(t.months + 1);
  const total = rows.last().locator('td');
  await expect(total.nth(1)).toHaveText(eur(t.incomeCents));
  await expect(total.nth(4)).toHaveText(eur(t.netCents, { sign: true }));
  await expect(total.nth(6)).toHaveText(eur(t.capitalCents));
  const newest = data.months.filter((m) => m.inWindow).at(-1)!;
  await expect(rows.first().locator('td').nth(4)).toHaveText(eur(newest.netCents, { sign: true }));
  await expect(rows.first().locator('td').nth(6)).toHaveText(eur(newest.capitalCents));
  await inspect(page, info, 'cashflow');
});

test('a shorter Zeitraum changes the figures and keeps the chart at six months or more', async ({
  page,
}) => {
  const three = await api(page, '3M');
  expect(three.windowMonths).toHaveLength(3);
  expect(three.months.length).toBeGreaterThanOrEqual(6);
  await page.goto('/reports/cashflow');
  await page.getByRole('button', { name: '3M', exact: true }).click();
  await expect(page).toHaveURL(/zeitraum=3M/);
  await expect(page.getByTestId('cf-figure')).toHaveText(eur(three.totals.netCents));
  await expect(page.getByTestId('cf-table').locator('tbody tr')).toHaveCount(4);
});
