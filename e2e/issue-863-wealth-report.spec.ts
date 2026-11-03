import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import type { AssetsDebtsHistory, NetWorthHistory, WholePicture } from '@budget/db';
import { eur } from '../apps/web/src/ledger/format';
import { redesignReportsOn } from './report-frame';
import { sampleTest as test } from './sample';

test('wealth views keep canonical cents, sources, month selection and accessible detail', async ({
  page,
}, info) => {
  await page.goto('/reports/vermoegen-schulden?darstellung=bilanz&zeitraum=YTD&monat=2026-08');
  if (!(await redesignReportsOn(page))) {
    await expect(
      page.getByRole('group', { name: 'Ansicht von Vermögen und Schulden' }),
    ).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: 'Darstellung des Vermögensreports' }),
    ).toHaveCount(0);
    return;
  }
  const balance = (await (
    await page.request.get('/api/assets-debts-history?period=YTD')
  ).json()) as AssetsDebtsHistory;
  const history = (await (
    await page.request.get('/api/networth-history?period=YTD')
  ).json()) as NetWorthHistory;
  const whole = (await (
    await page.request.get('/api/overview/whole-picture?period=YTD')
  ).json()) as WholePicture;
  const views = [
    ['bilanz', '.assets-debts-report', balance.months.at(-1)!.netCents],
    ['verlauf', '.wealth-history-report', history.chain.nowCents],
    ['gesamt', '.whole-picture', whole.totals.endCents],
    ['schulden', '.assets-debts-report', -balance.months.at(-1)!.debtsCents],
  ] as const;
  mkdirSync('docs/evidence/redesign-reports-20261103-b', { recursive: true });
  for (const [view, body, amount] of views) {
    await page
      .getByRole('combobox', { name: 'Darstellung des Vermögensreports' })
      .selectOption(view);
    await expect(page).toHaveURL(new RegExp(`darstellung=${view}`));
    await expect(page.locator(body)).toBeVisible();
    if (view === 'verlauf') await expect(page.getByTestId('wealth-monthly-bridge')).toBeVisible();
    if (view === 'schulden')
      await expect(page.getByTestId('debt-account-comparison')).toBeVisible();
    await expect(page.getByTestId('report-frame-result')).toHaveText(eur(amount));
    await expect(page.getByTestId('report-calculation').getByRole('group')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-08');
    expect(new URL(page.url()).searchParams.get('zeitraum')).toBe('YTD');
    await page.reload();
    await expect(
      page.getByRole('combobox', { name: 'Darstellung des Vermögensreports' }),
    ).toHaveValue(view);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset['theme'] = theme;
        window.scrollTo(0, 0);
      }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      if (info.project.name !== 'webkit-iphone')
        await page.screenshot({
          path: `docs/evidence/redesign-reports-20261103-b/${view}-${info.project.name === 'desktop' ? '1440' : '390'}-${theme}.png`,
          animations: 'disabled',
          fullPage: true,
        });
    }
  }
});
