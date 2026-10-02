import AxeBuilder from '@axe-core/playwright';
import { expect as baseExpect, type Page, type TestInfo } from '@playwright/test';
import type { NetWorthHistory } from '@budget/db';
import { eur } from '../apps/web/src/ledger/format';
import { sampleTest as test } from './sample';

// The history reads one valuation per week or month end; the shared test machine can be slow.
const expect = baseExpect.configure({ timeout: 15_000 });
test.beforeEach(() => test.slow());

async function api(page: Page, period: string) {
  const res = await page.request.get(`/api/networth-history?period=${period}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as NetWorthHistory;
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

test('figure, chain, chart and structure agree with the history API and the net worth page', async ({
  page,
}, info) => {
  const history = await api(page, 'YTD');
  const page2 = await page.request.get('/api/wealth/networth?period=YTD');
  expect((await page2.json()).chain).toEqual(history.chain);
  await page.goto('/reports/vermoegen');
  await expect(
    page.getByRole('heading', { name: /Nettovermögen · seit Jahresbeginn/ }),
  ).toBeVisible();
  await expect(page.getByTestId('wh-figure')).toHaveText(
    eur(history.chain.nowCents).replace(' €', '').concat(' €').replace(/\s+/g, ' ').trim(),
  );
  await expect(page.getByTestId('wealth-history-chart')).toBeVisible();
  const rows = page.getByTestId('wh-structure').locator('tbody tr');
  await expect(rows).toHaveCount(history.rows.length + 1);
  const total = rows.last().locator('td');
  await expect(total.nth(1)).toHaveText(eur(history.chain.startCents));
  await expect(total.nth(2)).toHaveText(eur(history.chain.nowCents));
  await expect(total.nth(3)).toHaveText(eur(history.chain.deltaCents, { sign: true }));
  for (const r of history.rows) {
    const row = rows.filter({ has: page.getByRole('cell', { name: r.label, exact: true }) });
    await expect(row.locator('td').nth(2)).toHaveText(eur(r.nowCents));
  }
  await inspect(page, info, 'wealth-history');
});

test('the Zeitraum switch follows the URL and changes the figures', async ({ page }) => {
  const year = await api(page, '1J');
  await page.goto('/reports/vermoegen');
  await page.getByRole('button', { name: '1J', exact: true }).click();
  await expect(page).toHaveURL(/zeitraum=1J/);
  await expect(page.getByRole('heading', { name: /letzte 12 Monate/ })).toBeVisible();
  const total = page.getByTestId('wh-structure').locator('tbody tr').last().locator('td');
  await expect(total.nth(1)).toHaveText(eur(year.chain.startCents));
  await page.reload();
  await expect(page.getByRole('button', { name: '1J', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
