import AxeBuilder from '@axe-core/playwright';
import { expect as baseExpect, type Page, type TestInfo } from '@playwright/test';
import type { AssetsDebtsHistory } from '@budget/db';
import { eur, monthName } from '../apps/web/src/ledger/format';
import { sampleTest as test } from './sample';

// One valuation per month end; the shared test machine can be slow.
const expect = baseExpect.configure({ timeout: 20_000 });
test.beforeEach(() => test.slow());

const REPORT = '/reports/vermoegen-schulden';
const longMonth = (month: string) => `${monthName(`${month}-01`)} ${month.slice(0, 4)}`;

async function api(page: Page, period: string) {
  const res = await page.request.get(`/api/assets-debts-history?period=${period}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as AssetsDebtsHistory;
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

test('header, chart and month table agree with the API, which agrees with Nettovermögen', async ({
  page,
}, info) => {
  const data = await api(page, 'Alles');
  const wealth = await page.request.get('/api/wealth/networth?period=Alles');
  expect((await wealth.json()).chain.nowCents).toBe(data.change.endCents);
  const end = data.months.at(-1)!;
  expect(end.assetsCents + end.debtsCents).toBe(end.netCents);
  expect(end.debts.length).toBeGreaterThan(0);

  // No zeitraum in the URL: the report starts with everything since the first account.
  await page.goto(REPORT);
  await expect(page.getByRole('heading', { name: /Nettovermögen · seit/ })).toBeVisible();
  await expect(page.getByTestId('ad-net')).toHaveText(eur(end.netCents));
  await expect(page.getByTestId('ad-assets')).toHaveText(eur(end.assetsCents));
  await expect(page.getByTestId('ad-debts')).toHaveText(eur(end.debtsCents));
  await expect(page.getByTestId('ad-change')).toHaveText(
    eur(data.change.deltaCents, { sign: true }),
  );
  await expect(page.getByTestId('ad-change-rate')).toContainText('%');
  await expect(page.getByTestId('assets-debts-chart')).toBeVisible();

  const rows = page.getByTestId('ad-months').locator('tbody tr');
  await expect(rows).toHaveCount(data.months.length);
  const first = data.months[0]!;
  await expect(rows.first().locator('td').nth(0)).toHaveText(eur(first.assetsCents));
  await expect(rows.first().locator('td').nth(1)).toHaveText(eur(first.debtsCents));
  await expect(rows.last().locator('td').nth(2)).toHaveText(eur(end.netCents));
  await expect(
    page.getByRole('table', { name: /Vermögenswerte, Schulden und Nettovermögen/ }),
  ).toBeVisible();

  // The newest month is selected: its accounts are listed.
  const accounts = page.getByTestId('ad-accounts');
  await expect(accounts.locator('tr[data-account]')).toHaveCount(
    end.assets.length + end.debts.length,
  );
  await expect(page.getByTestId('ad-g-net')).toHaveText(eur(end.netCents));
  await inspect(page, info, 'assets-debts');
});

test('selecting a month, in the table or the chart, shows the accounts of that month end', async ({
  page,
}) => {
  const data = await api(page, 'Alles');
  const months = data.months;
  const a = months[months.length - 6]!;
  const b = months[months.length - 3]!;
  await page.goto(REPORT);
  await expect(page.getByTestId('assets-debts-chart')).toBeVisible();

  // Table button (the keyboard path).
  await page
    .getByTestId('ad-months')
    .getByRole('button', { name: new RegExp(`^${longMonth(a.month)}`) })
    .click();
  await expect(page).toHaveURL(new RegExp(`monat=${a.month}`));
  await expect(page.getByRole('heading', { name: `Konten · ${longMonth(a.month)}` })).toBeVisible();
  await expect(page.getByTestId('ad-g-assets-total')).toHaveText(eur(a.assetsCents));
  await expect(page.getByTestId('ad-g-debts-total')).toHaveText(eur(a.debtsCents));
  await expect(page.getByTestId('ad-g-net')).toHaveText(eur(a.netCents));
  for (const row of [...a.assets, ...a.debts]) {
    await expect(
      page.getByTestId('ad-accounts').locator(`tr[data-account="${row.accountId}"] td`).nth(2),
    ).toHaveText(eur(row.valueCents));
  }
  await expect(
    page.getByRole('button', { name: new RegExp(`^${longMonth(a.month)}`) }),
  ).toHaveAttribute('aria-pressed', 'true');

  // Click in the chart (pointer shortcut).
  await page.locator(`.rf-hit[data-month="${b.month}"]`).click();
  await expect(page).toHaveURL(new RegExp(`monat=${b.month}`));
  await expect(page.getByTestId('ad-g-net')).toHaveText(eur(b.netCents));
  await expect(page.getByTestId('assets-debts-pick')).toHaveCount(1);

  // The choice survives a reload; the header keeps showing the end of the period.
  await page.reload();
  await expect(page.getByTestId('ad-g-net')).toHaveText(eur(b.netCents));
  const end = months.at(-1)!;
  await expect(page.getByTestId('ad-net')).toHaveText(eur(end.netCents));
});

test('the Zeitraum switch and a custom range follow the URL and change months and figures', async ({
  page,
}) => {
  const year = await api(page, '1J');
  await page.goto(REPORT);
  await page.getByRole('button', { name: '1J', exact: true }).click();
  await expect(page).toHaveURL(/zeitraum=1J/);
  await expect(page.getByRole('heading', { name: /letzte 12 Monate/ })).toBeVisible();
  await expect(page.getByTestId('ad-months').locator('tbody tr')).toHaveCount(year.months.length);
  await expect(page.getByTestId('ad-change')).toHaveText(
    eur(year.change.deltaCents, { sign: true }),
  );
  await page.reload();
  await expect(page.getByRole('button', { name: '1J', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const range = await api(page, '2026-03..2026-06');
  await page.goto(`${REPORT}?zeitraum=2026-03..2026-06`);
  await expect(page.getByTestId('ad-months').locator('tbody tr')).toHaveCount(4);
  await expect(page.getByTestId('ad-net')).toHaveText(eur(range.months.at(-1)!.netCents));
  await expect(page.getByTestId('ad-change')).toHaveText(
    eur(range.change.deltaCents, { sign: true }),
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the report is listed in the catalog next to Vermögensverläufe', async ({ page }) => {
  await page.goto('/reports/gruppe/zukunft');
  await expect(page.getByRole('link', { name: /Vermögen & Schulden/ }).first()).toBeVisible();
});
