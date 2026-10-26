import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('local Sondertilgung reproduces V16 without a write', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  const origin = isolatedLedger.origin;
  const created = await request.post(`${origin}/api/accounts`, {
    headers: { origin },
    data: {
      name: 'Kredit Szenario Muster',
      type: 'loan',
      openingDate: '2026-10-01',
      openingBalanceCents: -420_000,
      interestRateBp: 400,
      installmentCents: 20_000,
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
  await expect(section.getByText('Schuldenfrei:')).toContainText('Juli 2028');
  await expect(section.getByText('Zinsen gesamt:')).toContainText('161,57 €');
  const oneOff = section.getByLabel(/Einmalige Sondertilgung/);
  await oneOff.fill('500');
  await expect(section.getByRole('alert')).toContainText('Monat');
  await expect(section.locator('.debt-live-result')).toHaveCount(0);
  await section.getByLabel('Monat der Einmalzahlung').fill('2026-11');
  await expect(section.locator('.debt-live-result')).toContainText('2 Monate früher schuldenfrei');
  await expect(section.locator('.debt-live-result')).toContainText('32,63 €');
  await expect(section.locator('.debt-live-result')).toContainText('Mai 2028 statt Juli 2028');
  const chart = page.getByTestId('debt-plan-chart');
  await expect(chart.locator('path.l-forecast')).toHaveCount(1);
  await expect(chart).toContainText('Szenario: 05.2028');
  const years = section.locator('.debt-live-years table');
  await expect(years).toContainText('Live-Szenario');
  await expect(years).toContainText('2028');
  await expect(years).toContainText('128,94 €');
  const monthly = section.getByLabel('Sondertilgung / Monat (EUR)');
  await monthly.fill('10');
  await expect(section.locator('.debt-live-result')).not.toContainText('32,63 €');
  await monthly.fill('0');
  await expect(section.locator('.debt-live-result')).toContainText('32,63 €');

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
      for (const control of [
        oneOff,
        section.getByLabel('Sondertilgung / Monat (EUR)'),
        section.getByLabel('Monat der Einmalzahlung'),
      ])
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath(`debt-live-612-${theme}.png`), fullPage: true });
  }
  await section.locator('.chart-data-table > summary').click();
  if (info.project.name !== 'desktop') await page.locator('.m-head .m-profile summary').click();
  await page.getByRole('button', { name: 'Beträge verbergen', exact: true }).click();
  await expect(section).not.toContainText('32,63 €');
  await expect(section).not.toContainText('128,94 €');
  await expect(section.locator('.chart-data-table table')).toContainText('•••');
  await page.getByRole('button', { name: 'Beträge verbergen', exact: true }).click();
  await page.reload();
  await expect(section.locator('.debt-live-result')).toHaveCount(0);
  await expect(section.getByLabel(/Einmalige Sondertilgung/)).toHaveValue('0');
  expect(writes).toEqual([]);
});
