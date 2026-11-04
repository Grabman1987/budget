import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, sampleTest as test } from './sample';
import { redesignReportsOn } from './report-frame';
import { withShellControls } from './shell-actions';
import { openIncomeTable } from './income-spending-controls';

const folder = 'docs/evidence/redesign-reports-20261103-a';
for (const [name, path, ready] of [
  ['overview', '/reports/einnahmen-ausgaben?zeitraum=1J', 'income-expense-chart'],
  ['income', '/reports/einnahmen?monat=2026-08', 'income-total'],
  ['cashflow', '/reports/cashflow?zeitraum=1J', 'cf-figure'],
  ['projects', '/reports/projekte?zeitraum=1J', 'projects-report'],
  ['spending', '/reports/ausgaben?zeitraum=1J', 'sa-consumption'],
  ['payees', '/reports/empfaenger?zeitraum=1J', 'payee-total'],
] as const) {
  test(`853 ${name}: real reader, compact controls, source, themes and 320px`, async ({
    page,
  }, info) => {
    if (info.project.name !== 'desktop') await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.removeItem('budget-report-income-details');
      for (const id of ['income-expected', 'income-types', 'income-capital'])
        localStorage.removeItem(`budget-report-r8-${id}`);
    });
    await page.goto(path);
    const on = await redesignReportsOn(page);
    await expect(
      page.getByTestId(on && name === 'spending' ? 'spending-period-chart' : ready),
    ).toBeVisible();
    if (!on) {
      await expect(page.locator('.titleblock')).toBeVisible();
      await expect(page.getByTestId('income-overview-summary')).toHaveCount(0);
      return;
    }
    await expect(page.getByTestId('report-frame-result')).not.toHaveText('—');
    await expect(page.getByTestId('report-frame-source')).toContainText(/Datenbasis/);
    await expect(
      page.getByRole('combobox', {
        name:
          name === 'spending' || name === 'payees'
            ? 'Ansicht der Ausgabenanalyse'
            : 'Ansicht von Einnahmen und Cashflow',
        exact: true,
      }),
    ).toBeVisible();
    if (name === 'overview') {
      await expect(page.getByTestId('income-overview-summary')).toBeVisible();
      await expect(page.locator('.r8-income-details')).not.toHaveAttribute('open');
      await expect(page.locator('.r8-months tbody tr')).toHaveCount(3);
    }
    if (name === 'income') {
      await expect(page.locator('.income-report > [data-r8-detail]')).toHaveCount(3);
      await expect(page.locator('.income-report > [data-r8-detail][open]')).toHaveCount(0);
    }
    if (name === 'spending') await expect(page.getByTestId('spending-period-chart')).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((v) => {
        document.documentElement.dataset['theme'] = v;
      }, theme);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (info.project.name !== 'webkit-iphone') {
        mkdirSync(folder, { recursive: true });
        await page.screenshot({
          path: join(folder, `r8-${name}-${info.project.name}-${theme}.png`),
          fullPage: true,
        });
      }
    }
    await withShellControls(page, async ({ privacy }) => {
      await privacy.click();
    });
    await expect(page.getByTestId('report-frame-result')).toContainText('•••');
    await withShellControls(page, async ({ privacy }) => {
      await privacy.click();
    });
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (name === 'overview') {
      await openIncomeTable(page);
      const region = page.getByRole('region', {
        name: 'Einnahmen und Ausgaben, seitlich scrollbar',
        exact: true,
      });
      await region.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    }
  });
}

test('853 recipient selection reopens its closed detail without losing the selected period', async ({
  page,
}) => {
  await page.goto('/reports/empfaenger?zeitraum=1J');
  await expect(page.getByTestId('payee-total')).toBeVisible();
  if (!(await redesignReportsOn(page))) return;
  const names = page.locator('.payee-bar-name');
  const first = (await names.nth(0).textContent())!.trim();
  const second = (await names.nth(1).textContent())!.trim();
  await names.nth(0).click();
  const detail = page.locator('[data-r8-detail="payee-all"]');
  await expect(detail).toHaveAttribute('open', '');
  await expect(
    page.getByRole('heading', { name: `Buchungen · ${first}`, exact: true }),
  ).toBeVisible();
  await detail.locator(':scope > summary').click();
  await expect(detail).not.toHaveAttribute('open');
  await names.nth(1).click();
  await expect(detail).toHaveAttribute('open', '');
  await expect(
    page.getByRole('heading', { name: `Buchungen · ${second}`, exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get('zeitraum')).toBe('1J');
});

test('853 print exposes the complete reader and restores closed screen details', async ({
  page,
}) => {
  for (const [path, detailSelector, tableSelector] of [
    ['/reports/einnahmen-ausgaben?zeitraum=1J', '.r8-income-details', '.rgrid'],
    [
      '/reports/cashflow?zeitraum=1J',
      '[data-r8-detail="cashflow-months"]',
      '[data-testid="cf-table"]',
    ],
  ] as const) {
    await page.goto(path);
    if (!(await redesignReportsOn(page))) {
      await expect(page.locator(tableSelector)).toBeVisible();
      continue;
    }
    const detail = page.locator(detailSelector),
      table = page.locator(tableSelector);
    await expect(detail).toBeVisible();
    await expect(detail).not.toHaveAttribute('open');
    const original = await table.textContent();
    await page.emulateMedia({ media: 'print' });
    await expect(table).toBeVisible();
    await expect(table).toHaveText(original!);
    await page.emulateMedia({ media: 'screen' });
    await expect(detail).not.toHaveAttribute('open');
  }
});
