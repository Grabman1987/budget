import { expect, sampleTest as test } from './sample';
import { eur } from '../apps/web/src/ledger/format';
import type { AnnualCostYear } from '@budget/db';
import { redesignReportsOn } from './report-frame';

test('calendar-year costs preserve the selected period, privacy and the legacy bookmark', async ({
  page,
}) => {
  await page.goto('/reports/kosten?zeitraum=3M#details');
  const redesign = await redesignReportsOn(page);
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === (redesign ? '/reports/psteuern' : '/reports/abos') &&
      url.searchParams.get('darstellung') === 'bankkosten' &&
      url.searchParams.get('zeitraum') === '3M' &&
      url.hash === '#details',
  );
  if (!redesign) return;

  const response = await page.request.get('/api/portfolio/annual-costs');
  expect(response.ok()).toBe(true);
  const { years } = (await response.json()) as { years: AnnualCostYear[] };
  expect(years.length).toBeGreaterThan(1);
  const [latest, prior] = years;
  expect(latest!.partial).toBe(true);
  expect(latest!.total).not.toBeNull();
  expect(prior!.total).not.toBeNull();
  await page.goto(`/reports/psteuern?darstellung=gesamt&jahr=${prior!.year}&zeitraum=3M`);
  const select = page.getByRole('combobox', { name: 'Kalenderjahr' });
  const amount = page.getByTestId('cc-total');
  await expect(select).toHaveValue(String(prior!.year));
  await expect(amount).toHaveText(eur(prior!.total!.totalCents));
  await select.selectOption(String(latest!.year));
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('jahr') === String(latest!.year) &&
      url.searchParams.get('zeitraum') === '3M',
  );
  await page.reload();
  await expect(select).toHaveValue(String(latest!.year));
  await expect(amount).toHaveText(eur(latest!.total!.totalCents));
  await expect(page.getByTestId('cc-years').locator('tbody tr').first()).toContainText('Teiljahr');
  const privacy = (name: string) =>
    page.locator('.topbar, .m-head').getByRole('button', { name, exact: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await privacy('Beträge verbergen').press('Enter');
    await expect(amount).toHaveText('••• €');
    await expect(page.getByTestId('cc-years')).not.toContainText(/\d[,\d]*\s(?:%|€)/);
    await privacy('Beträge verbergen').press('Enter');
    await expect(amount).toHaveText(eur(latest!.total!.totalCents));
  }
});
