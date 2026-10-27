import AxeBuilder from '@axe-core/playwright';
import { openDatabase, schema } from '@budget/db';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-09-17' });

function seed(path: string, savings = false) {
  const opened = openDatabase(path);
  try {
    opened.db.insert(schema.account).values({
      id: 'depot', name: 'Synthetic depot', type: 'brokerage', role: 'investment',
      onBudget: false, openingDate: '2026-01-01',
    }).run();
    opened.db.insert(schema.security).values({ id: 's', name: 'Synthetic instrument', kind: 'fund' }).run();
    if (savings) {
      opened.db.insert(schema.savingsPlan).values([
        { id: 'old', securityId: 's', accountId: 'depot', amountCents: 10000, dayOfMonth: 15, validFrom: '2026-01-01', validTo: '2026-06-30' },
        { id: 'new', securityId: 's', accountId: 'depot', amountCents: 20000, dayOfMonth: 15, validFrom: '2026-07-01' },
      ]).run();
      opened.db.insert(schema.trade).values([
        { id: 'may', accountId: 'depot', securityId: 's', date: '2026-05-16', kind: 'buy', unitsE8: 1_000_000_000, amountCents: 10000, savingsPlanId: 'old', savingsMonth: '2026-05' },
        { id: 'extra-manual', accountId: 'depot', securityId: 's', date: '2026-06-20', kind: 'buy', unitsE8: 500_000_000, amountCents: 5000 },
        { id: 'august', accountId: 'depot', securityId: 's', date: '2026-08-16', kind: 'buy', unitsE8: 2_000_000_000, amountCents: 20000, savingsPlanId: 'new', savingsMonth: '2026-08' },
      ]).run();
    } else {
      opened.db.insert(schema.trade).values([
        { id: 'buy', accountId: 'depot', securityId: 's', date: '2026-09-10', kind: 'buy', unitsE8: 200_000_000, amountCents: 2000 },
        { id: 'sell', accountId: 'depot', securityId: 's', date: '2026-09-12', kind: 'sell', unitsE8: -100_000_000, amountCents: 1500 },
        ...Array.from({ length: 11 }, (_, index) => ({ id: `fee-${index}`, accountId: 'depot', securityId: 's', date: '2026-09-13', kind: 'fee' as const, amountCents: 0 })),
      ]).run();
      opened.db.insert(schema.price).values([
        { securityId: 's', date: '2026-09-10', priceMicro: 10_000_000, currency: 'EUR', source: 'manual' },
        { securityId: 's', date: '2026-09-11', priceMicro: 12_345_000, currency: 'EUR', source: 'manual' },
        { securityId: 's', date: '2026-09-12', priceMicro: 15_000_000, currency: 'EUR', source: 'manual' },
        { securityId: 's', date: '2026-09-17', priceMicro: 17_500_000, currency: 'EUR', source: 'manual' },
      ]).run();
    }
  } finally {
    opened.close();
  }
}
function snapshot(path: string) {
  const opened = openDatabase(path);
  try {
    return JSON.stringify({
      trades: opened.db.select().from(schema.trade).all(),
      plans: opened.db.select().from(schema.savingsPlan).all(),
    });
  } finally {
    opened.close();
  }
}
async function themes(page: Page, info: TestInfo, name: string) {
  if (name === 'instrument') await page.getByTestId('instrument-value-chart').scrollIntoViewIfNeeded();
  else await page.getByRole('region', { name: 'Letzte zwölf Monate', exact: true }).scrollIntoViewIfNeeded();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset['theme'] = value; }, theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (info.project.name !== 'desktop') {
      for (const control of await page.locator('main button, main a, main summary').all()) {
        if (!(await control.isVisible())) continue;
        const box = (await control.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }
    await page.screenshot({ path: info.outputPath(`${name}-${theme}.png`), fullPage: false });
  }
}

