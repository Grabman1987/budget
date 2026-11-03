import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { eur } from '../apps/web/src/ledger/format';
import { redesignReportsOn } from './report-frame';
import { sampleTest as test } from './sample';

test('867 comparison and costs keep canonical totals; income detail has currency-specific CSV parity', async ({
  page,
}, info) => {
  await page.goto('/reports/pdepots?zeitraum=YTD');
  if (!(await redesignReportsOn(page))) {
    await expect(page.getByRole('heading', { name: /Depots ·/ })).toBeVisible();
    return;
  }
  const depots = await (await page.request.get('/api/portfolio/depots?period=YTD')).json();
  await expect(page.getByTestId('report-frame-result')).toHaveText(
    eur(depots.depots.total.performance.endValueCents),
  );
  mkdirSync('docs/evidence/redesign-reports-20261103-b', { recursive: true });
  const capture = async (name: string) => {
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset['theme'] = theme;
        window.scrollTo(0, 0);
      }, theme);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (info.project.name !== 'webkit-iphone')
        await page.screenshot({
          fullPage: true,
          animations: 'disabled',
          path: `docs/evidence/redesign-reports-20261103-b/${name}-${info.project.name === 'desktop' ? '1440' : '390'}-${theme}.png`,
        });
    }
  };
  await capture('depots');
  await page.goto('/reports/psteuern');
  const costs = await (await page.request.get('/api/portfolio/costs-taxes')).json();
  await expect(page.getByTestId('costs-net')).toHaveText(eur(costs.costs.net.netCents));
  await expect(page.getByTestId('report-frame-result')).toHaveText(eur(costs.costs.net.netCents));
  await capture('kosten');
  await page
    .getByRole('combobox', { name: 'Darstellung von Kosten, Steuern und Erträgen' })
    .selectOption('ertraege');
  await expect(page).toHaveURL(/darstellung=ertraege/);
  await expect(page.getByTestId('report-frame-result')).toHaveText(
    eur(costs.costs.income.grossCents),
  );
  await expect(page.getByTestId('portfolio-income-chart-EUR')).toBeVisible();
  await expect(page.getByTestId('portfolio-income-recent').locator('tbody tr')).not.toHaveCount(0);
  await page.getByText('Monatswerte als Tabelle · EUR', { exact: true }).click();
  const table = page.getByTestId('portfolio-income-table-EUR');
  await expect(table).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV · EUR', exact: true }).click();
  const file = await downloaded;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks)
    .toString('utf8')
    .replace(/^\uFEFF/, '');
  const cells = await table
    .locator('tr')
    .evaluateAll((rows) =>
      rows.map((row) => [...row.querySelectorAll('th,td')].map((cell) => cell.textContent ?? '')),
    );
  expect(csv).toBe(
    cells.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(';')).join('\r\n'),
  );
  await page.getByText('Monatswerte als Tabelle · EUR', { exact: true }).click();
  await capture('ertraege');
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: 'Darstellung von Kosten, Steuern und Erträgen' }),
  ).toHaveValue('ertraege');
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
