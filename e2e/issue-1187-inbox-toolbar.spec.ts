import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-09-17' });

for (const theme of ['light', 'dark'] as const) {
  test(`inbox return link leads the aligned toolbar (${theme})`, async ({
    page,
    isolatedLedger,
  }, info) => {
    void isolatedLedger;
    await page.addInitScript((value) => localStorage.setItem('budget-theme', value), theme);
    await page.route('**/api/bank-sync/recap', (route) =>
      route.fulfill({
        json: {
          accounts: [
            {
              sourceId: 'synthetic-source',
              accountId: 'synthetic-account',
              name: 'Synthetic account',
              syncedAt: null,
              result: null,
              open: 0,
              openTotal: 0,
              running: false,
              status: 'active',
            },
          ],
        },
      }),
    );
    await page.goto('/konten/pruefen?teil=umsaetze&von=%2Fkonten%2Fbuchungen');
    await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
    const toolbar = page.locator('.konten-frame-inbox .konten-view-bar');
    const back = toolbar.getByRole('link', { name: 'Zurück zur vorherigen Ansicht' });
    const menu = toolbar.locator('.area-page-menu > summary');
    const segments = toolbar.locator('.inbox-segments');
    const filter = toolbar.getByLabel('Filter', { exact: true });
    const recap = page.locator('.bank-v1-table');
    await expect(back).toHaveAttribute('href', '/konten/buchungen');
    await expect(recap).toBeVisible();
    await expect(recap).toContainText('Synthetic account');
    for (const control of [back, menu, segments, filter]) await expect(control).toBeVisible();
    const boxes = await Promise.all(
      [back, menu, segments, filter, toolbar, recap].map((item) => item.boundingBox()),
    );
    const [b, m, s, f, t, r] = boxes.map((box) => box!);
    expect(b.x).toBe(t.x);
    expect(r.x).toBe(t.x);
    if (page.viewportSize()!.width >= 1440) {
      expect(m.x).toBeGreaterThanOrEqual(b.x + b.width);
      for (const box of [m, s, f]) {
        expect(Math.abs(box.y + box.height / 2 - (b.y + b.height / 2))).toBeLessThanOrEqual(1);
      }
    } else if (page.viewportSize()!.width < 768) {
      expect(m.y).toBeGreaterThanOrEqual(b.y + b.height);
      expect(s.y).toBeGreaterThanOrEqual(m.y + m.height);
      expect(Math.abs(f.y + f.height / 2 - (s.y + s.height / 2))).toBeLessThanOrEqual(1);
      expect(s.x + s.width).toBeLessThanOrEqual(f.x);
    }
    for (const box of [b, m, s, f]) {
      expect(box.x).toBeGreaterThanOrEqual(t.x);
      expect(box.x + box.width).toBeLessThanOrEqual(t.x + t.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`inbox-toolbar-${theme}.png`) });
    await back.click();
    await expect(page).toHaveURL(/\/konten\/buchungen$/);
  });
}
