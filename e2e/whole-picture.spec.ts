import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { sampleTest } from './sample';
import type { WholePicture } from '@budget/db';
sampleTest.describe.configure({ timeout: 120_000 });

sampleTest(
  'Gesamtübersicht: shared figures, inspection, CSV and phone layout',
  async ({ page }, info) => {
    const loaded = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/overview/whole-picture',
    );
    await page.goto('/reports/gesamtuebersicht');
    const response = await loaded;
    expect(response.status()).toBe(200);
    const data = (await response.json()) as WholePicture;
    await expect(
      page.getByRole('heading', { name: 'Gesamtübersicht', exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByTestId('whole-chart')).toBeVisible();
    await expect(page.getByTestId('whole-table').locator('tbody tr')).toHaveCount(
      data.rows.length + 1,
    );
    await expect(page.getByTestId('whole-table').locator('tbody tr').first()).toContainText(
      'August 2026',
    );
    await expect(page.getByTestId('whole-table').locator('tbody tr').last()).toContainText('Summe');
    await expect(
      page
        .getByTestId('whole-table')
        .locator('tbody tr')
        .first()
        .locator('td')
        .nth(6)
        .getByRole('link'),
    ).toHaveAttribute('href', /\/konten\/buchungen.*von=2026-08-01/);
    await expect(page.getByRole('group', { name: 'Maßkette Nettovermögen' })).toContainText(
      'Sonstiges',
    );
    await expect(page.locator('.titleblock')).not.toContainText('noch nie');
    const chart = page.getByRole('group', {
      name: 'Monatlicher Sparbetrag und Markteffekt mit Nettovermögen',
    });
    await chart.focus();
    for (let i = 1; i < data.rows.length; i++) await page.keyboard.press('ArrowRight');
    const tooltip = page.locator('.chart-tooltip[role="status"]');
    await expect(tooltip).toContainText('2026');
    await expect(tooltip).toContainText('Kapitalerträge');
    await expect(tooltip).toContainText('In Investments eingezahlt');
    await page.keyboard.press('Escape');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV exportieren' }).click();
    const file = await download;
    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const csv = Buffer.concat(chunks)
      .toString('utf8')
      .replace(/^\uFEFF/, '');
    const table = await page
      .getByTestId('whole-table')
      .locator('tr')
      .evaluateAll((rows) =>
        rows.map((r) => [...r.querySelectorAll('th,td')].map((c) => c.textContent ?? '')),
      );
    expect(csv).toBe(
      table.map((r) => r.map((s) => `"${s.replaceAll('"', '""')}"`).join(';')).join('\r\n'),
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      expect(
        (await new AxeBuilder({ page }).include('main').analyze()).violations.filter((v) =>
          ['serious', 'critical'].includes(v.impact ?? ''),
        ),
      ).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
        info.project.use.viewport!.width,
      );
      await page.screenshot({
        path: info.outputPath(`whole-picture-${theme}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
    const previous = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/overview/whole-picture',
    );
    await page.getByRole('button', { name: 'Voriger Zeitraum' }).click();
    expect((await previous).status()).toBe(200);
    await expect(page.getByTestId('whole-table').locator('tbody tr').first()).toContainText(
      'August 2025',
    );
    // Calendar navigation must also let us return from a window before the first records.
    let olderRows = data.rows;
    for (let i = 0; i < 5 && olderRows.length; i++) {
      const older = page.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/overview/whole-picture',
      );
      await page.getByRole('button', { name: 'Voriger Zeitraum' }).click();
      const olderResponse = await older;
      expect(olderResponse.status()).toBe(200);
      olderRows = ((await olderResponse.json()) as WholePicture).rows;
    }
    await expect(page.getByText('Noch keine Monate in diesem Zeitraum.')).toBeVisible();
    const back = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/overview/whole-picture',
    );
    await page.getByRole('button', { name: 'Nächster Zeitraum' }).click();
    expect((await back).status()).toBe(200);
    await expect(page.getByTestId('whole-table')).toBeVisible();
    const onepager = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/reports/month/onepager',
    );
    await page.goto('/reports/onepager?monat=2026-08');
    expect((await onepager).status()).toBe(200);
    await expect(page.getByTestId('onepager-income')).toBeVisible();
    await expect(page.locator('#ps-b')).toHaveText('BAusgaben im Monatsverlauf');
    await expect(page.locator('#ps-f')).toHaveText('FNettovermögen');
    await expect(page.locator('.chart-legend')).not.toContainText('Prognose');
    await expect(page.locator('.pace-income-line').first()).toBeVisible();
    await page.screenshot({
      path: info.outputPath('onepager.png'),
      fullPage: true,
      animations: 'disabled',
    });
    if (info.project.name === 'desktop') {
      await page.setViewportSize({ width: 734, height: 1062 });
      await page.emulateMedia({ media: 'print' });
      await expect(page.locator('.global-search-trigger')).toBeHidden();
      await expect(page.locator('.pace-income-line').first()).toHaveCSS('animation-name', 'none');
      await page.screenshot({
        path: info.outputPath('onepager-print.png'),
        fullPage: true,
        animations: 'disabled',
      });
    }
  },
);
