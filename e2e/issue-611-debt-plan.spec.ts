import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

/** #611: one isolated synthetic loan; 100 € / 25 € = four exact monthly payments. */
test('twelve actual month ends and the saved loan plan share exact chart and table values', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  const origin = isolatedLedger.origin;
  const created = await request.post(`${origin}/api/accounts`, {
    headers: { origin },
    data: {
      name: 'Kredit Verlauf Muster',
      type: 'loan',
      openingDate: '2025-10-01',
      openingBalanceCents: -10_000,
      interestRateBp: 0,
      installmentCents: 2_500,
      monthlyFeeCents: 0,
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { account } = (await created.json()) as { account: { id: string } };
  const writes: string[] = [];
  page.on('request', (outgoing) => {
    if (new URL(outgoing.url()).pathname.startsWith('/api/') && outgoing.method() !== 'GET')
      writes.push(`${outgoing.method()} ${new URL(outgoing.url()).pathname}`);
  });

  await page.goto(`/vermoegen/schulden?kredit=${encodeURIComponent(account.id)}`);
  const section = page.locator('.debt-plan-history');
  const chart = page.getByTestId('debt-plan-chart');
  await expect(chart).toBeVisible();
  await expect(section.getByText('Schuldenfrei:')).toContainText('Jänner 2027');
  await expect(section.getByText('Zinsen gesamt:')).toContainText('0,00 €');
  await expect(chart.locator('path.l-actual')).toHaveCount(1);
  await expect(chart.locator('path.l-plan')).toHaveCount(1);

  const tableToggle = section.locator('.chart-data-table > summary');
  await tableToggle.click();
  const table = section.locator('.chart-data-table table');
  const actual = table.locator('tbody tr').filter({ hasText: 'Ist · tatsächliches Monatsende' });
  await expect(actual).toHaveCount(12);
  await expect(actual.first()).toContainText('31.10.2025');
  await expect(actual.last()).toContainText('30.09.2026');
  await expect(actual).toContainText(Array(12).fill('100,00 €'));
  for (const [date, amount] of [
    ['31.10.2026', '75,00 €'],
    ['30.11.2026', '50,00 €'],
    ['31.12.2026', '25,00 €'],
    ['31.01.2027', '0,00 €'],
  ] as const) {
    await expect(table.locator('tbody tr').filter({ hasText: date })).toContainText(amount);
  }
  await page.getByText('Rechenweg', { exact: true }).click();
  await expect(page.getByLabel('Kredit für das Modell')).toHaveCount(1);
  const saved = page.getByTestId('loan-baseline');
  await expect(saved).toContainText('Jänner 2027');
  await expect(saved).toContainText('4 Monate');
  await expect(saved).toContainText('0,00 €');

  const group = chart.locator('..');
  await group.focus();
  const tooltip = page.locator('.chart-tooltip[role="status"]');
  await expect(tooltip).toContainText('100,00 €');
  await expect(tooltip.locator('.chart-tooltip-date')).toHaveText('31.10.2025');
  for (let index = 0; index < 13; index++) await page.keyboard.press('ArrowRight');
  await expect(tooltip.locator('.chart-tooltip-date')).toHaveText('31.10.2026');
  await expect(tooltip).toContainText('75,00 €');
  await page.keyboard.press('Escape');

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).include('.debts-view').analyze()).violations).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (info.project.name !== 'desktop') {
      for (const control of [section.getByLabel('Kredit für das Modell'), tableToggle]) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath(`debt-plan-611-${theme}.png`), fullPage: true });
  }

  if (info.project.name !== 'desktop') await page.locator('.m-head .m-profile summary').click();
  await page.getByRole('button', { name: 'Beträge verbergen', exact: true }).click();
  await expect(table).not.toContainText('100,00 €');
  await expect(table).toContainText('•••');
  await expect(chart.locator('line.graticule + text').first()).toHaveText('•••');
  await group.focus();
  await expect(tooltip).toContainText('•••');
  await expect(tooltip).not.toContainText('100,00 €');
  expect(writes).toEqual([]);
});
