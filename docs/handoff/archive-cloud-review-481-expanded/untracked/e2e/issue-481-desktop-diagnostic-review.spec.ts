import { devices, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, SAMPLE_NOW, SAMPLE_URL } from './sample';
import { STORAGE_STATE_SAMPLE } from '../playwright.config';
import { mkdirSync, writeFileSync } from 'node:fs';

// External reviewer evidence only. Real Desktop Safari context, not Chromium acceptance.
test('current Plan bands at genuine Desktop Safari 1440px', async ({ browser }) => {
  const context = await browser.newContext({
    ...devices['Desktop Safari'],
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    baseURL: SAMPLE_URL,
    storageState: STORAGE_STATE_SAMPLE,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date(SAMPLE_NOW));
    await page.goto('/plan/monat?monat=2026-09');
    await page.evaluate(() => { document.documentElement.dataset['theme'] = 'light'; });
    await page.evaluate(() => document.fonts.ready);
    const table = page.locator('.ptable-zero');
    await expect(table.locator('tbody > tr:not(.pgroup-gap)')).toHaveCount(36);
    await expect(table.locator('.pname[data-category-id]')).toHaveCount(36);
    await expect(table.locator('.psingle')).toHaveCount(19);
    await expect(table.locator('.pmulti')).toHaveCount(8);
    const response = await page.request.get('/api/budget/2026-09');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    const visible = data.categories.filter((category: { hiddenAt: string | null }) => !category.hiddenAt);
    expect(data.groups).toHaveLength(19);
    expect(visible).toHaveLength(36);
    const geometry = await table.evaluate((element) => ({
      tableHeight: element.getBoundingClientRect().height,
      documentWidth: document.documentElement.scrollWidth,
      viewport: { width: innerWidth, height: innerHeight },
      logicalRows: element.querySelectorAll('tbody > tr:not(.pgroup-gap)').length,
      observedTouchPoints: navigator.maxTouchPoints,
      observedCoarsePointer: matchMedia('(pointer: coarse)').matches,
      userAgent: navigator.userAgent,
      fontsStatus: document.fonts.status,
    }));
    expect(geometry.documentWidth).toBeLessThanOrEqual(1440);
    expect(geometry.viewport).toEqual({ width: 1440, height: 900 });
    expect(geometry.observedTouchPoints).toBe(0);
    expect(geometry.observedCoarsePointer).toBe(false);
    expect(geometry.userAgent).not.toContain('iPhone');
    expect(geometry.fontsStatus).toBe('loaded');
    const violations = (await new AxeBuilder({ page }).include('main').analyze()).violations;
    expect(violations).toEqual([]);
    const directory = 'test-results/review-481-desktop-proof';
    mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: `${directory}/desktop-safari-1440-light.png`, fullPage: true, animations: 'disabled' });
    writeFileSync(`${directory}/desktop-safari-1440-metrics.json`, JSON.stringify({
      sourceCommit: 'f922dfba7bbf14b867492aa58897bfc6f6908c1c',
      profile: 'genuine Desktop Safari diagnostic; not canonical Chromium acceptance',
      engine: 'WebKit', browserVersion: browser.version(), theme: 'light',
      configuredDesktopFlags: { isMobile: false, hasTouch: false },
      oldRows: 55, newRows: 36, reductionPercent: 34.54545454545455,
      axeViolations: violations.length, ...geometry,
    }, null, 2) + '\n');
  } finally {
    await context.close();
  }
});