test('547 instrument shares literal value/basis and dates, hover/keyboard and last-twelve row editing', async ({ page, isolatedLedger }, info) => {
  seed(isolatedLedger.databasePath);
  const before = snapshot(isolatedLedger.databasePath);
  const response = await page.request.get('/api/securities/s/history?from=2026-09-10&to=2026-09-17');
  expect(response.ok()).toBe(true);
  const history = (await response.json()).history;
  expect(history.points.at(-1)).toMatchObject({ date: '2026-09-17', unitsE8: 100_000_000, valueCents: 1750 });
  expect(history.position).toMatchObject({ valueCents: 1750, costCents: 1000 });
  await page.goto('/vermoegen/portfolio/instrument/s?zeitraum=Alles');
  await expect(page.getByRole('button', { name: 'Wert €', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const chart = page.getByTestId('instrument-value-chart');
  await expect(chart).toBeVisible();
  expect(await chart.locator('[data-trade-date]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-trade-date')))).toEqual(['2026-09-10', '2026-09-12']);
  expect(await chart.locator('.instrument-cost-line').evaluate((line) => getComputedStyle(line).strokeDasharray)).not.toBe('none');
  const inspect = chart.locator('..');
  await inspect.focus();
  await inspect.press('ArrowRight');
  await expect(page.locator('.chart-tooltip')).toContainText('11.09.2026');
  await expect(page.locator('.chart-tooltip')).toContainText('24,69 €');
  await expect(page.locator('.chart-tooltip')).toContainText('Stück');
  await expect(page.locator('.chart-tooltip')).toContainText('10,00 €');
  const keyboard = await page.locator('.chart-tooltip').innerText();
  await inspect.press('Escape');
  const box = (await chart.boundingBox())!;
  const target = { x: box.x + 64 + (box.width - 80) / 7, y: box.y + 80 };
  if (info.project.use.hasTouch) await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.move(target.x, target.y);
  await expect(page.locator('.chart-tooltip')).toHaveText(keyboard);
  await inspect.press('Escape');
  const trades = page.locator('.trade-list tbody tr');
  await expect(trades).toHaveCount(12);
  await page.getByRole('button', { name: 'Alle anzeigen (13)', exact: true }).click();
  await expect(trades).toHaveCount(13);
  await trades.first().locator('td').first().click();
  await expect(page.getByRole('dialog', { name: 'Handel bearbeiten', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await trades.first().getByRole('button').focus();
  await trades.first().getByRole('button').press('Enter');
  await expect(page.getByRole('dialog', { name: 'Handel bearbeiten', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await themes(page, info, 'instrument');
  await page.getByRole('button', { name: 'Kurs', exact: true }).click();
  await expect(page.getByTestId('price-history-chart')).toBeVisible();
  await expect(page.getByTestId('price-history-chart').locator('[data-chart-point]')).toHaveCount(4);
  expect(snapshot(isolatedLedger.databasePath)).toBe(before);
});

test('548 twelve months keep explicit executions, missing inbox proposals and extra manual buys', async ({ page, isolatedLedger }, info) => {
  seed(isolatedLedger.databasePath, true);
  const before = snapshot(isolatedLedger.databasePath);
  const proposals = async () => (await (await page.request.get('/api/savings-plans/execution-proposals')).json()).proposals;
  const pending = await proposals();
  expect(pending.find((proposal: { month: string }) => proposal.month === '2026-07')).toMatchObject({ planId: 'new', amountCents: 20000 });
  await page.goto('/vermoegen/portfolio/sparplan/new');
  const months = page.getByRole('region', { name: 'Letzte zwölf Monate', exact: true });
  await expect(months.getByRole('listitem')).toHaveCount(12);
  const slot = (month: string) => months.getByRole('listitem').filter({ has: page.getByText(month, { exact: true }) });
  await expect(slot('2026-05')).toContainText('Ausgeführt · zugeordnet');
  await expect(slot('2026-05')).toContainText('100,00 €');
  await expect(slot('2026-05')).toContainText('Stück: 10');
  await expect(slot('2026-07')).toContainText('Zuordnung fehlt');
  await expect(slot('2026-07')).toContainText('Geplant: 200,00 €');
  await expect(slot('2026-08')).toContainText('200,00 €');
  await expect(slot('2026-08')).toContainText('Stück: 20');
  await expect(page.getByTestId('savings-paid')).toHaveText('350,00 €');
  await expect(page.getByTestId('savings-next')).toHaveText('15.10.2026 · 200,00 €');
  await expect(page.locator('.savings-purchases')).not.toHaveAttribute('open', '');
  await expect(page.locator('.savings-versions')).not.toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(2 * page.viewportSize()!.height);
  await themes(page, info, 'savings');
  await page.locator('.savings-purchases > summary').click();
  await expect(page.locator('.savings-purchases .trade-list tbody tr')).toHaveCount(3);
  await expect(page.locator('[data-trade-id="extra-manual"]')).toContainText('50,00');
  expect(await proposals()).toEqual(pending);
  expect(snapshot(isolatedLedger.databasePath)).toBe(before);
});
