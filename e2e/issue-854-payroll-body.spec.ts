import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PayrollData } from '../apps/web/src/reports/payroll-projects-api';
import { test } from './isolated-ledger';
import { expect } from '@playwright/test';
import { redesignReportsOn } from './report-frame';
import { openR8BodyDetails } from './income-spending-controls';
import { withShellControls } from './shell-actions';

test.use({ ledgerToday: '2026-09-17' });
test('854 payroll: recorded cents, recent curve, complete history, selected slip, themes and 320px', async ({
  page,
  request,
  baseURL,
}, info) => {
  const records = [
    ...Array.from({ length: 24 }, (_, i) => {
      const month = new Date(Date.UTC(2024, 8 + i, 1)).toISOString().slice(0, 7);
      const raise = Math.floor(i / 6) * 12000;
      return {
        month,
        grossCents: 350003 + raise,
        svCents: 65001,
        taxCents: 45002,
        netCents: 240000 + raise,
        lines: [],
      };
    }).filter((row) => !['2025-06', '2026-08', '2025-11'].includes(row.month)),

    {
      month: '2025-06',
      grossCents: 300003,
      svCents: 50001,
      taxCents: 40002,
      netCents: 210000,
      lines: [],
    },
    {
      month: '2026-08',
      grossCents: 400003,
      svCents: 70001,
      taxCents: 50002,
      netCents: 295003,
      lines: [{ section: 'reimbursement', label: 'Synthetic travel', amountCents: 15003 }],
    },
  ];
  for (const row of records) {
    const response = await request.post('/api/payslips', {
      headers: { origin: baseURL! },
      data: { ...row, kind: 'regular', specialType: null, bookingId: null, receiptId: null },
    });
    expect(response.ok()).toBe(true);
  }
  const read = await request.get('/api/payslips?month=2026-08');
  expect(read.ok()).toBe(true);
  const data = (await read.json()) as PayrollData;
  const retainedId = data.captured.find((p) => p.month === '2025-06')!.id;
  await page.goto('/reports/gehalt?monat=2026-08');
  await expect(page.getByTestId('payroll-report')).toBeVisible();
  const on = await redesignReportsOn(page);
  if (!on) {
    await expect(page.getByRole('group', { name: 'Brutto zu Netto', exact: true })).toContainText(
      '2.950,03 €',
    );
    await expect(page.locator('.r9-salary-trend')).toHaveCount(0);
    return;
  }
  await expect(page.getByTestId('report-frame-result')).toHaveText('2.950,03 €');
  await expect(page.locator('.r9-salary-trend .pp-net')).toBeVisible();
  await expect(page.locator('.r9-salary-trend .pp-dot')).toHaveCount(23);
  await expect(page.locator('[data-r8-detail][open]')).toHaveCount(0);
  const folder = 'docs/evidence/redesign-reports-20261103-a';
  for (const view of ['main', 'history'] as const) {
    if (view === 'history') {
      await page.getByRole('link', { name: 'Gehaltszettel-Historie', exact: true }).click();
      await expect(page.locator('.pp-history li')).toHaveCount(23);
      await expect(page.locator('.pp-history li').first()).toContainText('Aug 2026');
      await expect(page.locator('.pp-history li').last()).toContainText('Sep 2024');
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (info.project.name !== 'webkit-iphone') {
        mkdirSync(folder, { recursive: true });
        await page.screenshot({
          path: join(folder, `r9-${view}-${info.project.name}-${theme}.png`),
          fullPage: true,
        });
      }
    }
  }
  await page.goto(`/reports/gehalt/historie?monat=2026-08&zettel=${retainedId}`);
  await expect(page.locator('.pp-slip')).toContainText('Jun 2025');
  await expect(page.getByTestId('report-frame-result')).toHaveText('2.100,00 €');
  expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-08');
  await page.goto('/reports/gehalt?monat=2026-08');
  await openR8BodyDetails(page);
  await expect(page.getByRole('group', { name: 'Brutto zu Netto', exact: true })).toContainText(
    '150,03 €',
  );
  await expect(page.locator('[data-r8-detail="payroll-history"] .pp-gross')).toBeVisible();
  await withShellControls(page, async ({ privacy }) => privacy.click());
  await expect(page.getByTestId('report-frame-result')).toContainText('•••');
  await withShellControls(page, async ({ privacy }) => privacy.click());
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/reports/gehalt?monat=2026-09');
  await expect(
    page.getByText('Für diesen Monat ist noch kein Gehaltszettel erfasst.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('report-frame-result')).toHaveText('—');
});
