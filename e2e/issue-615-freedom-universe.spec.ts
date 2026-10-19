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
  } finally {
    opened.close();
  }
}

async function inspectFreedom(page: Page, info: TestInfo) {
  await page.goto('/vermoegen/freiheit');
  await info.attach('freedom-browser-profile.json', {
    body: JSON.stringify({
      engine: page.context().browser()?.browserType().name(),
      version: page.context().browser()?.version(),
      ...(await page.evaluate(() => ({
        width: innerWidth,
        coarsePointer: matchMedia('(pointer: coarse)').matches,
        touchPoints: navigator.maxTouchPoints,
        pixelRatio: devicePixelRatio,
      }))),
    }),
    contentType: 'application/json',
  });
  const section = page.locator('section', {
    has: page.getByRole('heading', { name: 'Weg zum Ziel' }),
  });
  await expect(
    section.getByText('Kontenauswahl Stand heute · gilt auch für historische Bewertungen.'),
  ).toBeVisible();
  await expect(section.getByTestId('freedom-chart')).toBeVisible();
  const sources = page.locator('#freedom-accounts');
  await expect(sources.getByRole('row')).toHaveCount(4);
  await expect(sources).toContainText('Selected savings');
  await expect(sources).not.toContainText('Excluded brokerage');
  await expect(sources).toContainText('−20,00');
  const response = await page.request.get('/api/wealth/freedom');
  expect(await response.json()).toMatchObject({ investedCents: 25000, targetCents: 30000 });
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished),
      );
    });
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`freedom-selection-${colorScheme}.png`),
      fullPage: true,
    });
  }
  // The documented shortcut is available in both the desktop and compact phone shell.
  await page.keyboard.press('Control+Shift+H');
  await expect(sources).not.toContainText('200,00');
  await expect(sources).not.toContainText('70,00');
  await expect(sources).not.toContainText('20,00');
  await expect(sources).toContainText('•••');
  await expect(
    section.getByText('Kontenauswahl Stand heute · gilt auch für historische Bewertungen.', {
      exact: true,
    }),
  ).toBeVisible();
}

test('Freiheit explains the shared current account selection beside its curve and preserves privacy', async ({
  page,
  isolatedLedger,
}, info) => {
  seed(isolatedLedger.databasePath);
  await inspectFreedom(page, info);
});

test('the same selection and privacy fit an explicit 1440px desktop context', async ({
  browser,
  isolatedLedger,
}, info) => {
  seed(isolatedLedger.databasePath);
  const desktop = await browser.newContext({
    baseURL: isolatedLedger.origin,
    storageState: isolatedLedger.storageState,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    serviceWorkers: 'block',
  });
  try {
    const page = await desktop.newPage();
    await page.clock.setFixedTime(new Date('2024-02-01T12:00:00+01:00'));
    expect(
      await page.evaluate(() => ({
        width: innerWidth,
        coarsePointer: matchMedia('(pointer: coarse)').matches,
        touchPoints: navigator.maxTouchPoints,
        pixelRatio: devicePixelRatio,
      })),
    ).toEqual({ width: 1440, coarsePointer: false, touchPoints: 0, pixelRatio: 1 });
    await inspectFreedom(page, info);
  } finally {
    await desktop.close();
  }
});
