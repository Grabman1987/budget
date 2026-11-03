import AxeBuilder from '@axe-core/playwright';
import {
  cents,
  formatEuro,
  formatPercent,
  reportPeriodMonths,
  savingsOverview,
} from '@budget/domain';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ReportTables } from '../apps/web/src/reports/table-reports-api';
import { expect, sampleTest as test } from './sample';
import { redesignReportsOn } from './report-frame';
import { withShellControls } from './shell-actions';
import { openR8BodyDetails } from './income-spending-controls';

for (const report of ['flow', 'savings'] as const) {
  test(`855 ${report}: same reader, compact charts, accessible full detail, print and 320px`, async ({
    page,
  }, info) => {
    if (info.project.name !== 'desktop') await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      report === 'flow' ? '/reports/geldfluss?monat=2026-08' : '/reports/sparquote?zeitraum=1J',
    );
    const ready = page.getByTestId(report === 'flow' ? 'sankey-chart' : 'savings-chart');
    await expect(ready).toBeVisible();
    const on = await redesignReportsOn(page);
    if (!on) {
      await expect(page.locator('.titleblock')).toBeVisible();
      await expect(page.locator('.r10-flow-ratio')).toHaveCount(0);
      return;
    }
    let expected: string;
    if (report === 'flow') {
      const response = await page.request.get('/api/reports/month/flow?month=2026-08&span=month');
      expect(response.ok()).toBe(true);
      const data = await response.json();
      expected = formatEuro(cents(data.flow.restCents), { sign: true });
      expect(data.flow.columns.pool).toHaveLength(1);
      await expect(page.locator('.r10-flow-ratio li')).toHaveCount(
        data.flow.columns.classes.length,
      );
      await expect(page.getByRole('combobox', { name: 'Zeitraum des Geldflusses' })).toBeVisible();
    } else {
      const response = await page.request.get('/api/report-tables/months');
      expect(response.ok()).toBe(true);
      const data = (await response.json()) as ReportTables;
      const window = reportPeriodMonths('1J', data.lastFullMonth!, data.firstMonth!);
      expected = formatPercent(
        savingsOverview(data.months, data, window, data.lastFullMonth).window.rateBp!,
      );
      await expect(page.getByTestId('money-age-chart')).toBeVisible();
      await expect(page.getByRole('group', { name: 'Zeitraum', exact: true })).toHaveCount(1);
    }
    await expect(page.getByTestId('report-frame-result')).toHaveText(expected);
    await expect(page.getByTestId('report-frame-source')).toContainText('Stand');
    const folder = 'docs/evidence/redesign-reports-20261103-a';
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (info.project.name !== 'webkit-iphone') {
        mkdirSync(folder, { recursive: true });
        await page.screenshot({
          path: join(folder, `r10-${report}-${info.project.name}-${theme}.png`),
          fullPage: true,
        });
      }
    }
    const details = page.locator('[data-r8-detail]');
    expect(await details.count()).toBeGreaterThan(1);
    await expect(details.first()).not.toHaveAttribute('open');
    await details.first().locator(':scope > summary').focus();
    await page.keyboard.press('Enter');
    await expect(details.first()).toHaveAttribute('open', '');
    await details.first().locator(':scope > summary').click();
    await page.emulateMedia({ media: 'print' });
    for (const detail of await details.all()) await expect(detail).toHaveAttribute('open', '');
    await page.emulateMedia({ media: 'screen' });
    await expect(details.first()).not.toHaveAttribute('open');
    await openR8BodyDetails(page);
    await expect(page.getByTestId(report === 'flow' ? 'flow-list' : 'capital-note')).toBeVisible();
    const exact = page.locator('.chart-data-table').first();
    await exact.locator(':scope > summary').focus();
    await page.keyboard.press('Enter');
    await expect(exact.getByRole('table')).toBeVisible();
    await withShellControls(page, async ({ privacy }) => privacy.click());
    await expect(page.getByTestId('report-frame-result')).toContainText('•••');
    await withShellControls(page, async ({ privacy }) => privacy.click());
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
