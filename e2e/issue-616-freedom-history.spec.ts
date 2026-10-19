import AxeBuilder from '@axe-core/playwright';
import { openDatabase } from '@budget/db';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { test } from './isolated-ledger';
import { freedomUniverseFixture615 } from '../packages/db/src/repos/freedom-universe-fixture-615';

test.use({ ledgerToday: '2024-02-01' });

function seed(databasePath: string) {
  const opened = openDatabase(databasePath);
  try {
    freedomUniverseFixture615(opened);
    opened.sqlite.exec(`
      UPDATE rule SET params_json='{"multiple":100}' WHERE code='R16';
      INSERT INTO security (id,name,kind,currency) VALUES ('history-fund','Synthetic USD fund','etf','USD');
      INSERT INTO holding (id,account_id,security_id,as_of,units_e8) VALUES
        ('history-h','selected','history-fund','2023-11-15',100000000);
      INSERT INTO price (security_id,date,price_micro,currency,source) VALUES
        ('history-fund','2023-12-01',100000000,'USD','manual');
      INSERT INTO fx_rate (currency,date,rate_micro) VALUES ('USD','2024-01-01',2000000);
    `);
  } finally {
    opened.close();
  }
}

async function inspect(page: Page, info: TestInfo, profile: string, hasTouch: boolean) {
  await page.goto('/vermoegen/freiheit');
  const response = await page.request.get('/api/wealth/freedom');
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    investedCents: 45000,
    targetCents: 120000,
    investedHistory: {
      availableFrom: '2023-10-01',
      monthEnds: [
        { date: '2023-10-31', investedCents: 25000 },
        { date: '2023-11-30', investedCents: null },
        { date: '2023-12-31', investedCents: null },
        { date: '2024-01-31', investedCents: 45000 },
      ],
      current: { date: '2024-02-01', investedCents: 45000 },
    },
  });
  await page.getByLabel('Sparrate pro Monat', { exact: true }).fill('100');
  await page.getByLabel('Rendite nach Inflation', { exact: true }).selectOption('0');
  const chart = page.getByTestId('freedom-chart');
  await expect(chart).toBeVisible();
  await expect(chart.getByTestId('freedom-actual-segment')).toHaveCount(2);
  await expect(chart.locator('.l-forecast')).toHaveCount(1);
  await expect(chart.locator('.report-trend-line')).toHaveCount(0);
  const group = page.getByRole('group', { name: /Investiertes Vermögen: Ist/ });
  await group.focus();
  const tooltip = page.locator('.chart-tooltip');
  await expect(tooltip).toContainText('31.10.2023');
  await expect(tooltip).toContainText('250,00');
  await page.keyboard.press('ArrowRight');
  await expect(tooltip).toContainText('30.11.2023');
  await expect(tooltip).toContainText('–');
  await page.keyboard.press('ArrowRight');
  await expect(tooltip).toContainText('31.12.2023');
  await page.keyboard.press('ArrowRight');
  await expect(tooltip).toContainText('31.01.2024');
  await expect(tooltip).toContainText('450,00');
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  // Pointer and genuine touch use the same SVG coordinate selection, without an artificial hit target.
  const first = chart.locator('circle.dot-actual').first();
  if (hasTouch) {
    await chart.evaluate((element) =>
      element.addEventListener(
        'pointerdown',
        (event) => {
          element.setAttribute('data-test-pointer-type', (event as PointerEvent).pointerType);
        },
        { once: true },
      ),
    );
    await first.tap();
    await expect(chart).toHaveAttribute('data-test-pointer-type', 'touch');
  } else await first.hover();
  await expect(tooltip).toContainText('31.10.2023');
  await expect(tooltip).toContainText('250,00');
  await page.keyboard.press('Escape');
  await page
    .getByText('Ist-Werte als Tabelle · fehlende Bewertungen bleiben Lücken', { exact: true })
    .click();
  const historyTable = page.getByTestId('freedom-history-table');
  await expect(historyTable.getByRole('row')).toHaveCount(6);
  await expect(historyTable.getByRole('row', { name: /30.11.2023/ })).toContainText(
    'nicht bewertbar',
  );
  await expect(historyTable.getByRole('row', { name: /31.12.2023/ })).toContainText(
    'nicht bewertbar',
  );
  await expect(historyTable.getByRole('row', { name: /01.02.2024/ })).toContainText('Heute');
  const toggle = page.getByRole('switch', { name: 'Prognosewerte als Tabelle' });
  await toggle.click();
  await expect(page.getByTestId('freedom-table').getByRole('row')).toHaveCount(3);
  await expect(page.getByTestId('freedom-table')).toContainText('1.250,00');
  await toggle.click();
  const box = await toggle.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const summaryBox = await page
    .getByText('Ist-Werte als Tabelle · fehlende Bewertungen bleiben Lücken', { exact: true })
    .boundingBox();
  expect(summaryBox!.height).toBeGreaterThanOrEqual(44);
  await info.attach(`${profile}-runtime.json`, {
    body: JSON.stringify({
      engine: page.context().browser()?.browserType().name(),
      version: page.context().browser()?.version(),
      configuredHasTouch: hasTouch,
      ...(await page.evaluate(() => ({
        width: innerWidth,
        coarsePointer: matchMedia('(pointer: coarse)').matches,
        touchPoints: navigator.maxTouchPoints,
        pixelRatio: devicePixelRatio,
      }))),
    }),
    contentType: 'application/json',
  });
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    // Full-page WebKit capture otherwise positions sticky chrome at the inspector's scroll offset.
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished),
      );
    });
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`freedom-history-${profile}-${colorScheme}.png`),
      fullPage: true,
    });
  }
  await group.focus();
  await expect(tooltip).toContainText('250,00');
  await page.keyboard.press('Control+Shift+H');
  await expect(tooltip).not.toContainText('250,00');
  await expect(tooltip).toContainText('•••');
  await expect(historyTable).not.toContainText('250,00');
  await expect(historyTable).not.toContainText('450,00');
  await expect(historyTable).toContainText('•••');
}

test('dated actual values, visible gaps, keyboard/touch and privacy use the canonical browser profile', async ({
  page,
  isolatedLedger,
}, info) => {
  test.setTimeout(60000);
  seed(isolatedLedger.databasePath);
  await inspect(page, info, info.project.name, Boolean(info.project.use.hasTouch));
});

test('actual history and forecast fit an explicit 1440px desktop context', async ({
  browser,
  isolatedLedger,
}, info) => {
  test.setTimeout(60000);
  seed(isolatedLedger.databasePath);
  const context = await browser.newContext({
    baseURL: isolatedLedger.origin,
    storageState: isolatedLedger.storageState,
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2024-02-01T12:00:00+01:00'));
    expect(
      await page.evaluate(() => ({
        width: innerWidth,
        coarsePointer: matchMedia('(pointer: coarse)').matches,
        touchPoints: navigator.maxTouchPoints,
        pixelRatio: devicePixelRatio,
      })),
    ).toEqual({ width: 1440, coarsePointer: false, touchPoints: 0, pixelRatio: 1 });
    await inspect(page, info, `${info.project.name}-desktop1440`, false);
  } finally {
    await context.close();
  }
});
