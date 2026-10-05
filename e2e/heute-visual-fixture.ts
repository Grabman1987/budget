import {
  createTestDatabase,
  ensureDefaultRules,
  heute,
  matchOccurrences,
  refreshOccurrences,
} from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { expect, type Page } from '@playwright/test';

/** Only shell visuals use this read model; behavior tests keep the real HTTP API. */
export async function freezeHeuteVisual(page: Page) {
  const { db, close } = createTestDatabase();
  let body: string;
  try {
    seedDatabase(db);
    ensureDefaultRules(db);
    refreshOccurrences(db, '2026-09-17');
    matchOccurrences(db, '2026-09-17');
    body = JSON.stringify(heute(db, { today: '2026-09-17', period: 'month' }));
  } finally {
    close();
  }
  await page.route('**/api/heute?**', async (route) => {
    // Load the technical label face before SVG text metrics are read on mount.
    await page.evaluate(async () => {
      await Promise.all([
        document.fonts.load('600 12px "Barlow Semi Condensed"'),
        document.fonts.load('400 12px "Barlow Semi Condensed"'),
      ]);
      await document.fonts.ready;
    });
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });
}

export async function expectHeuteVisualReady(page: Page) {
  await expect(page.getByTestId('heute-lead-value')).toContainText('988,26');
  await expect(page.getByTestId('heute-balance-chart')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gesamtvermögen', exact: true })).toBeVisible();
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
