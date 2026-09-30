import { test as base } from '@playwright/test';
import { SAMPLE_URL, STORAGE_STATE_SAMPLE } from '../playwright.config';

export { SAMPLE_URL };

/** The prototype's reference day and time; the server runs with `BUDGET_TODAY=2026-09-17`. */
export const SAMPLE_NOW = '2026-09-17T08:30:00+02:00';

/**
 * `test` for specs that run against the seeded sample server (see the convention in
 * `playwright.config.ts`): its base URL and session, the browser clock fixed to `SAMPLE_NOW`, light
 * scheme and reduced motion. Override per spec with `sampleTest.use({ colorScheme: 'dark' })` or
 * `{ reducedMotion: 'no-preference' }`; the viewport comes from the desktop/mobile project.
 */
export const sampleTest = base.extend({
  baseURL: SAMPLE_URL,
  storageState: STORAGE_STATE_SAMPLE,
  colorScheme: ['light', { option: true }],
  reducedMotion: ['reduce', { option: true }],
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(new Date(SAMPLE_NOW));
    await use(page);
  },
});

export { expect } from '@playwright/test';
