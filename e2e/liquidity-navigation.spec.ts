import { openHeuteReview } from './heute-visual-fixture';
import { forecastHorizon, redesignEnabled } from './plan-redesign-controls';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-03-18' });
test('Plan reaches liquidity and a payment keeps its account, due date and chosen forecast', async ({
  page,
  baseURL,
}, info) => {
  test.slow();
  const post = async (path: string, data: unknown) => {
    const res = await page.request.post(`/api${path}`, { headers: { origin: baseURL! }, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const { account } = await post('/accounts', {
    name: 'Synthetic payment account',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 100_000,
  });
  await post('/expected', {
    name: 'Synthetic upcoming payment',
    accountId: account.id,
    kind: 'outflow',
    rhythm: 'monthly',
    dueDay: 20,
    startDate: '2026-03-20',
    validFrom: '2026-03-20',
    amountCents: 120_001,
  });
  await post('/liquidity/events', {
    name: 'Unassigned synthetic event',
    date: '2026-04-01',
    amountCents: -10_001,
  });
  await page.goto('/plan/monat');
  if (await redesignEnabled(page)) await page.locator('main .area-page-menu > summary').click();
  await page.getByRole('link', { name: 'Prognose', exact: true }).click();
  await expect(page).toHaveURL(/plan\/prognose/);
  await forecastHorizon(page, '90d', '90 Tage');
  await expect(page.getByTestId('liq-verdict').locator('strong')).toContainText('18.09.2026');
  await expect(page.getByTestId('liq-verdict').locator('strong')).toContainText('20.08.2026');
  await openHeuteReview(page, '/');
  await page
    .getByRole('link', { name: /Synthetic payment account.*Kontovorschau/ })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/konten/${account.id}.*faellig=2026-03-20`));
  await expect(page.getByTestId('account-payment-context')).toContainText('20.03.2026');
  await expect(page.getByTestId('account-preview-coverage')).toContainText('Teilprognose');
  await expect(page.getByTestId('account-preview-coverage')).toContainText('1 geplantes Ereignis');
  await expect(page.getByTestId('account-preview-range')).toContainText('16.06.2026');
  if (await redesignEnabled(page)) await page.locator('.account-chart-options > summary').click();
  await expect(page.getByRole('combobox', { name: 'Kontovorschau Zeitraum' })).toHaveValue('90d');
  await page.reload();
  await expect(page.getByTestId('account-payment-context')).toContainText('20.03.2026');
  await expect(page.getByTestId('account-preview-range')).toContainText('16.06.2026');
  if (await redesignEnabled(page)) await page.locator('.account-chart-options > summary').click();
  const target = page.getByRole('combobox', { name: 'Kontovorschau Zeitraum' });
  expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      ),
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath(`account-${theme}.png`), fullPage: true });
  }
  await page.goBack();
  await expect(page).toHaveURL((await redesignEnabled(page)) ? /\/heute\/details\/month/ : /\/$/);
});
