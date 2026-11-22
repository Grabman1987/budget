import AxeBuilder from '@axe-core/playwright';
import type { IncomeReportData } from '../apps/web/src/reports/month-api';
import { expect, sampleTest as test } from './sample';
import { withShellControls } from './shell-actions';
import { redesignReportsOn } from './report-frame';

test('open expectations lead the income reader; received rows remain available and private', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('income-expectations-initialized')) {
      localStorage.removeItem('budget-report-r8-income-received');
      sessionStorage.setItem('income-expectations-initialized', '1');
    }
  });
  await page.route('**/api/reports/month/income*', async (route) => {
    const response = await route.fetch();
    const data: IncomeReportData = await response.json();
    const month = new URL(route.request().url()).searchParams.get('month')!;
    const prior = month === '2025-08';
    const lines = (
      ['pending', 'missing', 'overdue', 'unlinked', 'diff', 'ok', 'unplanned'] as const
    ).map((status) => ({
      key: status,
      name: `Synthetic ${prior ? 'previous ' : ''}${status}`,
      sub: 'Synthetic payment',
      typeId: null,
      dueDate: `${month}-15`,
      status,
      expectedCents: prior ? 12345 : 10001,
      receivedCents: 7001,
      differenceCents: -3000,
    }));
    await route.fulfill({ response, json: { ...data, expected: { ...data.expected, lines } } });
  });
  await page.goto('/reports/einnahmen?monat=2026-08');
  const section = page.getByRole('region', { name: 'Erwartet gegen eingegangen', exact: true });
  await expect(section).toBeVisible();
  if (!(await redesignReportsOn(page))) {
    await expect(section.getByText('Synthetic pending')).toBeVisible();
    await expect(section.getByText('Synthetic ok')).toBeVisible();
    await expect(section.locator('[data-r8-detail="income-previous-year"]')).toHaveCount(0);
    return;
  }
  await expect(page.locator('.income-report > section').first()).toHaveAttribute(
    'aria-labelledby',
    'inc-exp-title',
  );
  const received = section.locator('[data-r8-detail="income-received"]');
  const open = section.locator('[data-testid="income-expected"] > .mr-scroll');
  const prior = section.locator('[data-r8-detail="income-previous-year"]');
  await expect(prior.locator('summary')).toHaveText('Vorjahr · Aug 2025');
  await expect(prior).not.toHaveAttribute('open');
  await expect(received).not.toHaveAttribute('open');
  for (const status of ['pending', 'missing', 'overdue', 'unlinked', 'diff'])
    await expect(open.locator(`tr[data-status="${status}"]`)).toBeVisible();
  await expect(received.locator('tr[data-status="ok"]')).toBeHidden();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`expectations-${theme}.png`), fullPage: true });
  }
  await received.locator('summary').click();
  await expect(received.locator('tr[data-status="ok"]')).toBeVisible();
  await expect(received.locator('tr[data-status="unplanned"]')).toBeVisible();
  await prior.locator('summary').click();
  await expect(prior.getByText('Synthetic previous pending')).toBeVisible();
  await expect(prior).toContainText('123,45 €');
  await withShellControls(page, async ({ privacy }) => {
    await privacy.click();
  });
  await expect(section).not.toContainText('100,01');
  await expect(prior).not.toContainText('123,45');
  await expect(section).not.toContainText('70,01');
  await expect(section).not.toContainText('30,00');
  await expect(section).toContainText('••• €');
  await page.reload();
  await expect(page.locator('[data-r8-detail="income-received"]')).toHaveAttribute('open');
});
