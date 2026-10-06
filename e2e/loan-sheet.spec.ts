import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

/**
 * The scenario and rate-change dialogs of Schulden are shared form dialogs (bottom sheet on a
 * phone). Real WebKit (project `webkit-iphone`) must show them with content, not only the backdrop
 * (docs/mobile-panels.md); the desktop and Chromium phone projects run the same check.
 */
test('scenario and rate-change dialogs show their content', async ({
  page,
  request,
  isolatedLedger,
}) => {
  test.setTimeout(120_000);
  const origin = isolatedLedger.origin;
  const response = await request.post(`${origin}/api/accounts`, {
    headers: { origin },
    data: {
      name: 'Kredit Muster',
      type: 'loan',
      openingDate: '2026-09-01',
      openingBalanceCents: -1_217_600,
      interestRateBp: 632,
      installmentCents: 41_200,
    },
  });
  expect(response.ok()).toBe(true);
  await page.goto('/vermoegen/schulden');
  await page.getByText('Rechenweg', { exact: true }).click();
  for (const [button, title, field] of [
    ['Szenario anlegen', 'Szenario anlegen', 'Name des Szenarios'],
    ['Zinsänderung erfassen', 'Zinsänderung erfassen', 'Gültig ab'],
  ] as const) {
    await page.getByRole('button', { name: button, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: title });
    await expect(dialog).toBeVisible();
    // The entry animation is an enhancement; measure the settled sheet.
    await expect.poll(() => dialog.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    const box = (await dialog.boundingBox())!;
    expect(box.height).toBeGreaterThan(150);
    const viewport = page.viewportSize()!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    await expect(dialog.getByLabel(field)).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await dialog.getByRole('button', { name: 'Schließen' }).click();
    await expect(dialog).toBeHidden();
  }
});
