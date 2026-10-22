import {
  createTestDatabase,
  ensureDefaultRules,
  heute,
  liquidityReportView,
  listExpectedPayments,
  matchOccurrences,
  refreshOccurrences,
} from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { expect, type Page } from '@playwright/test';

/** Only shell visuals use this read model; behavior tests keep the real HTTP API. */
export async function freezeHeuteVisual(page: Page) {
  const { db, close } = createTestDatabase();
  let body: string;
  let forecastBody: string;
  let paymentsBody: string;
  try {
    seedDatabase(db);
    ensureDefaultRules(db);
    refreshOccurrences(db, '2026-09-17');
    matchOccurrences(db, '2026-09-17');
    body = JSON.stringify(heute(db, { today: '2026-09-17', period: 'payday' }));
    forecastBody = JSON.stringify(
      liquidityReportView(db, '2026-09-17', { horizon: '35d', levers: [] }),
    );
    paymentsBody = JSON.stringify({ payments: listExpectedPayments(db, '2026-09-17') });
  } finally {
    close();
  }
  const loadChartFonts = async () => {
    // Load the technical label face before SVG text metrics are read on mount.
    await page.evaluate(async () => {
      await Promise.all([
        document.fonts.load('600 12px "Barlow Semi Condensed"'),
        document.fonts.load('400 12px "Barlow Semi Condensed"'),
      ]);
      await document.fonts.ready;
    });
  };
  await page.route('**/api/heute?**', async (route) => {
    await loadChartFonts();
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });
  await page.route('**/api/liquidity?horizon=35d', async (route) => {
    await loadChartFonts();
    await route.fulfill({ status: 200, contentType: 'application/json', body: forecastBody });
  });
  await page.route('**/api/expected', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: paymentsBody }),
  );
}

export async function expectHeuteVisualReady(page: Page) {
  // #571: Frei bis Gehalt (the lead figure) is the middle Kennzahl in the mode Bis Gehalt.
  await expect(page.getByTestId('heute-lead-value')).toContainText('988,26');
  await expect(page.getByTestId('heute-kennzahlen').getByRole('heading', { level: 2 })).toHaveText([
    'Zu verteilen',
    'Frei bis Gehalt',
    'Nettovermögen',
  ]);
  const forecast = page.locator('section[aria-labelledby="heute-forecast-title"]');
  await expect(forecast.getByTestId('liquidity-chart')).toBeVisible();
  await expect(forecast.getByTestId('liquidity-mark-heute')).toHaveText('HEUTE');
  await expect(forecast.locator('.heute-forecast-low')).toHaveAttribute(
    'data-day',
    /\d{4}-\d{2}-\d{2}/,
  );
  await expect(
    page.getByRole('heading', { name: 'Nettovermögen · 12 Monate', exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    );
  });
}
