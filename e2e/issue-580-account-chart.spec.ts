import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

// Account register: Saldoverlauf is collapsed by default, expands on demand, state survives reload.
test('account history chart is collapsed by default, compact and remembered', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.setTimeout(90_000);
  const headers = { origin: baseURL! };
  const post = async (path: string, data: unknown) => {
    const response = await request.post('/api' + path, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Giro Muster',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 100000,
    overdraftLimitCents: 10000,
  });
  const { id } = await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-01',
    amountCents: -1234,
    payeeName: 'Laden Muster',
  });
  await page.goto(`/konten/${account.id}`);
  const toggle = page.getByTestId('account-chart-toggle');
  const chart = page.getByTestId('balance-chart');

  // First visit: collapsed, no chart, no time control, the first booking is reachable.
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(chart).toHaveCount(0);
  await expect(page.locator('#account-chart-body')).toBeHidden();
  await expect(page.getByRole('group', { name: 'Saldoverlauf Zeitraum' })).toHaveCount(0);
  await expect(page.locator(`[data-booking="${id}"]`)).toBeVisible();
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // Open: at most 140 px, one time control with exactly 3M / 12M / Alles, chip, Heute marker.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(chart).toBeVisible();
  expect((await chart.boundingBox())!.height).toBeLessThanOrEqual(140);
  const control = page.getByRole('group', { name: 'Saldoverlauf Zeitraum' });
  await expect(control).toHaveCount(1);
  await expect(control.getByRole('button')).toHaveText(['3M', '12M', 'Alles']);
  await expect(page.getByTestId('account-chart-chip')).toHaveText(/^Prognose \d+ Tage$/);
  await expect(chart.locator('.l-forecast')).toBeAttached();
  await expect(page.getByTestId('balance-chart-today')).toBeVisible();
  for (const button of await control.getByRole('button').all()) {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(chart).toBeVisible();
  }
  await chart.getByRole('slider').focus();
  await chart.getByRole('slider').press('Home');
  await expect(chart.locator('.kchart-tooltip')).toBeVisible();
  await expect(page.getByText(/Dispolimit/).first()).toBeVisible();

  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset['theme'] = t;
    }, theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`chart-open-${theme}.png`) });
  }

  // Remembered after reload, and collapsing is remembered too.
  await page.reload();
  await expect(page.getByTestId('account-chart-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(chart).toBeVisible();
  await page.getByTestId('account-chart-toggle').click();
  await page.reload();
  await expect(page.getByTestId('account-chart-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(chart).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('chart-collapsed.png') });
});
