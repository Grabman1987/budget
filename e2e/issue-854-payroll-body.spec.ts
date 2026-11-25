import { setTheme } from './theme';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PayrollData } from '../apps/web/src/reports/payroll-projects-api';
import type { PayslipInput } from '@budget/domain';
import { test } from './isolated-ledger';
import { expect } from '@playwright/test';
import { redesignReportsOn } from './report-frame';
import { openR8BodyDetails } from './income-spending-controls';
import { withShellControls } from './shell-actions';

test.use({ ledgerToday: '2026-09-17' });
test('1207 salary: literal paid-month totals, whole combined slip, gaps and shared inspection', async ({
  page,
  request,
  baseURL,
}, info) => {
  const regular: PayslipInput = {
    month: '2026-01',
    kind: 'regular',
    specialType: null,
    grossCents: 300000,
    svCents: 50000,
    taxCents: 40000,
    netCents: 210000,
    bookingId: null,
    receiptId: null,
    lines: [],
  };
  const records: PayslipInput[] = [
    regular,
    {
      ...regular,
      month: '2026-02',
      netCents: 216000,
      lines: [
        { section: 'reimbursement', label: 'Telearbeit', amountCents: 1000 },
        { section: 'reimbursement', label: 'Fahrgeld', amountCents: 2000 },
        { section: 'reimbursement', label: 'Reisespesen', amountCents: 3000 },
      ],
    },
    {
      ...regular,
      month: '2026-02',
      kind: 'special',
      specialType: 'salary13',
      grossCents: 200000,
      svCents: 30000,
      taxCents: 20000,
      netCents: 150000,
    },
    {
      ...regular,
      month: '2026-03',
      svCents: 70000,
      taxCents: 90000,
      netCents: 340000,
      lines: [{ section: 'earning', label: 'Bonus', amountCents: 200000 }],
    },
    { ...regular, month: '2026-05' },
  ];
  for (const data of records) {
    const response = await request.post('/api/payslips', {
      headers: { origin: baseURL! },
      data,
    });
    expect(response.ok()).toBe(true);
  }
  const before = (await (await request.get('/api/payslips?month=2026-02')).json()) as PayrollData;
  const combined = before.captured.find((row) => row.month === '2026-03')!;
  expect(before.sources.find((row) => row.id === combined.id)?.originalLines).toEqual([]);
  expect(before.captured).toHaveLength(5);
  await page.goto('/reports/gehalt?monat=2026-02');
  expect(await redesignReportsOn(page)).toBe(true);
  const composition = page.getByTestId('payroll-net-composition');
  const table = page.getByTestId('payroll-net-table');
  const inspection = composition.getByRole('group');
  const tooltip = page.locator('.chart-tooltip[role="status"]');
  const expected = [
    ['Jänner 2026', '2.100,00 €', '0,00 €', '2.100,00 €'],
    ['Februar 2026', '2.130,00 €', '1.500,00 €', '3.630,00 €'],
    ['März 2026', '3.400,00 €', '0,00 €', '3.400,00 €'],
    ['April 2026', '–', '–', '–'],
    ['Mai 2026', '2.100,00 €', '0,00 €', '2.100,00 €'],
  ];
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await expect(page.getByTestId('payroll-net-legend')).toContainText(
      'kein vergleichbares laufendes Monatsnetto',
    );
    await expect(page.getByTestId('report-frame-result')).toHaveText('3.660,00 €');
    await expect(table.locator('tbody tr')).toHaveText([
      'Mai 20262.100,00 €—2.100,00 €',
      'Mär 20263.400,00 €—3.400,00 €',
      'Feb 20262.130,00 € inkl. Sonderzahlung (brutto 2.000,00 €)1.500,00 €3.630,00 €',
      'Jän 20262.100,00 €—2.100,00 €',
    ]);
    await expect(table.getByRole('columnheader')).toHaveText([
      'Monat',
      'Regulär / kombiniert',
      'Sonderzahlung · Bonus',
      'Summe',
    ]);
    await expect(composition.locator('.pp-running')).toHaveCount(4);
    await expect(composition.locator('.pp-special')).toHaveCount(1);
    await expect(composition.locator('[data-chart-point="1"] .pp-special')).toHaveCount(1);
    await expect(composition.locator('[data-chart-point="3"]')).toHaveCount(0);
    await inspection.blur();
    await inspection.focus();
    for (const [index, [date, ...values]] of expected.entries()) {
      if (index) await page.keyboard.press('ArrowRight');
      await expect(tooltip.locator('.chart-tooltip-date')).toHaveText(date!);
      await expect(tooltip.locator('.chart-tooltip-row')).toHaveText([
        `Regulär / kombiniert${values[0]}`,
        `Sonderzahlung · Bonus${values[1]}`,
        `Summe${values[2]}`,
      ]);
    }
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);
    // Touch/pointer inspection uses the same literal payout-month values as the keyboard.
    const special = composition.locator('.pp-special');
    if (info.project.name === 'mobile') await special.tap();
    else await special.hover();
    await expect(tooltip).toContainText('3.630,00 €');
    await page.keyboard.press('Escape');
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`salary-1207-${theme}.png`), fullPage: true });
  }
  await withShellControls(page, async ({ privacy }) => privacy.click());
  await expect(table).not.toContainText('3.400,00');
  await inspection.focus();
  await expect(tooltip).toContainText('•••');
  await expect(tooltip).not.toContainText('2.100,00');
  await page.keyboard.press('Escape');
  await withShellControls(page, async ({ privacy }) => privacy.click());
  await openR8BodyDetails(page);
  const grossChart = page.locator('[data-r8-detail="payroll-history"] .chart-interactive');
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await grossChart.blur();
    await grossChart.focus();
    await page.keyboard.press('ArrowRight');
    await expect(tooltip.locator('.chart-tooltip-row')).toHaveText([
      'Brutto5.030,00 €',
      'Netto3.630,00 €',
    ]);
    await page.keyboard.press('Escape');
  }
  await page.goto(`/reports/gehalt/historie?monat=2026-03&zettel=${combined.id}`);
  await expect(page.locator('.pp-slip')).toContainText('3.400,00 €');
  await expect(page.getByRole('button', { name: /aufteilen|split/i })).toHaveCount(0);
  await page.goto('/reports/gehalt?monat=2026-04');
  await expect(page.getByTestId('report-frame-result')).toHaveText('—');
  await expect(
    page.getByText('Für diesen Monat ist noch kein Gehaltszettel erfasst.', { exact: true }),
  ).toBeVisible();
  const after = (await (await request.get('/api/payslips?month=2026-02')).json()) as PayrollData;
  expect(after.captured).toEqual(before.captured);
  expect(after.years).toEqual(before.years);
});

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
  await expect(page.getByTestId('payroll-net-composition')).toBeVisible();
  await expect(page.locator('.r9-salary-trend .pp-running')).toHaveCount(23);
  await expect(page.getByTestId('payroll-net-table').getByRole('columnheader')).toHaveText([
    'Monat',
    'Regulär / kombiniert',
    'Sonderzahlung · Bonus',
    'Summe',
  ]);
  await expect(page.locator('[data-r8-detail][open]')).toHaveCount(0);
  const folder = 'docs/evidence/redesign-reports-20261103-a';
  for (const view of ['main', 'history'] as const) {
    if (view === 'history') {
      await page.getByRole('link', { name: 'Gehaltszettel-Historie', exact: true }).click();
      await expect(page.locator('.pp-history li')).toHaveCount(23);
      await expect(page.locator('.pp-history li').first()).toContainText('Aug 2026');
      await expect(page.locator('.pp-history li').last()).toContainText('Sep 2024');
    }
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
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
